import { createHash } from "node:crypto";
import type { BankAccount, BankConnection } from "@prisma/client";
import { prisma } from "../db.js";
import { getBalances, getTransactions, type EbTransaction } from "../enableBanking.js";
import { categorize, normalizeLabel, type MyAccount, type Rule } from "./categorize.js";
import { detectRecurring } from "./recurring.js";

const DAY = 86_400_000;
// la DSP2 limite les accès sans la personne à ~4 par jour et par compte
const MIN_INTERVAL = 60 * 60 * 1000;
const isoDaysAgo = (days: number) => new Date(Date.now() - days * DAY).toISOString().slice(0, 10);

function mapTransaction(t: EbTransaction, seen: Map<string, number>) {
  const sign = t.credit_debit_indicator === "CRDT" ? 1 : -1;
  const amountCents = sign * Math.round(Math.abs(Number(t.transaction_amount.amount)) * 100);
  const date = t.booking_date ?? t.value_date ?? t.transaction_date ?? new Date().toISOString().slice(0, 10);
  const party = sign < 0 ? t.creditor : t.debtor;
  const partyAccount = sign < 0 ? t.creditor_account : t.debtor_account;
  const counterparty = party?.name?.trim() || null;
  const label = (t.remittance_information ?? []).join(" ").replace(/\s+/g, " ").trim() || counterparty || "Opération";

  let externalId = t.entry_reference || t.transaction_id;
  if (!externalId) {
    // pas d'identifiant fourni : empreinte du contenu, numérotée si deux opérations identiques le même jour
    const base = createHash("sha1").update(`${date}|${amountCents}|${label}`).digest("hex");
    const n = (seen.get(base) ?? 0) + 1;
    seen.set(base, n);
    externalId = `h:${base}:${n}`;
  }

  return {
    externalId,
    date,
    amountCents,
    label: label.slice(0, 300),
    labelKey: normalizeLabel(counterparty ?? label),
    counterparty,
    counterpartyIban: partyAccount?.iban ?? null,
    mcc: t.merchant_category_code ?? null,
  };
}

const BALANCE_PREFERENCE = ["CLAV", "ITAV", "XPCD", "CLBD", "ITBD"];

async function context(ownerId: string) {
  const [rules, accounts] = await Promise.all([
    prisma.categoryRule.findMany({ where: { ownerId }, select: { pattern: true, category: true } }),
    prisma.bankAccount.findMany({ where: { ownerId }, select: { iban: true, accountType: true } }),
  ]);
  return { rules: rules as Rule[], accounts: accounts as MyAccount[] };
}

async function syncAccount(account: BankAccount, ctx: Awaited<ReturnType<typeof context>>) {
  const last = await prisma.bankTransaction.findFirst({ where: { accountId: account.id }, orderBy: { date: "desc" } });
  let raw: EbTransaction[];
  if (last) {
    raw = await getTransactions(account.uid, isoDaysAgo((Date.now() - Date.parse(last.date)) / DAY + 7));
  } else {
    // première synchro : un an d'historique pour repérer le récurrent ; certaines banques limitent à 90 jours
    raw = await getTransactions(account.uid, isoDaysAgo(365)).catch(() => getTransactions(account.uid, isoDaysAgo(89)));
  }

  const seen = new Map<string, number>();
  const txs = raw.filter((t) => t.status !== "PDNG").map((t) => mapTransaction(t, seen));
  const existing = await prisma.bankTransaction.findMany({
    where: { accountId: account.id, externalId: { in: txs.map((t) => t.externalId) } },
    select: { externalId: true, categorySource: true },
  });
  const userCategorized = new Set(existing.filter((e) => e.categorySource === "USER").map((e) => e.externalId));

  for (const tx of txs) {
    const { category, source } = categorize(tx, ctx.rules, ctx.accounts, account);
    const categoryData = userCategorized.has(tx.externalId) ? {} : { category, categorySource: source };
    await prisma.bankTransaction.upsert({
      where: { accountId_externalId: { accountId: account.id, externalId: tx.externalId } },
      create: { ...tx, accountId: account.id, category, categorySource: source },
      update: { ...tx, ...categoryData },
    });
  }

  const balances = await getBalances(account.uid).catch(() => []);
  const balance = BALANCE_PREFERENCE.map((type) => balances.find((b) => b.balance_type === type)).find(Boolean) ?? balances[0];
  await prisma.bankAccount.update({
    where: { id: account.id },
    data: {
      lastSyncAt: new Date(),
      ...(balance && { balanceCents: Math.round(Number(balance.balance_amount.amount) * 100), balanceAt: new Date() }),
    },
  });
}

async function syncConnection(connection: BankConnection & { accounts: BankAccount[] }, force: boolean) {
  if (connection.validUntil < new Date()) return;
  const ctx = await context(connection.ownerId);
  for (const account of connection.accounts) {
    if (!force && account.lastSyncAt && Date.now() - account.lastSyncAt.getTime() < MIN_INTERVAL) continue;
    await syncAccount(account, ctx);
  }
}

// Synchronise toutes les banques d'une personne puis recalcule son récurrent
export async function syncOwner(ownerId: string, householdId: string, { force = false } = {}) {
  const connections = await prisma.bankConnection.findMany({ where: { ownerId }, include: { accounts: true } });
  const errors: string[] = [];
  for (const c of connections) {
    try {
      await syncConnection(c, force);
    } catch (e) {
      errors.push(`${c.aspspName} : ${(e as Error).message}`);
    }
  }
  await detectRecurring(ownerId, householdId);
  return errors;
}

// Après une correction ou une nouvelle règle : recatégorise tout ce que la personne n'a pas classé à la main
export async function recategorize(ownerId: string) {
  const ctx = await context(ownerId);
  const accounts = await prisma.bankAccount.findMany({ where: { ownerId } });
  for (const account of accounts) {
    const txs = await prisma.bankTransaction.findMany({ where: { accountId: account.id, categorySource: { not: "USER" } } });
    for (const tx of txs) {
      const { category, source } = categorize(tx, ctx.rules, ctx.accounts, account);
      if (category !== tx.category || source !== tx.categorySource) {
        await prisma.bankTransaction.update({ where: { id: tx.id }, data: { category, categorySource: source } });
      }
    }
  }
}

// Synchro automatique de tout le monde (lancée par le serveur toutes les 6 h)
export async function syncEveryone(log: (msg: string) => void) {
  const owners = await prisma.bankConnection.findMany({ distinct: ["ownerId"], select: { ownerId: true, householdId: true } });
  for (const o of owners) {
    const errors = await syncOwner(o.ownerId, o.householdId).catch((e: Error) => [e.message]);
    for (const err of errors) log(`synchro bancaire ${o.ownerId} — ${err}`);
  }
}

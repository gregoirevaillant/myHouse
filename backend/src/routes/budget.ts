import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { prisma } from "../db.js";
import { bankEnabled } from "../env.js";
import { CATEGORY_IDS, kindOf } from "../budget/categories.js";
import { detectRecurring, nextOccurrence, type Period } from "../budget/recurring.js";
import { recategorize } from "../budget/sync.js";

const monthParam = z.string().regex(/^\d{4}-\d{2}$/);
const category = z.enum(CATEGORY_IDS);

const monthBounds = (month: string) => ({ gte: `${month}-01`, lte: `${month}-31` });

function shiftMonth(month: string, delta: number) {
  const [y, m] = month.split("-").map(Number);
  const d = new Date(Date.UTC(y, m - 1 + delta, 1));
  return d.toISOString().slice(0, 7);
}

// montant ramené au mois, pour comparer abonnements hebdo, mensuels et annuels
const PER_MONTH: Record<Period, number> = { WEEKLY: 52 / 12, MONTHLY: 1, QUARTERLY: 1 / 3, YEARLY: 1 / 12 };
const monthlyCents = (amountCents: number, period: string) => Math.round(amountCents * PER_MONTH[period as Period]);

const publicTransaction = (t: {
  id: string;
  date: string;
  amountCents: number;
  label: string;
  labelKey: string;
  counterparty: string | null;
  category: string;
  categorySource: string;
  recurringId: string | null;
  account: { name: string };
}) => ({
  id: t.id,
  date: t.date,
  amountCents: t.amountCents,
  label: t.counterparty ?? t.label,
  detail: t.counterparty ? t.label : null,
  merchantKey: t.labelKey,
  category: t.category,
  byUser: t.categorySource === "USER",
  recurringId: t.recurringId,
  accountName: t.account.name,
});

export async function budgetRoutes(app: FastifyInstance) {
  // tout le budget est privé : uniquement les comptes de la personne connectée
  const mine = (ownerId: string) => ({ account: { ownerId } });

  app.get("/", async (req) => {
    const { month } = z.object({ month: monthParam }).parse(req.query);
    const ownerId = req.user.id;
    const [txs, items, connections, share] = await Promise.all([
      prisma.bankTransaction.findMany({
        where: { ...mine(ownerId), date: monthBounds(month) },
        include: { account: { select: { name: true } } },
        orderBy: [{ date: "desc" }, { amountCents: "asc" }],
      }),
      prisma.recurringItem.findMany({ where: { ownerId, status: "ACTIVE" } }),
      prisma.bankConnection.findMany({ where: { ownerId }, include: { accounts: { select: { lastSyncAt: true } } } }),
      prisma.expenseShare.aggregate({
        where: { userId: ownerId, expense: { householdId: req.user.householdId, isReimbursement: false, date: monthBounds(month) } },
        _sum: { amountCents: true },
      }),
    ]);

    const totals = { income: 0, outflow: 0, invested: 0 };
    const byCategory: Record<string, number> = {};
    for (const t of txs) {
      const kind = kindOf(t.category);
      if (kind === "TRANSFER") continue;
      byCategory[t.category] = (byCategory[t.category] ?? 0) + t.amountCents;
      if (kind === "INCOME") totals.income += t.amountCents;
      else if (kind === "INVESTMENT") totals.invested -= t.amountCents;
      else totals.outflow -= t.amountCents;
    }

    // échéances récurrentes du mois : déjà passées (rapprochées d'une opération) ou encore à venir
    const today = new Date().toISOString().slice(0, 10);
    const { gte: start, lte: end } = monthBounds(month);
    const recurring = items
      .map((item) => {
        const paidCents = txs.filter((t) => t.recurringId === item.id).reduce((s, t) => s + t.amountCents, 0);
        const upcoming: string[] = [];
        for (let d = item.nextDate; d <= end && upcoming.length < 6; d = nextOccurrence(d, item.period as Period)) {
          if (d >= start && d >= today) upcoming.push(d);
        }
        return { id: item.id, label: item.label, category: item.category, period: item.period, amountCents: item.amountCents, paidCents, upcoming };
      })
      .filter((r) => r.paidCents !== 0 || r.upcoming.length);

    const syncTimes = connections.flatMap((c) => c.accounts.map((a) => a.lastSyncAt?.getTime() ?? 0));
    return {
      month,
      totals,
      byCategory,
      transactions: txs.map(publicTransaction),
      recurring,
      householdShareCents: share._sum.amountCents ?? 0,
      bank: {
        enabled: bankEnabled,
        connected: connections.length > 0,
        consentUntil: connections.length ? new Date(Math.min(...connections.map((c) => c.validUntil.getTime()))).toISOString() : null,
        lastSyncAt: syncTimes.length && Math.max(...syncTimes) ? new Date(Math.max(...syncTimes)).toISOString() : null,
      },
    };
  });

  // 12 derniers mois jusqu'au mois demandé : revenus, sorties, épargne
  app.get("/trend", async (req) => {
    const { month } = z.object({ month: monthParam }).parse(req.query);
    const first = shiftMonth(month, -11);
    const txs = await prisma.bankTransaction.findMany({
      where: { ...mine(req.user.id), date: { gte: `${first}-01`, lte: `${month}-31` } },
      select: { date: true, amountCents: true, category: true },
    });
    const months = Array.from({ length: 12 }, (_, i) => ({ month: shiftMonth(first, i), income: 0, outflow: 0, invested: 0 }));
    for (const t of txs) {
      const row = months.find((m) => m.month === t.date.slice(0, 7));
      const kind = kindOf(t.category);
      if (!row || kind === "TRANSFER") continue;
      if (kind === "INCOME") row.income += t.amountCents;
      else if (kind === "INVESTMENT") row.invested -= t.amountCents;
      else row.outflow -= t.amountCents;
    }
    return months;
  });

  app.get("/accounts", async (req) => {
    const connections = await prisma.bankConnection.findMany({
      where: { ownerId: req.user.id },
      include: { accounts: { orderBy: { name: "asc" } } },
      orderBy: { createdAt: "asc" },
    });
    return connections.map((c) => ({
      id: c.id,
      aspspName: c.aspspName,
      validUntil: c.validUntil.toISOString(),
      accounts: c.accounts.map((a) => ({
        id: a.id,
        name: a.name,
        iban: a.iban ? `•••• ${a.iban.slice(-4)}` : null,
        isSavings: a.accountType === "SVGS",
        currency: a.currency,
        balanceCents: a.balanceCents,
        lastSyncAt: a.lastSyncAt?.toISOString() ?? null,
      })),
    }));
  });

  app.get("/recurring", async (req) => {
    const items = await prisma.recurringItem.findMany({
      where: { ownerId: req.user.id },
      orderBy: [{ nextDate: "asc" }],
    });
    return items.map(({ key: _key, householdId: _h, ownerId: _o, createdAt: _c, ...item }) => ({
      ...item,
      monthlyCents: monthlyCents(item.amountCents, item.period),
    }));
  });

  // correction d'un flux récurrent : « pas récurrent », réactivation, ou changement de catégorie
  app.patch<{ Params: { id: string } }>("/recurring/:id", async (req, reply) => {
    const body = z.object({ status: z.enum(["ACTIVE", "DISMISSED"]), category }).partial().parse(req.body);
    const item = await prisma.recurringItem.findFirst({ where: { id: req.params.id, ownerId: req.user.id } });
    if (!item) return reply.code(404).send({ error: "Introuvable" });
    if (body.category) {
      await learn(req.user.id, req.user.householdId, item.key.split("|")[0], body.category);
      await prisma.bankTransaction.updateMany({
        where: { ...mine(req.user.id), recurringId: item.id },
        data: { category: body.category, categorySource: "USER" },
      });
    }
    await prisma.recurringItem.update({ where: { id: item.id }, data: body });
    await detectRecurring(req.user.id, req.user.householdId);
    return { ok: true };
  });

  // correction d'une opération : la catégorie est retenue pour toutes les opérations au même libellé
  app.patch<{ Params: { id: string } }>("/transactions/:id", async (req, reply) => {
    const body = z.object({ category }).parse(req.body);
    const tx = await prisma.bankTransaction.findFirst({ where: { id: req.params.id, ...mine(req.user.id) } });
    if (!tx) return reply.code(404).send({ error: "Introuvable" });
    await prisma.bankTransaction.update({ where: { id: tx.id }, data: { category: body.category, categorySource: "USER" } });
    await learn(req.user.id, req.user.householdId, tx.labelKey, body.category);
    await detectRecurring(req.user.id, req.user.householdId);
    return { ok: true };
  });
}

async function learn(ownerId: string, householdId: string, pattern: string, category: string) {
  await prisma.categoryRule.upsert({
    where: { ownerId_pattern: { ownerId, pattern } },
    create: { ownerId, householdId, pattern, category },
    update: { category },
  });
  await recategorize(ownerId);
}

import { createSign } from "node:crypto";
import { readFileSync } from "node:fs";
import { env } from "./env.js";

// Client minimal de l'API Enable Banking (agrégateur DSP2) — https://enablebanking.com/docs/api/reference/
const BASE = "https://api.enablebanking.com";

let privateKey: string | null = null;

const b64url = (data: string | Buffer) => Buffer.from(data).toString("base64url");

// JWT RS256 signé avec la clé de l'application (durée max autorisée : 24 h)
function token() {
  privateKey ??= readFileSync(env.ebPrivateKeyPath, "utf8");
  const now = Math.floor(Date.now() / 1000);
  const header = b64url(JSON.stringify({ typ: "JWT", alg: "RS256", kid: env.ebAppId }));
  const payload = b64url(JSON.stringify({ iss: "enablebanking.com", aud: "api.enablebanking.com", iat: now, exp: now + 3600 }));
  const signature = createSign("RSA-SHA256").update(`${header}.${payload}`).sign(privateKey);
  return `${header}.${payload}.${b64url(signature)}`;
}

async function call<T>(path: string, init: { method?: string; body?: unknown } = {}): Promise<T> {
  const res = await fetch(BASE + path, {
    method: init.method ?? "GET",
    headers: { authorization: `Bearer ${token()}`, "content-type": "application/json" },
    body: init.body !== undefined ? JSON.stringify(init.body) : undefined,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const message = (data as { message?: string }).message ?? `Erreur banque (${res.status})`;
    throw Object.assign(new Error(message), { statusCode: 502, ebStatus: res.status });
  }
  return data as T;
}

type Amount = { amount: string; currency: string };

export type Aspsp = { name: string; country: string; logo?: string; maximum_consent_validity?: number };

export type EbAccount = {
  uid?: string;
  account_id?: { iban?: string };
  name?: string;
  details?: string;
  product?: string;
  currency: string;
  cash_account_type?: string;
};

export type EbTransaction = {
  entry_reference?: string | null;
  transaction_id?: string | null;
  merchant_category_code?: string | null;
  transaction_amount: Amount;
  credit_debit_indicator: "CRDT" | "DBIT";
  status?: string;
  booking_date?: string | null;
  value_date?: string | null;
  transaction_date?: string | null;
  creditor?: { name?: string } | null;
  creditor_account?: { iban?: string } | null;
  debtor?: { name?: string } | null;
  debtor_account?: { iban?: string } | null;
  remittance_information?: string[] | null;
};

export const listAspsps = (country: string) =>
  call<{ aspsps: Aspsp[] }>(`/aspsps?country=${country}&psu_type=personal`).then((r) => r.aspsps);

export const startAuth = (body: { aspsp: { name: string; country: string }; validUntil: Date; state: string; redirectUrl: string }) =>
  call<{ url: string }>("/auth", {
    method: "POST",
    body: {
      access: { valid_until: body.validUntil.toISOString() },
      aspsp: body.aspsp,
      state: body.state,
      redirect_url: body.redirectUrl,
      psu_type: "personal",
      language: "fr",
    },
  });

export const createSession = (code: string) =>
  call<{ session_id: string; aspsp: { name: string; country: string }; accounts: EbAccount[]; access: { valid_until: string } }>("/sessions", {
    method: "POST",
    body: { code },
  });

export const deleteSession = (sessionId: string) => call(`/sessions/${sessionId}`, { method: "DELETE" });

export const getBalances = (uid: string) =>
  call<{ balances: { balance_amount: Amount; balance_type: string }[] }>(`/accounts/${uid}/balances`).then((r) => r.balances);

// toutes les pages de transactions depuis dateFrom
export async function getTransactions(uid: string, dateFrom: string) {
  const all: EbTransaction[] = [];
  let continuationKey: string | undefined;
  do {
    const query = new URLSearchParams({ date_from: dateFrom });
    if (continuationKey) query.set("continuation_key", continuationKey);
    const page = await call<{ transactions: EbTransaction[]; continuation_key?: string | null }>(
      `/accounts/${uid}/transactions?${query}`,
    );
    all.push(...page.transactions);
    continuationKey = page.continuation_key ?? undefined;
  } while (continuationKey);
  return all;
}

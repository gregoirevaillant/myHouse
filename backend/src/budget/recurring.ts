import { prisma } from "../db.js";
import { kindOf } from "./categories.js";

export const PERIODS = {
  WEEKLY: { days: 7, tolerance: 2, months: 0 },
  MONTHLY: { days: 30, tolerance: 5, months: 1 },
  QUARTERLY: { days: 91, tolerance: 10, months: 3 },
  YEARLY: { days: 365, tolerance: 20, months: 12 },
} as const;

export type Period = keyof typeof PERIODS;

const DAY = 86_400_000;
const toTime = (iso: string) => Date.parse(`${iso}T00:00:00Z`);
const toIso = (time: number) => new Date(time).toISOString().slice(0, 10);

const median = (values: number[]) => {
  const s = [...values].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
};

// prochaine échéance : même jour du mois pour les périodes mensuelles et plus, +7 jours pour l'hebdo
export function nextOccurrence(lastDate: string, period: Period) {
  const { days, months } = PERIODS[period];
  if (!months) return toIso(toTime(lastDate) + days * DAY);
  const [y, m, d] = lastDate.split("-").map(Number);
  const target = new Date(Date.UTC(y, m - 1 + months, 1));
  const lastDay = new Date(Date.UTC(target.getUTCFullYear(), target.getUTCMonth() + 1, 0)).getUTCDate();
  target.setUTCDate(Math.min(d, lastDay));
  return toIso(target.getTime());
}

// "netflix.com" → "Netflix.com" : le libellé nettoyé est plus lisible que le brut de la banque
const displayLabel = (labelKey: string) => labelKey.replace(/(^|\s)\S/g, (c) => c.toUpperCase());

type Tx = { id: string; date: string; amountCents: number; label: string; labelKey: string; category: string };

// Repère une série régulière : intervalles proches d'une période connue et montant stable
function analyse(txs: Tx[]) {
  const income = txs[0].amountCents > 0;
  const intervals = txs.slice(1).map((t, i) => (toTime(t.date) - toTime(txs[i].date)) / DAY);
  const typical = median(intervals);
  const period = (Object.keys(PERIODS) as Period[]).find((p) => Math.abs(typical - PERIODS[p].days) <= PERIODS[p].tolerance);
  if (!period) return null;
  if (txs.length < (period === "YEARLY" ? 2 : 3)) return null;
  const { days, tolerance } = PERIODS[period];
  const fitting = intervals.filter((d) => Math.abs(d - days) <= tolerance * 1.5).length;
  if (fitting / intervals.length < 0.7) return null;

  // on regarde surtout les derniers montants : un abonnement peut augmenter
  const amounts = txs.slice(-6).map((t) => t.amountCents);
  const amount = median(amounts);
  const deviation = median(amounts.map((a) => Math.abs(a - amount)));
  if (deviation > Math.abs(amount) * (income ? 0.25 : 0.1)) return null;

  return { period, amountCents: Math.round(amount) };
}

// Recalcule les flux récurrents d'une personne à partir de son historique bancaire
export async function detectRecurring(ownerId: string, householdId: string) {
  const since = toIso(Date.now() - 548 * DAY);
  const txs = await prisma.bankTransaction.findMany({
    where: { account: { ownerId }, date: { gte: since } },
    select: { id: true, date: true, amountCents: true, label: true, labelKey: true, category: true },
    orderBy: { date: "asc" },
  });

  const groups = new Map<string, Tx[]>();
  for (const t of txs) {
    if (kindOf(t.category) === "TRANSFER" || t.amountCents === 0) continue;
    const key = `${t.labelKey}|${t.amountCents > 0 ? "in" : "out"}`;
    groups.set(key, [...(groups.get(key) ?? []), t]);
  }

  const existing = await prisma.recurringItem.findMany({ where: { ownerId } });
  const byKey = new Map(existing.map((r) => [r.key, r]));
  const today = Date.now();
  const found = new Set<string>();

  await prisma.bankTransaction.updateMany({ where: { account: { ownerId }, recurringId: { not: null } }, data: { recurringId: null } });

  for (const [key, group] of groups) {
    const result = analyse(group);
    if (!result) continue;
    found.add(key);
    const last = group[group.length - 1];
    const nextDate = nextOccurrence(last.date, result.period);
    const late = (today - toTime(last.date)) / DAY > PERIODS[result.period].days * 1.5;
    // catégorie la plus fréquente de la série (les corrections de la personne y sont reportées)
    const counts = new Map<string, number>();
    for (const t of group) counts.set(t.category, (counts.get(t.category) ?? 0) + 1);
    const category = [...counts].sort((a, b) => b[1] - a[1])[0][0];

    const previous = byKey.get(key);
    const status = previous?.status === "DISMISSED" ? "DISMISSED" : late ? "ENDED" : "ACTIVE";
    const data = { label: displayLabel(last.labelKey), category, period: result.period, amountCents: result.amountCents, lastDate: last.date, nextDate, status };
    const item = previous
      ? await prisma.recurringItem.update({ where: { id: previous.id }, data })
      : await prisma.recurringItem.create({ data: { ...data, key, ownerId, householdId } });
    if (status !== "DISMISSED") {
      await prisma.bankTransaction.updateMany({ where: { id: { in: group.map((t) => t.id) } }, data: { recurringId: item.id } });
    }
  }

  // séries qui ne sont plus régulières : terminées (on garde les « pas récurrent » tels quels)
  const gone = existing.filter((r) => !found.has(r.key) && r.status === "ACTIVE").map((r) => r.id);
  if (gone.length) await prisma.recurringItem.updateMany({ where: { id: { in: gone } }, data: { status: "ENDED" } });
}

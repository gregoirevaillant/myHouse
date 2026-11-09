import { prisma } from "./db.js";

const TRACKER_NAME = "vie quotidienne";
const norm = (s: string) => s.normalize("NFD").replace(/\p{M}/gu, "").trim().toLowerCase();
const today = () => new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Paris" }).format(new Date());
const pad = (n: number) => String(n).padStart(2, "0");
const iso = (y: number, m: number, d: number) => `${y}-${pad(m)}-${pad(d)}`;
// jour d'échéance ramené à la fin du mois si besoin (31 → 30, 28…)
const dueIso = (y: number, m: number, day: number) => iso(y, m, Math.min(day, new Date(y, m, 0).getDate()));

type Due = { period: string; dueDay: number; dueMonth: number | null };

// échéances comprises entre `after` (exclu) et `until` (inclus)
export function dueDates(i: Due, after: string, until: string) {
  const out: string[] = [];
  const [ya, ma] = after.split("-").map(Number);
  const [yu, mu] = until.split("-").map(Number);
  for (let y = ya, m = ma; y < yu || (y === yu && m <= mu); m === 12 ? (y++, (m = 1)) : m++) {
    if (i.period === "YEARLY" && m !== (i.dueMonth ?? 1)) continue;
    const d = dueIso(y, m, i.dueDay);
    if (d > after && d <= until) out.push(d);
  }
  return out.slice(-36); // garde-fou si l'appli n'a pas été ouverte depuis très longtemps
}

// Les charges communes d'un foyer (budget) avec un payeur deviennent des dépenses du carnet « Vie quotidienne »,
// réparties à parts égales entre les membres, à chaque échéance échue. Appelé à l'ouverture du budget et des dépenses
// (pas de tâche planifiée) : les échéances manquées sont rattrapées avec leur vraie date.
// shortcut: le reste de la division va au payeur ; deux appels simultanés pourraient doubler une échéance (foyer de 2, négligeable).
export async function syncBudgetExpenses(householdId: string) {
  const items = await prisma.budgetItem.findMany({
    where: { householdId, ownerId: null, kind: "EXPENSE", active: true, paidById: { not: null }, lastBilledOn: { not: null } },
  });
  if (!items.length) return;
  const now = today();
  const pending = items.map((i) => ({ i, dates: dueDates(i, i.lastBilledOn!, now) })).filter((p) => p.dates.length);
  if (!pending.length) return;

  const members = await prisma.user.findMany({ where: { householdId }, select: { id: true }, orderBy: { id: "asc" } });
  const ids = new Set(members.map((m) => m.id));
  const trackers = await prisma.expenseTracker.findMany({ where: { householdId, ownerId: null, finishedAt: null }, select: { id: true, name: true } });
  const trackerId =
    trackers.find((t) => norm(t.name) === TRACKER_NAME)?.id ??
    (await prisma.expenseTracker.create({ data: { householdId, createdById: pending[0].i.createdById, name: "Vie quotidienne", emoji: "🏡" }, select: { id: true } })).id;

  for (const { i, dates } of pending) {
    if (!ids.has(i.paidById!)) continue; // le payeur a quitté le foyer
    const base = Math.floor(i.amountCents / members.length);
    const rest = i.amountCents - base * members.length;
    const shares = members
      .map((m) => ({ userId: m.id, amountCents: base + (m.id === i.paidById ? rest : 0) }))
      .filter((s) => s.amountCents > 0);
    await prisma.$transaction([
      ...dates.map((date) =>
        prisma.expense.create({
          data: { householdId, createdById: i.createdById, trackerId, title: i.label, amountCents: i.amountCents, paidById: i.paidById!, date, shares: { create: shares } },
        }),
      ),
      prisma.budgetItem.update({ where: { id: i.id }, data: { lastBilledOn: now } }),
    ]);
  }
}

import { useQuery } from "@tanstack/react-query";
import { api, type BudgetItem, type BudgetKind } from "./api";
import { fromIso, toIso } from "./dates";

// même liste que backend/src/routes/budget.ts
export const CATEGORIES: Record<string, { label: string; icon: string; kind: BudgetKind; color: string }> = {
  LOGEMENT: { label: "Logement", icon: "🏠", kind: "EXPENSE", color: "bg-peach" },
  ABONNEMENTS: { label: "Abonnements", icon: "🔁", kind: "EXPENSE", color: "bg-lavender" },
  ASSURANCES: { label: "Assurances", icon: "🛡️", kind: "EXPENSE", color: "bg-sky" },
  TRANSPORT: { label: "Transport", icon: "🚆", kind: "EXPENSE", color: "bg-mint" },
  IMPOTS: { label: "Impôts & taxes", icon: "🏛️", kind: "EXPENSE", color: "bg-sky-soft" },
  SANTE: { label: "Santé", icon: "🩺", kind: "EXPENSE", color: "bg-rose-soft" },
  ENFANTS: { label: "Enfants & école", icon: "🎒", kind: "EXPENSE", color: "bg-lemon" },
  EPARGNE: { label: "Épargne", icon: "🐷", kind: "EXPENSE", color: "bg-lavender-soft" },
  AUTRE: { label: "Autre", icon: "📦", kind: "EXPENSE", color: "bg-white" },
  SALAIRE: { label: "Salaire", icon: "💼", kind: "INCOME", color: "bg-mint" },
  AUTRE_REVENU: { label: "Autre revenu", icon: "💰", kind: "INCOME", color: "bg-mint-soft" },
};
export const category = (id: string) => CATEGORIES[id] ?? CATEGORIES.AUTRE;
export const categoriesOf = (kind: BudgetKind) => Object.entries(CATEGORIES).filter(([, c]) => c.kind === kind);

export const useBudgetItems = (enabled = true) => useQuery({ queryKey: ["budget"], queryFn: () => api<BudgetItem[]>("/budget"), enabled });

// montant lissé par mois : une charge annuelle compte pour 1/12
export const monthlyCents = (i: BudgetItem) => (i.period === "YEARLY" ? Math.round(i.amountCents / 12) : i.amountCents);

const daysIn = (year: number, month: number) => new Date(year, month, 0).getDate();
const dueIso = (year: number, month: number, day: number) => toIso(new Date(year, month - 1, Math.min(day, daysIn(year, month))));

// prochaine échéance (aujourd'hui incluse) d'une ligne
export function nextDue(i: BudgetItem, today: string) {
  const t = fromIso(today);
  const y = t.getFullYear();
  const m = t.getMonth() + 1;
  if (i.period === "MONTHLY") {
    const thisMonth = dueIso(y, m, i.dueDay);
    return thisMonth >= today ? thisMonth : dueIso(m === 12 ? y + 1 : y, (m % 12) + 1, i.dueDay);
  }
  const dm = i.dueMonth ?? 1;
  const thisYear = dueIso(y, dm, i.dueDay);
  return thisYear >= today ? thisYear : dueIso(y + 1, dm, i.dueDay);
}

// échéances des 12 mois à venir, par mois (index 0 = mois en cours) : total des charges actives
export function monthlyOutflows(items: BudgetItem[], today: string) {
  const t = fromIso(today);
  return Array.from({ length: 12 }, (_, n) => {
    const d = new Date(t.getFullYear(), t.getMonth() + n, 1);
    const month = d.getMonth() + 1;
    const cents = items
      .filter((i) => i.active && i.kind === "EXPENSE" && (i.period === "MONTHLY" || i.dueMonth === month))
      .reduce((sum, i) => sum + i.amountCents, 0);
    return { key: toIso(d).slice(0, 7), date: d, cents };
  });
}

export function budgetSummary(items: BudgetItem[], today: string) {
  const active = items.filter((i) => i.active);
  const sum = (kind: BudgetKind, period?: BudgetItem["period"]) =>
    active.filter((i) => i.kind === kind && (!period || i.period === period)).reduce((s, i) => s + monthlyCents(i), 0);
  const incomeCents = sum("INCOME");
  const expenseCents = sum("EXPENSE");
  const next = active
    .filter((i) => i.kind === "EXPENSE")
    .map((item) => ({ item, date: nextDue(item, today) }))
    .sort((a, b) => a.date.localeCompare(b.date))[0];
  return { incomeCents, expenseCents, yearlySmoothedCents: sum("EXPENSE", "YEARLY"), leftCents: incomeCents - expenseCents, next };
}

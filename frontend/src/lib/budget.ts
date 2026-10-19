import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api, type BankConnection, type BudgetMonth, type BudgetTrend, type RecurringItem, type RecurringPeriod } from "./api";

export type Kind = "INCOME" | "EXPENSE" | "INVESTMENT" | "TRANSFER";

// même liste que backend/src/budget/categories.ts
export const CATEGORIES: Record<string, { label: string; icon: string; kind: Kind; color: string }> = {
  SALARY: { label: "Salaire", icon: "💼", kind: "INCOME", color: "bg-mint" },
  OTHER_INCOME: { label: "Autre revenu", icon: "💰", kind: "INCOME", color: "bg-mint-soft" },
  HOUSING: { label: "Logement", icon: "🏠", kind: "EXPENSE", color: "bg-peach" },
  GROCERIES: { label: "Courses", icon: "🛒", kind: "EXPENSE", color: "bg-mint" },
  UTILITIES: { label: "Énergie & télécom", icon: "💡", kind: "EXPENSE", color: "bg-lemon" },
  SUBSCRIPTIONS: { label: "Abonnements", icon: "🔁", kind: "EXPENSE", color: "bg-lavender" },
  TRANSPORT: { label: "Transport", icon: "🚆", kind: "EXPENSE", color: "bg-sky" },
  HEALTH: { label: "Santé", icon: "🩺", kind: "EXPENSE", color: "bg-rose-soft" },
  LEISURE: { label: "Loisirs & resto", icon: "🍿", kind: "EXPENSE", color: "bg-rose" },
  SHOPPING: { label: "Shopping", icon: "🛍️", kind: "EXPENSE", color: "bg-peach-soft" },
  TAXES: { label: "Impôts", icon: "🏛️", kind: "EXPENSE", color: "bg-sky-soft" },
  OTHER: { label: "Autre", icon: "📦", kind: "EXPENSE", color: "bg-white" },
  SAVINGS: { label: "Épargne", icon: "🐷", kind: "INVESTMENT", color: "bg-lavender-soft" },
  INVESTMENT: { label: "Investissement", icon: "📈", kind: "INVESTMENT", color: "bg-lavender" },
  TRANSFER: { label: "Virement interne", icon: "↔︎", kind: "TRANSFER", color: "bg-white" },
};

export const category = (id: string) => CATEGORIES[id] ?? CATEGORIES.OTHER;

export const KIND_LABELS: Record<Kind, string> = {
  INCOME: "Revenus",
  EXPENSE: "Dépenses",
  INVESTMENT: "Épargne & investissement",
  TRANSFER: "Hors budget",
};

export const PERIOD_LABELS: Record<RecurringPeriod, string> = {
  WEEKLY: "chaque semaine",
  MONTHLY: "chaque mois",
  QUARTERLY: "chaque trimestre",
  YEARLY: "chaque année",
};

export const useBudgetMonth = (month: string, enabled = true) =>
  useQuery({ queryKey: ["budget", month], queryFn: () => api<BudgetMonth>(`/budget?month=${month}`), enabled });

export const useBudgetTrend = (month: string) =>
  useQuery({ queryKey: ["budget-trend", month], queryFn: () => api<BudgetTrend>(`/budget/trend?month=${month}`) });

export const useRecurring = () => useQuery({ queryKey: ["recurring"], queryFn: () => api<RecurringItem[]>("/budget/recurring") });

export const useBankConnections = () =>
  useQuery({ queryKey: ["bank-connections"], queryFn: () => api<BankConnection[]>("/budget/accounts") });

// après une synchro ou une correction, tout le budget peut avoir bougé
const budgetKeys = ["budget", "budget-trend", "recurring", "bank-connections"];
export function useInvalidateBudget() {
  const qc = useQueryClient();
  return () => budgetKeys.forEach((key) => qc.invalidateQueries({ queryKey: [key] }));
}

export function useSyncBank() {
  const invalidate = useInvalidateBudget();
  return useMutation({
    mutationFn: () => api<{ ok: true; errors: string[] }>("/bank/sync", { method: "POST" }),
    onSuccess: invalidate,
  });
}

export function useSetTransactionCategory() {
  const invalidate = useInvalidateBudget();
  return useMutation({
    mutationFn: ({ id, category }: { id: string; category: string }) =>
      api(`/budget/transactions/${id}`, { method: "PATCH", json: { category } }),
    onSuccess: invalidate,
  });
}

export function useUpdateRecurring() {
  const invalidate = useInvalidateBudget();
  return useMutation({
    mutationFn: ({ id, ...body }: { id: string; status?: "ACTIVE" | "DISMISSED"; category?: string }) =>
      api(`/budget/recurring/${id}`, { method: "PATCH", json: body }),
    onSuccess: invalidate,
  });
}

// le consentement bancaire expire (~180 jours) : on prévient deux semaines avant
export function consentWarning(consentUntil: string | null) {
  if (!consentUntil) return null;
  const days = Math.ceil((new Date(consentUntil).getTime() - Date.now()) / 86_400_000);
  if (days <= 0) return "L'accès à ta banque a expiré : reconnecte-la pour continuer la synchro.";
  if (days <= 14) return `L'accès à ta banque expire dans ${days} jour${days > 1 ? "s" : ""} : pense à la reconnecter.`;
  return null;
}

export const signedEur = (cents: number, format: (c: number) => string) => (cents > 0 ? `+${format(cents)}` : format(cents));

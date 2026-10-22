import { useQuery } from "@tanstack/react-query";
import { api, type Expense, type ExpenseTracker, type Member } from "./api";

// icônes proposées pour un carnet
export const EMOJIS = ["🏠", "✈️", "🏔️", "🏖️", "🎉", "🎁", "🚗", "🍽️", "🛒", "🏡"];

export const expensesQuery = { queryKey: ["expenses"], queryFn: () => api<Expense[]>("/expenses") };

export const trackersQuery = { queryKey: ["expense-trackers"], queryFn: () => api<ExpenseTracker[]>("/expense-trackers") };

// solde : ce que chacun a payé moins ce qu'il doit (remboursements compris) → qui doit combien à qui
export function computeDebt(expenses: Expense[], members: Member[]) {
  if (members.length !== 2) return null;
  const [a, b] = members;
  let netA = 0;
  for (const e of expenses) {
    if (e.paidById === a.id) netA += e.amountCents;
    for (const s of e.shares) if (s.userId === a.id) netA -= s.amountCents;
  }
  if (netA === 0) return null;
  return netA > 0 ? { from: b, to: a, cents: netA } : { from: a, to: b, cents: -netA };
}

export function useExpenses(enabled = true) {
  return useQuery({ ...expensesQuery, enabled });
}

export function useTrackers() {
  return useQuery(trackersQuery);
}

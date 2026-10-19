// Catégories fixes du budget (copie côté front : frontend/src/lib/budget.ts)
export const CATEGORIES = {
  SALARY: "INCOME",
  OTHER_INCOME: "INCOME",
  HOUSING: "EXPENSE",
  GROCERIES: "EXPENSE",
  UTILITIES: "EXPENSE",
  SUBSCRIPTIONS: "EXPENSE",
  TRANSPORT: "EXPENSE",
  HEALTH: "EXPENSE",
  LEISURE: "EXPENSE",
  SHOPPING: "EXPENSE",
  TAXES: "EXPENSE",
  OTHER: "EXPENSE",
  SAVINGS: "INVESTMENT",
  INVESTMENT: "INVESTMENT",
  TRANSFER: "TRANSFER",
} as const;

export type Category = keyof typeof CATEGORIES;
export type Kind = (typeof CATEGORIES)[Category];

export const CATEGORY_IDS = Object.keys(CATEGORIES) as [Category, ...Category[]];

export const kindOf = (category: string): Kind => CATEGORIES[category as Category] ?? "EXPENSE";

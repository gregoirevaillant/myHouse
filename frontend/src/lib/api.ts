export class ApiError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

export async function api<T>(path: string, init: RequestInit & { json?: unknown } = {}): Promise<T> {
  const { json, headers, ...rest } = init;
  const res = await fetch(`/api${path}`, {
    credentials: "include",
    ...rest,
    headers: json !== undefined ? { "content-type": "application/json", ...headers } : headers,
    body: json !== undefined ? JSON.stringify(json) : rest.body,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new ApiError(res.status, data.error ?? "Erreur");
  return data as T;
}

export type NotificationType = "SHOPPING" | "EXPENSES";
export type User = {
  id: string;
  email: string;
  name: string;
  hiddenTabs: string[];
  showNavBar: boolean;
  mutedNotifications: NotificationType[];
};

export type CardType = "BARCODE" | "QR" | "NUMBER";
export type LoyaltyCard = {
  id: string;
  name: string;
  type: CardType;
  value: string | null;
  barcodeFormat: string | null;
  description: string | null;
  color: string;
  hasImage: boolean;
};

export type MealSlot = "LUNCH" | "DINNER";
// restaurantId : repas prévu au resto (absent des réponses en cache d'avant les restos)
export type Meal = { date: string; slot: MealSlot; text: string; restaurantId?: string | null };

export type Restaurant = {
  id: string;
  name: string;
  cuisine: string;
  district: string | null;
  address: string | null;
  lat: number | null;
  lng: number | null;
  wishlist: boolean;
  rating: number | null;
  price: number | null;
  phone: string | null;
  url: string | null;
  visits: string[]; // dates YYYY-MM-DD, la plus récente d'abord
};
export type RestaurantInput = Omit<Restaurant, "id" | "visits" | "wishlist"> & { visitedOn?: string };
export type GeocodeResult = { label: string; name: string | null; address: string; lat: number; lng: number; district: string | null };

export type Product = { id: string; name: string; note: string | null; hasImage: boolean };

export type ShoppingItem = { id: string; label: string; checked: boolean; createdAt: string; product: Product | null };

export type Member = { id: string; name: string; email: string };

export type ExpenseShare = { userId: string; amountCents: number };
// finishedAt : carnet terminé (YYYY-MM-DD), absent des réponses d'avant les carnets terminés
export type ExpenseTracker = { id: string; name: string; emoji: string; finishedAt?: string | null };
export type Expense = {
  id: string;
  trackerId: string;
  title: string;
  amountCents: number;
  paidById: string;
  date: string;
  isReimbursement: boolean;
  shares: ExpenseShare[];
};
export type ExpenseInput = Omit<Expense, "id">;

export type InfoCategory = "CODE" | "WIFI" | "CONTACT" | "MAISON" | "AUTRE";
export type HouseInfo = { id: string; category: InfoCategory; label: string; value: string; note: string | null; private: boolean };
export type HouseInfoInput = Omit<HouseInfo, "id">;

export type JournalSummary = { id: string; title: string; entryCount: number; lastDate: string | null };
export type JournalEntry = { date: string; text: string };
export type Journal = { id: string; title: string; entries: JournalEntry[] };

export type BudgetTransaction = {
  id: string;
  date: string;
  amountCents: number;
  label: string;
  detail: string | null;
  merchantKey: string;
  category: string;
  byUser: boolean;
  recurringId: string | null;
  accountName: string;
};
export type BudgetRecurringDue = {
  id: string;
  label: string;
  category: string;
  period: RecurringPeriod;
  amountCents: number;
  paidCents: number;
  upcoming: string[];
};
export type BudgetMonth = {
  month: string;
  totals: { income: number; outflow: number; invested: number };
  byCategory: Record<string, number>;
  transactions: BudgetTransaction[];
  recurring: BudgetRecurringDue[];
  householdShareCents: number;
  bank: { enabled: boolean; connected: boolean; consentUntil: string | null; lastSyncAt: string | null };
};
export type BudgetTrend = { month: string; income: number; outflow: number; invested: number }[];

export type RecurringPeriod = "WEEKLY" | "MONTHLY" | "QUARTERLY" | "YEARLY";
export type RecurringItem = {
  id: string;
  label: string;
  category: string;
  period: RecurringPeriod;
  amountCents: number;
  monthlyCents: number;
  lastDate: string;
  nextDate: string;
  status: "ACTIVE" | "ENDED" | "DISMISSED";
};

export type BankAccount = {
  id: string;
  name: string;
  iban: string | null;
  isSavings: boolean;
  currency: string;
  balanceCents: number | null;
  lastSyncAt: string | null;
};
export type BankConnection = { id: string; aspspName: string; validUntil: string; accounts: BankAccount[] };

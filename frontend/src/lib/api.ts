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
  calorieGoal?: number | null; // absent des sessions gardées hors ligne avant son ajout
  hiddenTabs: string[];
  hiddenHome?: string[]; // absent des sessions gardées hors ligne avant son ajout
  menuOrder?: string[]; // idem
  homeWide?: string[]; // idem (absent : seulement les repas en large)
  showNavBar: boolean;
  mutedNotifications: NotificationType[];
  isAdmin?: boolean; // absents des sessions gardées hors ligne avant les familles
  mustChangePassword?: boolean;
  features?: string[]; // pages activées pour la famille (« cartes », « repas »…) ; absent = toutes
};

export type AdminUser = { id: string; name: string; email: string; isAdmin: boolean; mustChangePassword: boolean };
export type AdminHousehold = { id: string; name: string; features: string[]; users: AdminUser[] };

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

export type RecipeCategory = "PLAT" | "ENTREE" | "DESSERT" | "APERO" | "PETIT_DEJ" | "AUTRE";
// ingredients et steps : une ligne chacun
export type Recipe = {
  id: string;
  name: string;
  category: RecipeCategory;
  servings: number | null;
  calories: number | null; // kcal par portion (ou pour 100 g si per100g)
  per100g?: boolean; // absent des anciennes données gardées hors ligne
  private?: boolean; // aliment privé (suivi des calories), visible de son auteur seulement
  minutes: number | null;
  ingredients: string;
  steps: string;
  note: string | null;
  url: string | null;
  hasImage: boolean;
};

export type JournalSummary = { id: string; title: string; entryCount: number; lastDate: string | null };
export type JournalEntry = { date: string; text: string };
export type Journal = { id: string; title: string; entries: JournalEntry[] };

export type BudgetKind = "EXPENSE" | "INCOME";
export type BudgetPeriod = "MONTHLY" | "YEARLY";
export type BudgetItem = {
  id: string;
  label: string;
  kind: BudgetKind;
  period: BudgetPeriod;
  amountCents: number;
  category: string;
  dueDay: number;
  dueMonth: number | null;
  active: boolean;
  note: string | null;
  private: boolean;
};
export type BudgetItemInput = Omit<BudgetItem, "id">;

export type CalorieMeal = "BREAKFAST" | "LUNCH" | "DINNER" | "SNACK";
export type CalorieEntry = { id: string; date: string; meal: CalorieMeal; label: string; kcal: number };
export type CalorieEntryInput = Omit<CalorieEntry, "id">;

export type MediaKind = "MOVIE" | "SERIES" | "GAME" | "BOOK";
export type MediaStatus = "WISHLIST" | "IN_PROGRESS" | "DONE";
export type MediaItem = {
  id: string;
  kind: MediaKind;
  title: string;
  year: number | null;
  creator: string | null;
  overview: string | null;
  status: MediaStatus;
  progress: string | null;
  rating: number | null;
  doneAt: string | null;
  note: string | null;
  source: string | null;
  sourceId: string | null;
  private: boolean;
  hasImage: boolean;
};
export type MediaInput = Omit<MediaItem, "id" | "hasImage">;
// résultat d'une recherche dans une base ouverte
export type MediaHit = { source: string; sourceId: string; title: string; year: number | null; subtitle: string | null; creator: string | null; imageUrl: string | null };

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

export type User = { id: string; email: string; name: string };

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
export type Meal = { date: string; slot: MealSlot; text: string };

export type ShoppingItem = { id: string; label: string; checked: boolean; createdAt: string };

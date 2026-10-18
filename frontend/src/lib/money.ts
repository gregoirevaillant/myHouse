const eur = new Intl.NumberFormat("fr-FR", { style: "currency", currency: "EUR" });
const eurRound = new Intl.NumberFormat("fr-FR", { style: "currency", currency: "EUR", maximumFractionDigits: 0 });

export const formatEur = (cents: number) => eur.format(cents / 100);
export const formatEurRound = (cents: number) => eurRound.format(cents / 100);

// "12,5" / "12.50" / "12 €" → 1250 ; null si invalide
export function parseEur(input: string): number | null {
  const cleaned = input.replace(/[\s€]/g, "").replace(",", ".");
  if (!/^\d+(\.\d{0,2})?$/.test(cleaned)) return null;
  return Math.round(Number(cleaned) * 100);
}

export const centsToInput = (cents: number) => (cents / 100).toFixed(2).replace(".", ",").replace(",00", "");

// Partage équitable ; les centimes restants vont aux premiers de la liste
export function splitEqually(amountCents: number, userIds: string[]) {
  const base = Math.floor(amountCents / userIds.length);
  let rest = amountCents - base * userIds.length;
  return userIds.map((userId) => ({ userId, amountCents: base + (rest-- > 0 ? 1 : 0) }));
}

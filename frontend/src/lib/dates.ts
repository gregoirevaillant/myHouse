// Dates manipulées en heure locale, au format YYYY-MM-DD
export function toIso(d: Date) {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

export function fromIso(iso: string) {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(y, m - 1, d);
}

export function addDays(iso: string, days: number) {
  const d = fromIso(iso);
  d.setDate(d.getDate() + days);
  return toIso(d);
}

export function mondayOf(d: Date) {
  const copy = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  copy.setDate(copy.getDate() - ((copy.getDay() + 6) % 7));
  return toIso(copy);
}

export const dayName = (iso: string) => fromIso(iso).toLocaleDateString("fr-FR", { weekday: "long" });
export const shortDate = (iso: string) => fromIso(iso).toLocaleDateString("fr-FR", { day: "numeric", month: "short" });

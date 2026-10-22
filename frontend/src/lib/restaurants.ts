import { useCallback, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api, type MealSlot, type Restaurant } from "./api";
import { normalize } from "./products";

export const CUISINES = [
  { id: "FRANCAIS", label: "Français", emoji: "🥖" },
  { id: "ITALIEN", label: "Italien", emoji: "🍕" },
  { id: "JAPONAIS", label: "Japonais", emoji: "🍣" },
  { id: "CHINOIS", label: "Chinois", emoji: "🥡" },
  { id: "COREEN", label: "Coréen", emoji: "🍜" },
  { id: "THAI", label: "Thaï", emoji: "🌶️" },
  { id: "VIETNAMIEN", label: "Vietnamien", emoji: "🍲" },
  { id: "INDIEN", label: "Indien", emoji: "🍛" },
  { id: "LIBANAIS", label: "Libanais", emoji: "🧆" },
  { id: "MEXICAIN", label: "Mexicain", emoji: "🌮" },
  { id: "AFRICAIN", label: "Africain", emoji: "🥘" },
  { id: "BURGER", label: "Burger", emoji: "🍔" },
  { id: "CREPERIE", label: "Crêperie", emoji: "🥞" },
  { id: "BRUNCH", label: "Brunch", emoji: "🥐" },
  { id: "VEGE", label: "Végé", emoji: "🥗" },
  { id: "FRUITS_DE_MER", label: "Fruits de mer", emoji: "🦪" },
];

// une cuisine hors liste est gardée telle qu'elle a été tapée
export function cuisineInfo(cuisine: string) {
  return CUISINES.find((c) => c.id === cuisine) ?? { id: cuisine, label: cuisine, emoji: "🍽️" };
}

export const priceLabel = (price: number | null) => (price ? "€".repeat(price) : "");

export const NO_DISTRICT = "Sans adresse";
export const districtLabel = (r: Pick<Restaurant, "district">) => r.district || NO_DISTRICT;

// ordre des arrondissements : 1er → 20e, puis les autres villes, puis les restos sans adresse
function districtRank(d: string) {
  if (d === NO_DISTRICT) return 1000;
  const m = d.match(/^(\d{1,2})(er|e)$/);
  return m ? Number(m[1]) : 100;
}
export const compareDistricts = (a: string, b: string) => districtRank(a) - districtRank(b) || a.localeCompare(b, "fr");

// meilleure note d'abord, les restos sans note après
export const compareRestaurants = (a: Restaurant, b: Restaurant) =>
  (b.rating ?? 0) - (a.rating ?? 0) || a.name.localeCompare(b.name, "fr");

export type GroupBy = "cuisine" | "district";
export type Group = { key: string; label: string; emoji?: string; count: number; subgroups: { key: string; label: string; emoji?: string; items: Restaurant[] }[] };

const cuisineGroup = (r: Restaurant) => {
  const c = cuisineInfo(r.cuisine);
  return { key: c.id, label: c.label, emoji: c.emoji };
};
const districtGroup = (r: Restaurant) => ({ key: districtLabel(r), label: districtLabel(r), emoji: undefined });

// regroupement sur deux niveaux : cuisine → arrondissement, ou l'inverse
export function groupRestaurants(list: Restaurant[], by: GroupBy): Group[] {
  const [first, second] = by === "cuisine" ? [cuisineGroup, districtGroup] : [districtGroup, cuisineGroup];
  const groups = new Map<string, Group>();
  for (const r of list) {
    const g1 = first(r);
    const g2 = second(r);
    let group = groups.get(g1.key);
    if (!group) groups.set(g1.key, (group = { ...g1, count: 0, subgroups: [] }));
    let sub = group.subgroups.find((s) => s.key === g2.key);
    if (!sub) group.subgroups.push((sub = { ...g2, items: [] }));
    sub.items.push(r);
    group.count++;
  }
  const byCuisine = (a: { label: string }, b: { label: string }) => a.label.localeCompare(b.label, "fr");
  const byDistrict = (a: { key: string }, b: { key: string }) => compareDistricts(a.key, b.key);
  const [sort1, sort2] = by === "cuisine" ? [byCuisine, byDistrict] : [byDistrict, byCuisine];
  return [...groups.values()].sort(sort1).map((g) => ({
    ...g,
    subgroups: g.subgroups.sort(sort2).map((s) => ({ ...s, items: s.items.sort(compareRestaurants) })),
  }));
}

export const matchesSearch = (r: Restaurant, search: string) => {
  const q = normalize(search);
  return !q || [r.name, cuisineInfo(r.cuisine).label, r.district ?? "", r.address ?? ""].some((s) => normalize(s).includes(q));
};

export function useRestaurants(enabled = true) {
  return useQuery({ queryKey: ["restaurants"], queryFn: () => api<Restaurant[]>("/restaurants"), enabled });
}

export function useAddVisit() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, date }: { id: string; date: string }) => api<Restaurant>(`/restaurants/${id}/visits`, { method: "POST", json: { date } }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["restaurants"] }),
  });
}

// « Prévoir » : place le resto dans le planning des repas
export function usePlanMeal() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ restaurant, date, slot }: { restaurant: Restaurant; date: string; slot: MealSlot }) =>
      api("/meals", {
        method: "PUT",
        json: { date, slot, text: `${cuisineInfo(restaurant.cuisine).emoji} Resto : ${restaurant.name}`, restaurantId: restaurant.id },
      }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["meals"] }),
  });
}

export const directionsUrl = (r: Restaurant) =>
  r.lat != null && r.lng != null
    ? `https://www.google.com/maps/search/?api=1&query=${r.lat},${r.lng}`
    : `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(`${r.name} ${r.address ?? r.district ?? "Paris"}`)}`;

// lien Plans (Apple) envoyé avec le partage : s'ouvre dans Plans sur iPhone, dans le navigateur ailleurs
export const appleMapsUrl = (r: Restaurant) => {
  const q = `q=${encodeURIComponent(r.name)}`;
  if (r.lat != null && r.lng != null) return `https://maps.apple.com/?${q}&ll=${r.lat},${r.lng}`;
  return `https://maps.apple.com/?${q}&address=${encodeURIComponent(r.address ?? `${r.name} ${r.district ?? "Paris"}`)}`;
};

// fiche lisible pour un message : nom, cuisine, note, adresse, téléphone, site
export function shareText(r: Restaurant) {
  const cuisine = cuisineInfo(r.cuisine);
  const details = [cuisine.label, r.district, priceLabel(r.price)].filter(Boolean).join(" · ");
  return [
    `${cuisine.emoji} ${r.name}`,
    details,
    r.rating ? `${"★".repeat(r.rating)}${"☆".repeat(5 - r.rating)}` : r.wishlist ? "✨ Pas encore testé" : "",
    r.address && `📍 ${r.address}`,
    r.phone && `📞 ${r.phone}`,
    r.url && `🌐 ${r.url}`,
  ]
    .filter(Boolean)
    .join("\n");
}

// « Autour de moi » : position de l'iPhone, demandée seulement quand on en a besoin
export type Position = { lat: number; lng: number };
export type Locating = { status: "idle" | "locating" | "denied" | "error" } | { status: "ok"; position: Position };

export function useMyPosition() {
  const [state, setState] = useState<Locating>({ status: "idle" });
  const locate = useCallback(() => {
    if (!navigator.geolocation) return setState({ status: "error" });
    setState((s) => (s.status === "ok" ? s : { status: "locating" }));
    navigator.geolocation.getCurrentPosition(
      (p) => setState({ status: "ok", position: { lat: p.coords.latitude, lng: p.coords.longitude } }),
      (e) => setState({ status: e.code === e.PERMISSION_DENIED ? "denied" : "error" }),
      { enableHighAccuracy: true, timeout: 15000, maximumAge: 60000 },
    );
  }, []);
  return { ...state, locate };
}

// distance à vol d'oiseau en mètres (null si le resto n'est pas placé)
export function distanceTo(from: Position, r: Pick<Restaurant, "lat" | "lng">) {
  if (r.lat == null || r.lng == null) return null;
  const rad = (d: number) => (d * Math.PI) / 180;
  const dLat = rad(r.lat - from.lat);
  const dLng = rad(r.lng - from.lng);
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(rad(from.lat)) * Math.cos(rad(r.lat)) * Math.sin(dLng / 2) ** 2;
  return 6371000 * 2 * Math.asin(Math.sqrt(a));
}

export function distanceLabel(m: number) {
  const dist = m < 1000 ? `${Math.max(10, Math.round(m / 10) * 10)} m` : `${(m / 1000).toFixed(1).replace(".", ",")} km`;
  // ~4,5 km/h, détours compris
  const walk = Math.round((m * 1.3) / 75);
  return walk <= 30 ? `${dist} · ${Math.max(1, walk)} min à pied` : dist;
}

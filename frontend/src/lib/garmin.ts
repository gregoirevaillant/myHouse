import { useQuery } from "@tanstack/react-query";
import { api, type GarminActivity, type GarminForme, type GarminOverview } from "./api";
import { fromIso, shortDate } from "./dates";

// Garmin répond lentement et change peu : 5 minutes de cache côté écran, pas de nouvel essai sur une erreur (clé absente, expirée)
const options = { staleTime: 5 * 60_000, retry: false } as const;

export const useGarminOverview = (enabled = true) => useQuery({ queryKey: ["garmin", "overview"], queryFn: () => api<GarminOverview>("/garmin/overview"), enabled, ...options });
export const useGarminActivities = (enabled = true) => useQuery({ queryKey: ["garmin", "activities"], queryFn: () => api<GarminActivity[]>("/garmin/activities"), enabled, ...options });
export const useGarminForme = (enabled = true) => useQuery({ queryKey: ["garmin", "forme"], queryFn: () => api<GarminForme>("/garmin/forme"), enabled, ...options });

// ── Types de sorties ──────────────────────────────────────────────────

type Kind = "foot" | "bike" | "swim" | "other";
export const SPORTS: Record<string, { icon: string; label: string; kind: Kind }> = {
  running: { icon: "🏃", label: "Course", kind: "foot" },
  trail_running: { icon: "⛰️", label: "Trail", kind: "foot" },
  treadmill_running: { icon: "🏃", label: "Tapis", kind: "foot" },
  walking: { icon: "🚶", label: "Marche", kind: "foot" },
  hiking: { icon: "🥾", label: "Randonnée", kind: "foot" },
  cycling: { icon: "🚴", label: "Vélo", kind: "bike" },
  indoor_cycling: { icon: "🚴", label: "Vélo d'appart.", kind: "bike" },
  mountain_biking: { icon: "🚵", label: "VTT", kind: "bike" },
  lap_swimming: { icon: "🏊", label: "Natation", kind: "swim" },
  open_water_swimming: { icon: "🌊", label: "Eau libre", kind: "swim" },
  strength_training: { icon: "🏋️", label: "Musculation", kind: "other" },
  multi_sport: { icon: "🏅", label: "Multisport", kind: "other" },
};
export const sportOf = (type: string) => SPORTS[type] ?? { icon: "🏅", label: type.replace(/_/g, " "), kind: "other" as Kind };

// ── Formats ───────────────────────────────────────────────────────────

const fr = (n: number, digits = 1) => n.toFixed(digits).replace(".", ",");

// 7798 → « 7,8 km » ; en natation on reste en mètres
export function distance(type: string, meters: number | null) {
  if (meters === null) return null;
  if (sportOf(type).kind === "swim") return `${Math.round(meters).toLocaleString("fr-FR")} m`;
  return `${fr(meters / 1000)} km`;
}
export const km = (meters: number) => `${fr(meters / 1000)} km`;

// 2779 → « 46 min » ; 4350 → « 1 h 12 »
export function duration(seconds: number | null) {
  if (seconds === null) return null;
  const min = Math.round(seconds / 60);
  return min < 60 ? `${min} min` : `${Math.floor(min / 60)} h ${String(min % 60).padStart(2, "0")}`;
}

// allure en course à pied (min/km), vitesse à vélo (km/h), allure aux 100 m en natation
export function pace(type: string, speed: number | null) {
  if (!speed || speed <= 0) return null;
  const kind = sportOf(type).kind;
  const clock = (s: number) => `${Math.floor(s / 60)}:${String(Math.round(s % 60)).padStart(2, "0")}`;
  if (kind === "foot") return { label: "Allure", value: `${clock(1000 / speed)} /km` };
  if (kind === "bike") return { label: "Vitesse", value: `${fr(speed * 3.6)} km/h` };
  if (kind === "swim") return { label: "Allure", value: `${clock(100 / speed)} /100 m` };
  return null;
}

// « Aujourd'hui », « Hier », « Il y a 3 j », sinon « 2 nov. »
export function relativeDay(date: string, today: string) {
  const diff = Math.round((fromIso(today).getTime() - fromIso(date).getTime()) / 86400000);
  return diff <= 0 ? "Aujourd'hui" : diff === 1 ? "Hier" : diff < 7 ? `Il y a ${diff} j` : shortDate(date);
}

export const longDay = (date: string) => fromIso(date).toLocaleDateString("fr-FR", { weekday: "short", day: "numeric", month: "short" });

// effet d'entraînement Garmin (0 à 5)
export const effectLabel = (te: number) => (te < 1 ? "Aucun" : te < 2 ? "Léger" : te < 3 ? "Maintien" : te < 4 ? "Progression" : te < 5 ? "Forte progression" : "Surcharge");

export const ZONES = [
  { name: "Très facile", color: "bg-mint" },
  { name: "Facile", color: "bg-sky" },
  { name: "Aérobie", color: "bg-lemon" },
  { name: "Seuil", color: "bg-peach" },
  { name: "Maximum", color: "bg-rose" },
];

// zone de fréquence cardiaque (1 à 5) d'une valeur, 0 si en dessous de la zone 1
export const zoneOf = (hr: number, floors: number[]) => floors.filter((f) => hr >= f).length;

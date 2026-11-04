import { useQuery } from "@tanstack/react-query";
import { api, type CalorieEntry, type CalorieMeal } from "./api";

export const MEALS: { id: CalorieMeal; label: string; icon: string }[] = [
  { id: "BREAKFAST", label: "Petit-déjeuner", icon: "🥐" },
  { id: "LUNCH", label: "Déjeuner", icon: "🥗" },
  { id: "DINNER", label: "Dîner", icon: "🍝" },
  { id: "SNACK", label: "Collation", icon: "🍎" },
];

// repas proposé par défaut selon l'heure
export function mealNow(): CalorieMeal {
  const h = new Date().getHours();
  return h < 10 ? "BREAKFAST" : h < 15 ? "LUNCH" : h < 18 ? "SNACK" : "DINNER";
}

// entrées d'une plage de jours (YYYY-MM-DD, bornes incluses)
export const useCalorieEntries = (from: string, to: string, enabled = true) =>
  useQuery({ queryKey: ["calories", from, to], queryFn: () => api<CalorieEntry[]>(`/calories?from=${from}&to=${to}`), enabled });

export const totalKcal = (entries: CalorieEntry[]) => entries.reduce((sum, e) => sum + e.kcal, 0);

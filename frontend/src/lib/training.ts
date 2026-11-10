import { useQuery } from "@tanstack/react-query";
import { api, type TrainingResponse, type TrainingSport } from "./api";

// le résumé change seulement quand on lance « garmin:refresh » : 5 minutes de cache, pas de nouvel essai
export const useTraining = () => useQuery({ queryKey: ["training"], queryFn: () => api<TrainingResponse>("/training"), staleTime: 5 * 60_000, retry: false });

export const SPORT_STYLE: Record<TrainingSport, { icon: string; label: string; bar: string }> = {
  run: { icon: "🏃", label: "Course", bar: "bg-sky-deep" },
  bike: { icon: "🚴", label: "Vélo", bar: "bg-mint-deep" },
  swim: { icon: "🏊", label: "Natation", bar: "bg-lavender-deep" },
  strength: { icon: "🏋️", label: "Muscu", bar: "bg-peach-deep" },
  other: { icon: "🏅", label: "Autre", bar: "bg-lemon-deep" },
};
export const SPORT_ORDER: TrainingSport[] = ["run", "bike", "swim", "strength", "other"];

export const fr = (n: number, digits = 1) => n.toFixed(digits).replace(".", ",");
export const clock = (secPerKm: number) => {
  const t = Math.round(secPerKm); // arrondi avant de couper en minutes (sinon « 28:60 »)
  return `${Math.floor(t / 60)}:${String(t % 60).padStart(2, "0")}`;
};
export function hours(seconds: number) {
  const min = Math.round(seconds / 60);
  return min < 60 ? `${min} min` : `${Math.floor(min / 60)} h ${String(min % 60).padStart(2, "0")}`;
}
export const avg = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0);

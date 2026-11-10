import { useQuery } from "@tanstack/react-query";
import { api, type HealthResponse, type HealthSummary } from "./api";

// le fichier change seulement quand on lance « refresh.sh » : 5 minutes de cache, pas de nouvel essai
export const useHealth = () => useQuery({ queryKey: ["health"], queryFn: () => api<HealthResponse>("/wellness"), staleTime: 5 * 60_000, retry: false });
export const hasHealth = (d: HealthResponse | undefined): d is HealthSummary => !!d && !("empty" in d);

export const avg = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0);
export const n = (v: number) => Math.round(v).toLocaleString("fr-FR");
export const fr = (v: number, digits = 1) => v.toFixed(digits).replace(".", ",");

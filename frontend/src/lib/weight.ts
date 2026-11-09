import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api, type WeightEntry } from "./api";

// 72400 g → « 72,4 »
export const formatKg = (grams: number) => (grams / 1000).toFixed(1).replace(".", ",");

// saisie « 72,4 » ou « 72.4 » → grammes (NaN si illisible)
export const parseKg = (text: string) => Math.round(Number(text.replace(",", ".")) * 1000);

// pesées d'une plage de jours (YYYY-MM-DD, bornes incluses), de la plus ancienne à la plus récente
export const useWeights = (from: string, to: string) =>
  useQuery({ queryKey: ["weight", from, to], queryFn: () => api<WeightEntry[]>(`/weight?from=${from}&to=${to}`) });

// la synchronisation Garmin est proposée seulement si le serveur a une clé
export const useWeightStatus = () => useQuery({ queryKey: ["weight", "status"], queryFn: () => api<{ garmin: boolean }>("/weight/status") });

export function useGarminSync() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => api<{ imported: number }>("/weight/sync", { method: "POST" }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["weight"] }),
  });
}

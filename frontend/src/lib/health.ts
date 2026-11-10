import { useEffect, useRef } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api, type HealthResponse, type HealthSummary } from "./api";

// le fichier change seulement quand on lance « refresh.sh » : 5 minutes de cache, pas de nouvel essai
export const useHealth = () => useQuery({ queryKey: ["health"], queryFn: () => api<HealthResponse>("/wellness"), staleTime: 5 * 60_000, retry: false });
export const hasHealth = (d: HealthResponse | undefined): d is HealthSummary => !!d && !("empty" in d);

export const avg = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0);
export const n = (v: number) => Math.round(v).toLocaleString("fr-FR");
export const fr = (v: number, digits = 1) => v.toFixed(digits).replace(".", ",");

// ── Actualisation des données Garmin (Sport, Santé, Sommeil) : le serveur relance le script de récupération ──
export type SyncStatus = { running: boolean; error: string | null; updatedAt: string | null; configured: boolean };

export function useGarminSync() {
  const qc = useQueryClient();
  const status = useQuery({ queryKey: ["garmin-sync"], queryFn: () => api<SyncStatus>("/sync"), refetchInterval: (q) => (q.state.data?.running ? 3000 : false), retry: false });
  const was = useRef(false);
  const running = !!status.data?.running;
  useEffect(() => {
    // fin d'une actualisation : les pages relisent leurs données
    if (was.current && !running) for (const key of ["health", "training"]) qc.invalidateQueries({ queryKey: [key] });
    was.current = running;
  }, [running, qc]);
  const start = useMutation({ mutationFn: (auto: boolean) => api<SyncStatus>(`/sync${auto ? "?auto=1" : ""}`, { method: "POST" }), onSuccess: (s) => qc.setQueryData(["garmin-sync"], s) });
  return { status: status.data, start };
}

// au lancement de l'appli : demande une actualisation (le serveur l'ignore si les données ont moins de 30 minutes)
export function useAutoGarminSync(enabled: boolean) {
  const qc = useQueryClient();
  const { mutate } = useMutation({ mutationFn: () => api<SyncStatus>("/sync?auto=1", { method: "POST" }), onSuccess: (s) => qc.setQueryData(["garmin-sync"], s) });
  const done = useRef(false);
  useEffect(() => {
    if (enabled && !done.current) {
      done.current = true;
      mutate();
    }
  }, [enabled, mutate]);
}

import { useEffect } from "react";
import { useQueryClient } from "@tanstack/react-query";

// Temps réel : tant que l'app est à l'écran, le serveur nous dit quelles données ont changé (Server-Sent Events).
// Connexion fermée en arrière-plan (batterie) : c'est aussi ce qui permet au serveur d'envoyer une notification à la place.
export function useLiveUpdates() {
  const qc = useQueryClient();

  useEffect(() => {
    let source: EventSource | null = null;
    let connectedOnce = false;

    const open = () => {
      if (source) return;
      source = new EventSource("/api/events");
      source.onopen = () => {
        // reconnexion : des changements ont pu nous échapper pendant la coupure
        if (connectedOnce) qc.invalidateQueries();
        connectedOnce = true;
      };
      source.onmessage = (e) => {
        const { keys } = JSON.parse(e.data) as { keys: string[][] };
        keys.forEach((queryKey) => qc.invalidateQueries({ queryKey }));
      };
      // en cas d'erreur, EventSource se reconnecte tout seul
    };
    const close = () => {
      source?.close();
      source = null;
    };
    const onVisibility = () => (document.visibilityState === "visible" ? open() : close());

    onVisibility();
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      document.removeEventListener("visibilitychange", onVisibility);
      close();
    };
  }, [qc]);
}

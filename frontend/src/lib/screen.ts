import { useEffect } from "react";

// Garde l'écran allumé tant que la page est montée. Le navigateur relâche le verrou quand
// l'appli passe en arrière-plan : on le redemande à son retour.
export function useWakeLock() {
  useEffect(() => {
    if (!("wakeLock" in navigator)) return;
    let lock: WakeLockSentinel | null = null;
    let active = true;

    const request = async () => {
      if (document.visibilityState !== "visible") return;
      try {
        const l = await navigator.wakeLock.request("screen");
        if (active) lock = l;
        else l.release();
      } catch {
        // refusé (économie d'énergie…) : la carte reste utilisable
      }
    };
    const onVisible = () => {
      if (!lock || lock.released) request();
    };

    request();
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      active = false;
      document.removeEventListener("visibilitychange", onVisible);
      lock?.release().catch(() => {});
    };
  }, []);
}

import { useGarminSync } from "../../lib/health";

// « il y a 5 min » depuis la dernière actualisation des données Garmin
function ago(iso: string | null) {
  if (!iso) return "jamais";
  const min = Math.round((Date.now() - Date.parse(iso)) / 60000);
  return min < 1 ? "à l'instant" : min < 60 ? `il y a ${min} min` : min < 1440 ? `il y a ${Math.round(min / 60)} h` : `il y a ${Math.round(min / 1440)} j`;
}

// bouton d'actualisation des données Garmin (Sport, Santé, Sommeil) : le serveur relance la récupération, la page se met à jour seule
export function RefreshButton() {
  const { status, start } = useGarminSync();
  const busy = !!status?.running || start.isPending;
  return (
    <div className="flex flex-col items-end">
      <button className="rounded-full bg-white px-3 py-1.5 text-xs font-extrabold shadow-soft disabled:opacity-60" disabled={busy || status?.configured === false} onClick={() => start.mutate(false)}>
        <span className={busy ? "inline-block animate-spin" : ""}>↻</span> {busy ? "Actualisation…" : "Actualiser"}
      </button>
      <span className={`mt-1 text-[11px] font-semibold ${status?.error || start.error ? "text-rose-deep" : "text-ink-soft"}`}>
        {start.error ? start.error.message : status?.error ? "Échec de la dernière actualisation" : `⌚ Garmin · ${ago(status?.updatedAt ?? null)}`}
      </span>
    </div>
  );
}

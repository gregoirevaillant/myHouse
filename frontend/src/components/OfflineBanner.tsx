import { useOnline } from "../lib/online";

export function OfflineBanner() {
  const online = useOnline();
  if (online) return null;
  return (
    <div className="mb-4 rounded-2xl bg-lemon px-4 py-2 text-center text-sm font-bold">
      Hors ligne · liste de courses et cartes consultables
    </div>
  );
}

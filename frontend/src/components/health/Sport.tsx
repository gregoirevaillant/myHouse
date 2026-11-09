import { useState } from "react";
import { Modal } from "../Modal";
import type { GarminActivity } from "../../lib/api";
import { distance, duration, effectLabel, longDay, pace, sportOf, useGarminForme, zoneOf, ZONES } from "../../lib/garmin";

const PAGE = 15;

// une ligne de détail de sortie : étiquette discrète au-dessus, valeur en gras
function Tile({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div className="rounded-2xl bg-white p-3 shadow-soft">
      <p className="text-[11px] font-bold text-ink-soft">{label}</p>
      <p className="text-lg font-extrabold leading-tight">{value}</p>
      {hint && <p className="text-xs font-semibold text-ink-soft">{hint}</p>}
    </div>
  );
}

function Detail({ activity: a }: { activity: GarminActivity }) {
  const { data: forme } = useGarminForme();
  const sport = sportOf(a.type);
  const speed = pace(a.type, a.speed);
  const zone = a.avgHr !== null && forme?.zones ? zoneOf(a.avgHr, forme.zones.floors) : 0;
  const tiles: { label: string; value: string; hint?: string }[] = [];
  if (a.distanceM !== null) tiles.push({ label: "Distance", value: distance(a.type, a.distanceM)! });
  if (a.durationS !== null) tiles.push({ label: "Durée", value: duration(a.durationS)! });
  if (speed) tiles.push({ label: speed.label, value: speed.value });
  if (a.elevationGain) tiles.push({ label: "Dénivelé +", value: `${a.elevationGain} m` });
  if (a.avgHr !== null) tiles.push({ label: "FC moyenne", value: `${a.avgHr} bpm`, hint: zone > 0 ? `Zone ${zone} · ${ZONES[zone - 1].name}` : undefined });
  if (a.maxHr !== null) tiles.push({ label: "FC max", value: `${a.maxHr} bpm` });
  if (a.calories) tiles.push({ label: "Calories", value: `${a.calories} kcal` });
  if (a.cadence) tiles.push({ label: "Cadence", value: `${a.cadence} ${sport.kind === "bike" ? "tr/min" : "pas/min"}` });
  if (a.power) tiles.push({ label: "Puissance", value: `${a.power} W` });
  if (a.aerobic) tiles.push({ label: "Effet aérobie", value: a.aerobic.toString().replace(".", ","), hint: effectLabel(a.aerobic) });
  if (a.anaerobic) tiles.push({ label: "Effet anaérobie", value: a.anaerobic.toString().replace(".", ","), hint: effectLabel(a.anaerobic) });

  return (
    <div>
      <p className="mb-4 text-sm font-semibold text-ink-soft">
        {longDay(a.date)} · {a.time}
        {a.location && ` · ${a.location}`}
      </p>
      <div className="grid grid-cols-2 gap-2">
        {tiles.map((t) => (
          <Tile key={t.label} {...t} />
        ))}
      </div>
      {a.pr && <p className="mt-3 text-sm font-bold">🏆 Record personnel battu sur cette sortie</p>}
    </div>
  );
}

export function Sport({ activities }: { activities: GarminActivity[] }) {
  const [type, setType] = useState("all");
  const [shown, setShown] = useState(PAGE);
  const [opened, setOpened] = useState<GarminActivity | null>(null);

  // types réellement pratiqués, du plus fréquent au moins fréquent
  const counts = new Map<string, number>();
  activities.forEach((a) => counts.set(a.type, (counts.get(a.type) ?? 0) + 1));
  const types = [...counts.entries()].sort((a, b) => b[1] - a[1]);
  const list = type === "all" ? activities : activities.filter((a) => a.type === type);

  // bilan des 30 derniers jours
  const since = new Date(Date.now() - 29 * 86400000).toLocaleDateString("sv-SE", { timeZone: "Europe/Paris" });
  const month = activities.filter((a) => a.date >= since);
  const sum = (f: (a: GarminActivity) => number | null) => month.reduce((t, a) => t + (f(a) ?? 0), 0);

  if (activities.length === 0) return <p className="rounded-3xl bg-white p-6 text-center text-sm font-bold text-ink-soft shadow-soft">Aucune sortie enregistrée sur Garmin Connect.</p>;

  return (
    <div className="space-y-4">
      <div className="rounded-3xl bg-mint-soft p-4">
        <p className="text-xs font-bold uppercase tracking-wide text-ink-soft">30 derniers jours</p>
        <div className="mt-2 grid grid-cols-4 gap-2 text-center">
          {[
            ["Sorties", String(month.length)],
            ["Distance", `${(sum((a) => a.distanceM) / 1000).toFixed(0)} km`],
            ["Temps", duration(sum((a) => a.durationS)) ?? "—"],
            ["Calories", sum((a) => a.calories).toLocaleString("fr-FR")],
          ].map(([label, value]) => (
            <div key={label} className="rounded-2xl bg-white/70 px-1 py-2 dark:bg-white/10">
              <p className="text-[11px] font-bold text-ink-soft">{label}</p>
              <p className="text-sm font-extrabold">{value}</p>
            </div>
          ))}
        </div>
      </div>

      {types.length > 1 && (
        <div className="flex gap-1.5 overflow-x-auto pb-1">
          {[["all", "Tout", activities.length] as const, ...types.map(([t, c]) => [t, `${sportOf(t).icon} ${sportOf(t).label}`, c] as const)].map(([id, label, count]) => (
            <button
              key={id}
              onClick={() => {
                setType(id);
                setShown(PAGE);
              }}
              className={`shrink-0 rounded-full px-3 py-1.5 text-sm font-bold shadow-soft ${type === id ? "bg-mint" : "bg-white text-ink-soft"}`}
            >
              {label} <span className="opacity-60">{count}</span>
            </button>
          ))}
        </div>
      )}

      <div className="space-y-2">
        {list.slice(0, shown).map((a) => {
          const sport = sportOf(a.type);
          const speed = pace(a.type, a.speed);
          return (
            <button key={a.id} onClick={() => setOpened(a)} className="flex w-full items-center gap-3 rounded-3xl bg-white p-3 text-left shadow-soft active:scale-[0.99]">
              <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-mint-soft text-2xl">{sport.icon}</span>
              <span className="min-w-0 flex-1">
                <span className="block truncate font-extrabold">
                  {a.pr && "🏆 "}
                  {a.name || sport.label}
                </span>
                <span className="block truncate text-xs font-semibold text-ink-soft">
                  {longDay(a.date)} · {a.time}
                </span>
              </span>
              <span className="shrink-0 text-right">
                <span className="block font-extrabold">{distance(a.type, a.distanceM) ?? duration(a.durationS)}</span>
                <span className="block text-xs font-semibold text-ink-soft">{[a.distanceM !== null ? duration(a.durationS) : null, speed?.value].filter(Boolean).join(" · ")}</span>
              </span>
            </button>
          );
        })}
      </div>
      {list.length > shown && (
        <button className="btn-ghost w-full" onClick={() => setShown(shown + PAGE)}>
          Voir plus ({list.length - shown})
        </button>
      )}

      {opened && (
        <Modal title={`${sportOf(opened.type).icon} ${opened.name || sportOf(opened.type).label}`} onClose={() => setOpened(null)}>
          <Detail activity={opened} />
        </Modal>
      )}
    </div>
  );
}

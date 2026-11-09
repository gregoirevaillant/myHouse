import { Link } from "react-router-dom";
import type { GarminFitness, GarminForme } from "../../lib/api";
import { duration, ZONES } from "../../lib/garmin";

const fr = (v: number, digits = 1) => v.toFixed(digits).replace(".", ",");

// âge de forme de Garmin comparé à l'âge réel
function Fitness({ f }: { f: GarminFitness }) {
  if (f.age === null) return null;
  const diff = f.realAge === null ? 0 : f.age - f.realAge;
  const verdict = Math.abs(diff) < 0.5 ? "Ta forme est à la hauteur de ton âge." : diff < 0 ? `Ton corps a ${fr(-diff)} an${-diff >= 2 ? "s" : ""} de moins que ton âge réel 👏` : `Ton corps a ${fr(diff)} an${diff >= 2 ? "s" : ""} de plus que ton âge réel.`;
  const trend = f.previousAge === null ? null : f.age - f.previousAge;
  return (
    <div className="rounded-3xl bg-mint-soft p-4">
      <p className="text-xs font-bold uppercase tracking-wide text-ink-soft">Âge de forme</p>
      <p className="mt-1 text-3xl font-extrabold">
        {fr(f.age)} <span className="text-base text-ink-soft">ans</span>
      </p>
      <p className="mt-1 text-sm font-bold">{verdict}</p>
      <p className="mt-1 text-xs font-semibold text-ink-soft">
        {f.realAge !== null && `Âge réel ${f.realAge} ans`}
        {f.bestAge !== null && ` · meilleur atteignable ${f.bestAge} ans`}
        {trend !== null && Math.abs(trend) >= 0.1 && ` · ${trend < 0 ? "↘ en baisse" : "↗ en hausse"} de ${fr(Math.abs(trend))} depuis la dernière mesure`}
      </p>
      <ul className="mt-3 space-y-1.5 text-sm font-semibold">
        {f.bodyFat?.value != null && <li>⚖️ Masse grasse {fr(f.bodyFat.value)} %{f.bodyFat.target != null && <span className="text-ink-soft"> · cible {fr(f.bodyFat.target)} %</span>}</li>}
        {f.vigorousDays?.value != null && <li>🔥 {fr(f.vigorousDays.value)} jours intenses par semaine{f.vigorousDays.target != null && <span className="text-ink-soft"> · cible {fr(f.vigorousDays.target, 0)}</span>}</li>}
        {f.vigorousMinutes !== null && <li>⏱️ {f.vigorousMinutes} min intenses par semaine</li>}
      </ul>
    </div>
  );
}

function Zones({ zones }: { zones: NonNullable<GarminForme["zones"]> }) {
  return (
    <div className="rounded-3xl bg-white p-4 shadow-soft">
      <div className="flex items-baseline justify-between">
        <p className="text-xs font-bold uppercase tracking-wide text-ink-soft">Zones cardiaques</p>
        <p className="text-xs font-bold text-ink-soft">FC max {zones.max} bpm</p>
      </div>
      <ul className="mt-3 space-y-2">
        {zones.floors.map((floor, i) => {
          const top = i < 4 ? zones.floors[i + 1] - 1 : zones.max;
          return (
            <li key={floor} className="flex items-center gap-3 text-sm">
              <span className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-xs font-extrabold ${ZONES[i].color}`}>{i + 1}</span>
              <span className="flex-1 font-bold">{ZONES[i].name}</span>
              <span className="font-semibold text-ink-soft">
                {floor}–{top} bpm
              </span>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

function Sleep({ nights }: { nights: GarminForme["sleep"] }) {
  const last = nights[nights.length - 1];
  const max = Math.max(...nights.map((n) => n.seconds), 8 * 3600);
  const part = (s: number) => `${(s / last.seconds) * 100}%`;
  return (
    <div className="rounded-3xl bg-lavender-soft p-4">
      <p className="text-xs font-bold uppercase tracking-wide text-ink-soft">Sommeil · dernière nuit</p>
      <p className="mt-1 text-2xl font-extrabold">{duration(last.seconds)}</p>
      <div className="mt-2 flex h-3 overflow-hidden rounded-full bg-white">
        <span className="bg-lavender-deep" style={{ width: part(last.deep) }} />
        <span className="bg-lavender" style={{ width: part(last.light) }} />
        <span className="bg-sky" style={{ width: part(last.rem) }} />
        <span className="bg-rose" style={{ width: part(last.awake) }} />
      </div>
      <p className="mt-1.5 text-xs font-semibold text-ink-soft">Profond {duration(last.deep)} · léger {duration(last.light)} · paradoxal {duration(last.rem)} · éveillé {duration(last.awake)}</p>
      <div className="mt-3 flex h-12 items-end gap-1">
        {nights.map((n) => (
          <span key={n.date} className="flex-1 rounded-t-md bg-lavender-deep/70" style={{ height: `${(n.seconds / max) * 100}%` }} title={`${n.date} : ${duration(n.seconds)}`} />
        ))}
      </div>
    </div>
  );
}

export function Forme({ fitness, forme }: { fitness: GarminFitness | null; forme: GarminForme }) {
  return (
    <div className="space-y-4">
      {fitness && <Fitness f={fitness} />}
      {forme.zones && <Zones zones={forme.zones} />}
      {forme.sleep.length > 0 && <Sleep nights={forme.sleep} />}
      <Link to="/poids" className="flex items-center justify-between rounded-3xl bg-sky-soft p-4 font-extrabold shadow-soft">
        <span>⚖️ Poids, muscle et masse grasse</span>
        <span aria-hidden>→</span>
      </Link>
      {forme.sleep.length === 0 && (
        <p className="px-2 text-center text-xs font-semibold text-ink-soft">
          Sommeil, stress, variabilité cardiaque et hydratation : ta montre n'en envoie pas pour l'instant. Ils apparaîtront ici dès qu'elle les mesurera.
        </p>
      )}
    </div>
  );
}

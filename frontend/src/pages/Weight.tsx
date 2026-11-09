import { useState, type FormEvent } from "react";
import { Modal } from "../components/Modal";
import { WeightForm } from "../components/WeightForm";
import type { WeightEntry } from "../lib/api";
import { useMe, useUpdatePreferences } from "../lib/auth";
import { addDays, fromIso, shortDate, toIso } from "../lib/dates";
import { formatKg, parseKg, useGarminSync, useWeights, useWeightStatus } from "../lib/weight";

const RANGES = [
  { days: 30, label: "30 j" },
  { days: 90, label: "3 mois" },
  { days: 365, label: "1 an" },
];

const signed = (grams: number) => `${grams > 0 ? "+" : grams < 0 ? "−" : ""}${formatKg(Math.abs(grams))}`;

// courbe des pesées de la période, avec le poids visé en pointillés
function Chart({ entries, from, to, goal }: { entries: WeightEntry[]; from: string; to: string; goal: number | null }) {
  const W = 320;
  const H = 150;
  const left = 34;
  const span = Math.max(1, (fromIso(to).getTime() - fromIso(from).getTime()) / 86400000);
  const values = [...entries.map((e) => e.grams), ...(goal ? [goal] : [])];
  const min = Math.min(...values) - 500;
  const max = Math.max(...values) + 500;
  const x = (date: string) => left + ((fromIso(date).getTime() - fromIso(from).getTime()) / 86400000 / span) * (W - left - 6);
  const y = (g: number) => 8 + (1 - (g - min) / (max - min)) * (H - 24);
  const points = entries.map((e) => `${x(e.date).toFixed(1)},${y(e.grams).toFixed(1)}`);
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="w-full" role="img" aria-label="Courbe du poids">
      <text x={0} y={y(max) + 8} className="fill-ink-soft text-[9px] font-bold">{formatKg(max)}</text>
      <text x={0} y={y(min)} className="fill-ink-soft text-[9px] font-bold">{formatKg(min)}</text>
      {goal && (
        <line x1={left} x2={W - 6} y1={y(goal)} y2={y(goal)} className="stroke-mint-deep" strokeWidth={1.5} strokeDasharray="4 4" />
      )}
      {points.length > 1 && <polyline points={points.join(" ")} fill="none" className="stroke-sky-deep" strokeWidth={2.5} strokeLinejoin="round" strokeLinecap="round" />}
      {entries.length <= 60 && entries.map((e, i) => {
        const [cx, cy] = points[i].split(",");
        return <circle key={e.id} cx={cx} cy={cy} r={3} className="fill-sky-deep" />;
      })}
      <text x={left} y={H - 2} className="fill-ink-soft text-[9px] font-bold">{shortDate(from)}</text>
      <text x={W - 6} y={H - 2} textAnchor="end" className="fill-ink-soft text-[9px] font-bold">{shortDate(to)}</text>
    </svg>
  );
}

export function Weight() {
  const { data: me } = useMe();
  const today = toIso(new Date());
  const [days, setDays] = useState(90);
  const [opened, setOpened] = useState<{ entry?: WeightEntry } | null>(null);
  const [goalOpen, setGoalOpen] = useState(false);
  const from = addDays(today, -days);
  const { data: entries = [], isLoading } = useWeights(from, today);
  const { data: status } = useWeightStatus();
  const sync = useGarminSync();
  const goal = me?.weightGoal ?? null;
  const last = entries[entries.length - 1];
  const first = entries[0];
  const bodyFat = [...entries].reverse().find((e) => e.bodyFat !== null)?.bodyFat;

  return (
    <section>
      <div className="mb-4 flex items-center justify-between">
        <h2 className="flex items-center gap-2 text-lg font-extrabold">
          <span className="rounded-xl bg-sky px-2 py-1">⚖️</span> Poids
        </h2>
        <div className="flex gap-2">
          {status?.garmin && (
            <button className="btn bg-white px-4 py-2 shadow-soft" disabled={sync.isPending} onClick={() => sync.mutate()}>
              {sync.isPending ? "…" : "⌚ Garmin"}
            </button>
          )}
          <button className="btn bg-sky px-4 py-2 shadow-soft" onClick={() => setOpened({})}>
            + Ajouter
          </button>
        </div>
      </div>
      {sync.isSuccess && <p className="mb-3 text-sm font-bold text-ink-soft">{sync.data.imported} pesée{sync.data.imported > 1 ? "s" : ""} synchronisée{sync.data.imported > 1 ? "s" : ""} depuis Garmin.</p>}
      {sync.isError && <p className="mb-3 text-sm font-bold text-rose-deep">{sync.error.message}</p>}

      <div className="mb-4 rounded-3xl bg-sky-soft p-4">
        <div className="flex items-baseline justify-between">
          <p className="text-3xl font-extrabold">
            {last ? formatKg(last.grams) : "—"} <span className="text-base text-ink-soft">kg</span>
          </p>
          <button className="text-sm font-bold text-ink-soft underline" onClick={() => setGoalOpen(true)}>
            {goal ? `objectif ${formatKg(goal)} kg` : "Fixer un objectif"}
          </button>
        </div>
        {last && (
          <p className="mt-1 text-sm font-bold text-ink-soft">
            {first && first.id !== last.id && `${signed(last.grams - first.grams)} kg depuis le ${shortDate(first.date)}`}
            {goal && ` · ${last.grams === goal ? "objectif atteint" : `${formatKg(Math.abs(last.grams - goal))} kg ${last.grams > goal ? "à perdre" : "à prendre"}`}`}
            {bodyFat != null && ` · ${bodyFat.toString().replace(".", ",")} % de masse grasse`}
          </p>
        )}
        <div className="mt-3 flex gap-1.5">
          {RANGES.map((r) => (
            <button key={r.days} onClick={() => setDays(r.days)} className={`rounded-full px-3 py-1 text-sm font-bold shadow-soft ${days === r.days ? "bg-sky" : "bg-white text-ink-soft"}`}>
              {r.label}
            </button>
          ))}
        </div>
        {entries.length > 0 ? (
          <div className="mt-3"><Chart entries={entries} from={from} to={today} goal={goal} /></div>
        ) : (
          !isLoading && <p className="mt-4 text-center text-sm font-bold text-ink-soft">Aucune pesée sur cette période</p>
        )}
      </div>

      {isLoading ? (
        <p className="text-center text-ink-soft">Chargement…</p>
      ) : (
        <div className="rounded-3xl bg-white p-3 shadow-soft">
          {[...entries].reverse().slice(0, 30).map((e, i, list) => {
            const prev = list[i + 1];
            return (
              <button key={e.id} onClick={() => setOpened({ entry: e })} className="flex w-full items-center justify-between gap-3 rounded-xl px-1 py-2 text-left font-semibold active:bg-sky-soft">
                <span className="min-w-0 truncate">
                  {e.source === "GARMIN" && "⌚ "}
                  {shortDate(e.date)}
                </span>
                <span className="shrink-0 text-sm">
                  {prev && <span className="mr-2 text-ink-soft">{signed(e.grams - prev.grams)}</span>}
                  <span className="font-extrabold">{formatKg(e.grams)} kg</span>
                </span>
              </button>
            );
          })}
          {entries.length === 0 && <p className="py-2 text-center text-sm text-ink-soft">Ajoute ta première pesée{status?.garmin ? " ou synchronise ta balance Garmin" : ""}.</p>}
        </div>
      )}

      {opened && (
        <Modal title={opened.entry ? "Modifier la pesée" : "Ajouter une pesée"} onClose={() => setOpened(null)}>
          <WeightForm entry={opened.entry} onDone={() => setOpened(null)} />
        </Modal>
      )}
      {goalOpen && (
        <Modal title="Poids visé" onClose={() => setGoalOpen(false)}>
          <GoalForm goal={goal} onDone={() => setGoalOpen(false)} />
        </Modal>
      )}
    </section>
  );
}

function GoalForm({ goal, onDone }: { goal: number | null; onDone: () => void }) {
  const update = useUpdatePreferences();
  const [value, setValue] = useState(goal ? formatKg(goal) : "");
  const grams = parseKg(value);
  const valid = grams >= 30000 && grams <= 300000;

  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (valid) update.mutate({ weightGoal: grams }, { onSuccess: onDone });
  };

  return (
    <form onSubmit={submit} className="space-y-4">
      <div>
        <label className="label" htmlFor="w-goal">Poids visé (kg)</label>
        <input id="w-goal" className="input focus:border-sky" inputMode="decimal" placeholder="70" value={value} onChange={(e) => setValue(e.target.value.replace(/[^\d.,]/g, ""))} />
        {value && !valid && <p className="mt-1 text-sm font-bold text-rose-deep">Entre une valeur entre 30 et 300 kg</p>}
      </div>
      <button className="btn-primary w-full" disabled={!valid || update.isPending}>Enregistrer</button>
      {goal !== null && (
        <button type="button" className="w-full text-sm font-bold text-ink-soft" onClick={() => update.mutate({ weightGoal: null }, { onSuccess: onDone })}>
          Retirer l'objectif
        </button>
      )}
    </form>
  );
}

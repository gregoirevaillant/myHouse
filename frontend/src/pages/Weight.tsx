import { useState, type FormEvent } from "react";
import { Modal } from "../components/Modal";
import { WeightForm } from "../components/WeightForm";
import type { WeightEntry } from "../lib/api";
import { useMe, useUpdatePreferences } from "../lib/auth";
import { addDays, fromIso, shortDate, toIso } from "../lib/dates";
import { analyse, formatKg, parseKg, useGarminSync, useWeights, useWeightStatus } from "../lib/weight";

const RANGES = [
  { days: 30, label: "30 j" },
  { days: 90, label: "3 mois" },
  { days: 365, label: "1 an" },
];

const signed = (grams: number) => `${grams > 0 ? "+" : grams < 0 ? "−" : ""}${formatKg(Math.abs(grams))}`;

// graduation « ronde » (0,5 / 1 / 2 / 5 kg…) qui donne 3 à 6 lignes horizontales
function niceStep(range: number) {
  const steps = [500, 1000, 2000, 5000, 10000];
  return steps.find((st) => range / st <= 5) ?? 20000;
}

// courbe des pesées : lignes grises de repère (kg à l'horizontale, semaines et mois à la verticale), poids visé en pointillés
function Chart({ entries, from, to, goal }: { entries: { id: string; date: string; grams: number }[]; from: string; to: string; goal: number | null }) {
  const W = 320;
  const H = 190;
  const left = 30;
  const right = 8;
  const top = 10;
  const bottom = 22;
  const dayMs = 86400000;
  const span = Math.max(1, (fromIso(to).getTime() - fromIso(from).getTime()) / dayMs);
  const values = [...entries.map((e) => e.grams), ...(goal ? [goal] : [])];
  const step = niceStep(Math.max(...values) - Math.min(...values) + 1000);
  const min = Math.floor((Math.min(...values) - 200) / step) * step;
  const max = Math.ceil((Math.max(...values) + 200) / step) * step;
  const x = (date: string) => left + ((fromIso(date).getTime() - fromIso(from).getTime()) / dayMs / span) * (W - left - right);
  const y = (g: number) => top + (1 - (g - min) / (max - min)) * (H - top - bottom);
  const hLines = Array.from({ length: Math.round((max - min) / step) + 1 }, (_, i) => min + i * step);

  // repères verticaux : le 1er de chaque mois (avec son nom) et chaque lundi (trait plus discret) ; sur 30 jours, un repère par semaine daté
  const vLines: { date: string; label?: string }[] = [];
  for (let d = from; d <= to; d = addDays(d, 1)) {
    const date = fromIso(d);
    if (span <= 35) {
      if ((fromIso(to).getTime() - date.getTime()) / dayMs % 7 === 0) vLines.push({ date: d, label: shortDate(d) });
    } else if (date.getDate() === 1) {
      vLines.push({ date: d, label: date.toLocaleDateString("fr-FR", { month: "short" }).replace(".", "") });
    } else if (span <= 100 && date.getDay() === 1) {
      vLines.push({ date: d });
    }
  }

  const points = entries.map((e) => ({ id: e.id, px: x(e.date), py: y(e.grams), grams: e.grams }));
  const line = points.map((p) => `${p.px.toFixed(1)},${p.py.toFixed(1)}`).join(" ");
  const lastPoint = points[points.length - 1];
  const baseY = H - bottom;
  const area = points.length > 1 ? `M${points[0].px.toFixed(1)},${baseY} L${line.split(" ").join(" L")} L${lastPoint.px.toFixed(1)},${baseY} Z` : "";

  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="w-full" role="img" aria-label="Courbe du poids">
      {hLines.map((g) => (
        <g key={g}>
          <line x1={left} x2={W - right} y1={y(g)} y2={y(g)} className="stroke-ink-soft/25" strokeWidth={0.6} />
          <text x={left - 4} y={y(g) + 3} textAnchor="end" className="fill-ink-soft text-[8px] font-bold">{formatKg(g)}</text>
        </g>
      ))}
      {vLines.map((v) => (
        <g key={v.date}>
          <line x1={x(v.date)} x2={x(v.date)} y1={top} y2={baseY} className={v.label ? "stroke-ink-soft/25" : "stroke-ink-soft/15"} strokeWidth={0.6} />
          {v.label && <text x={x(v.date)} y={H - 7} textAnchor="middle" className="fill-ink-soft text-[8px] font-bold">{v.label}</text>}
        </g>
      ))}
      {goal && (
        <>
          <line x1={left} x2={W - right} y1={y(goal)} y2={y(goal)} className="stroke-mint-deep" strokeWidth={1.5} strokeDasharray="4 4" />
          <text x={W - right} y={y(goal) - 3} textAnchor="end" className="fill-mint-deep text-[8px] font-extrabold">objectif {formatKg(goal)}</text>
        </>
      )}
      {area && <path d={area} className="fill-sky-deep/10" />}
      {points.length > 1 && <polyline points={line} fill="none" className="stroke-sky-deep" strokeWidth={2.5} strokeLinejoin="round" strokeLinecap="round" />}
      {points.length <= 60 && points.map((p) => <circle key={p.id} cx={p.px} cy={p.py} r={2.5} className="fill-sky-deep" />)}
      {lastPoint && (
        <>
          <circle cx={lastPoint.px} cy={lastPoint.py} r={4.5} className="fill-sky-deep stroke-white" strokeWidth={2} />
          <text x={Math.min(lastPoint.px, W - right - 14)} y={lastPoint.py - 9} textAnchor="middle" className="fill-ink text-[9px] font-extrabold">{formatKg(lastPoint.grams)}</text>
        </>
      )}
    </svg>
  );
}

export function Weight() {
  const { data: me } = useMe();
  const today = toIso(new Date());
  const [days, setDays] = useState(90);
  const [opened, setOpened] = useState<{ entry?: WeightEntry } | null>(null);
  const [goalOpen, setGoalOpen] = useState(false);
  const [metric, setMetric] = useState<"weight" | "muscle">("weight");
  const from = addDays(today, -days);
  const { data: entries = [], isLoading } = useWeights(from, today);
  const { data: status } = useWeightStatus();
  const sync = useGarminSync();
  const goal = me?.weightGoal ?? null;
  const last = entries[entries.length - 1];
  const first = entries[0];
  const analysis = analyse(entries);
  const muscleSeries = entries.filter((e) => e.muscleGrams !== null).map((e) => ({ id: e.id, date: e.date, grams: e.muscleGrams! }));
  const lastMuscle = muscleSeries[muscleSeries.length - 1];
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
            {lastMuscle && ` · ${formatKg(lastMuscle.grams)} kg de muscle`}
            {bodyFat != null && ` · ${bodyFat.toString().replace(".", ",")} % de gras`}
          </p>
        )}
        <div className="mt-3 flex gap-1.5">
          {RANGES.map((r) => (
            <button key={r.days} onClick={() => setDays(r.days)} className={`rounded-full px-3 py-1 text-sm font-bold shadow-soft ${days === r.days ? "bg-sky" : "bg-white text-ink-soft"}`}>
              {r.label}
            </button>
          ))}
        </div>
        {muscleSeries.length > 1 && (
          <div className="mt-3 flex gap-1.5">
            {([["weight", "Poids"], ["muscle", "Muscle"]] as const).map(([id, label]) => (
              <button key={id} onClick={() => setMetric(id)} className={`rounded-full px-3 py-1 text-sm font-bold shadow-soft ${metric === id ? "bg-lavender" : "bg-white text-ink-soft"}`}>
                {label}
              </button>
            ))}
          </div>
        )}
        {entries.length > 0 ? (
          <div className="mt-3">
            <Chart entries={metric === "muscle" && muscleSeries.length > 1 ? muscleSeries : entries} from={from} to={today} goal={metric === "weight" ? goal : null} />
          </div>
        ) : (
          !isLoading && <p className="mt-4 text-center text-sm font-bold text-ink-soft">Aucune pesée sur cette période</p>
        )}
      </div>

      {analysis && <AnalysisCard analysis={analysis} days={days} />}

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

const TONES = { good: "bg-mint-soft", neutral: "bg-lemon-soft", bad: "bg-rose-soft" } as const;

const delta = (g: number | null) => (g === null ? "—" : `${signed(g)} kg`);

// ce que la variation de poids est réellement faite : muscle, gras, reste (eau, os…)
function AnalysisCard({ analysis, days }: { analysis: NonNullable<ReturnType<typeof analyse>>; days: number }) {
  const { verdict } = analysis;
  const period = days === 30 ? "30 derniers jours" : days === 90 ? "3 derniers mois" : "12 derniers mois";
  return (
    <div className={`mb-4 rounded-3xl p-4 ${verdict ? TONES[verdict.tone] : "bg-white shadow-soft"}`}>
      <p className="text-xs font-bold uppercase tracking-wide text-ink-soft">Analyse · {period}</p>
      {verdict ? (
        <>
          <p className="mt-1 text-lg font-extrabold">{verdict.icon} {verdict.title}</p>
          <p className="mt-1 text-sm font-semibold">{verdict.text}</p>
        </>
      ) : (
        <p className="mt-1 text-sm font-semibold">Ajoute la masse musculaire (ou synchronise ta balance Garmin) pour savoir si tu prends ou perds du muscle.</p>
      )}
      <div className="mt-3 grid grid-cols-4 gap-2 text-center">
        {([["Poids", analysis.weight], ["Muscle", analysis.muscle], ["Gras", analysis.fat], ["Eau, os…", analysis.other]] as const).map(([label, value]) => (
          <div key={label} className="rounded-2xl bg-white/70 px-1 py-2 dark:bg-white/10">
            <p className="text-[11px] font-bold text-ink-soft">{label}</p>
            <p className="text-sm font-extrabold">{delta(value)}</p>
          </div>
        ))}
      </div>
      <p className="mt-2 text-[11px] font-semibold text-ink-soft">Début et fin = moyenne de 3 pesées. La balance estime le muscle et le gras par impédance : l'hydratation les fait varier, juge sur plusieurs semaines.</p>
    </div>
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

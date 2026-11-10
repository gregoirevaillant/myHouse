import { useState, type ReactNode } from "react";
import { Heatmap, Line, Spark, StackedBars, type Cell, type StackBar } from "../components/training/Charts";
import type { TrainingBucket, TrainingRecord, TrainingSummary, TrainingWeek } from "../lib/api";
import { addDays, fromIso, shortDate } from "../lib/dates";
import { ZONES } from "../lib/garmin";
import { avg, clock, fr, hours, SPORT_ORDER, SPORT_STYLE, useTraining } from "../lib/training";

const PERIODS = [
  { id: 4, label: "4 sem." },
  { id: 12, label: "12 sem." },
  { id: 26, label: "6 mois" },
  { id: 52, label: "1 an" },
] as const;

const METRICS = {
  km: { label: "Distance", tick: (v: number) => `${v} km`, val: (b: TrainingBucket) => b.km, fmt: (v: number) => `${fr(v)} km` },
  sec: { label: "Temps", tick: (v: number) => `${Math.round(v / 3600)} h`, val: (b: TrainingBucket) => b.sec, fmt: (v: number) => hours(v) },
  n: { label: "Séances", tick: (v: number) => String(v), val: (b: TrainingBucket) => b.n, fmt: (v: number) => `${v} séance${v > 1 ? "s" : ""}` },
} as const;

const Card = ({ title, hint, children }: { title: string; hint?: string; children: ReactNode }) => (
  <div className="mb-4 rounded-3xl bg-white p-4 shadow-soft">
    <h3 className="font-extrabold">{title}</h3>
    {hint ? <p className="mb-3 text-xs font-semibold text-ink-soft">{hint}</p> : <div className="mb-3" />}
    {children}
  </div>
);

const sum = (ws: TrainingWeek[], f: (w: TrainingWeek) => number) => ws.reduce((s, w) => s + f(w), 0);
const pct = (now: number, ref: number) => (ref > 0 ? Math.round(((now - ref) / ref) * 100) : null);
const Delta = ({ d, invert }: { d: number | null; invert?: boolean }) =>
  d === null ? <span className="text-xs font-bold text-ink/40">—</span> : (
    <span className={`text-xs font-extrabold ${d === 0 ? "text-ink/50" : (d > 0) !== !!invert ? "text-mint-deep" : "text-rose-deep"}`}>{d > 0 ? "▲" : d < 0 ? "▼" : "•"} {Math.abs(d)} %</span>
  );

function Kpi({ label, value, d, invert, series, bg }: { label: string; value: string; d: number | null; invert?: boolean; series: number[]; bg: string }) {
  return (
    <div className={`rounded-3xl p-4 shadow-soft ${bg}`}>
      <p className="text-xs font-extrabold uppercase tracking-wide text-ink/60">{label}</p>
      <p className="mt-1 text-2xl font-extrabold leading-tight">{value}</p>
      <div className="mt-1 flex items-center justify-between gap-2"><Delta d={d} invert={invert} /><span className="w-16"><Spark values={series} /></span></div>
    </div>
  );
}

function Records({ s }: { s: TrainingSummary }) {
  const r = s.records;
  const rows: { icon: string; label: string; value: string; sub: string }[] = [];
  const add = (icon: string, label: string, rec: TrainingRecord | null, value: (x: TrainingRecord) => string) => rec && rows.push({ icon, label, value: value(rec), sub: shortDate(rec.date) });
  add("🏃", "Plus longue course", r.longestRun, (x) => `${fr(x.km)} km`);
  add("⚡", "Meilleur 5 km", r.fastest5k, (x) => `${clock(x.paceSecPerKm ?? 0)} /km`);
  add("⚡", "Meilleur 10 km", r.fastest10k, (x) => `${clock(x.paceSecPerKm ?? 0)} /km`);
  add("🚴", "Plus longue sortie vélo", r.longestRide, (x) => `${fr(x.km, 0)} km`);
  add("🏊", "Plus longue nage", r.longestSwim, (x) => `${fr(x.km, 2)} km`);
  add("⛰️", "Plus gros dénivelé", r.mostElevation, (x) => `${x.elev} m`);
  add("⏱️", "Plus longue séance", r.longestSession, (x) => hours(x.sec));
  if (r.biggestWeek) rows.push({ icon: "📅", label: "Plus grosse semaine", value: `${fr(r.biggestWeek.km)} km`, sub: `${r.biggestWeek.n} séances · sem. du ${shortDate(r.biggestWeek.start)}` });
  return (
    <div className="grid grid-cols-2 gap-2">
      {rows.map((x) => (
        <div key={x.label} className="rounded-2xl bg-cream p-3">
          <p className="text-xs font-bold text-ink-soft">{x.icon} {x.label}</p>
          <p className="text-lg font-extrabold">{x.value}</p>
          <p className="text-xs font-semibold text-ink-soft">{x.sub}</p>
        </div>
      ))}
    </div>
  );
}

function Content({ s }: { s: TrainingSummary }) {
  const [n, setN] = useState<(typeof PERIODS)[number]["id"]>(12);
  const [metric, setMetric] = useState<keyof typeof METRICS>("km");
  const m = METRICS[metric];
  const goal = s.goal.runsPerWeek;

  const all = s.weeks;
  const ws = all.slice(-n);
  const cur = all[all.length - 1];
  const prev = all.length >= 2 * n ? all.slice(-2 * n, -n) : null; // période précédente de même durée, si l'historique la couvre
  const from = ws[0].start;
  const axisEvery = Math.max(1, Math.ceil(ws.length / 4));
  const wLabel = (w: TrainingWeek) => `Sem. du ${shortDate(w.start)}${w === cur ? " (en cours)" : ""}`;

  const tot = (f: (w: TrainingWeek) => number) => sum(ws, f);
  const cmp = (f: (w: TrainingWeek) => number) => (prev ? pct(tot(f), sum(prev, f)) : null);
  const runSec = tot((w) => w.by.run.dsec), runKm = tot((w) => w.by.run.km);
  const prevPace = prev && sum(prev, (w) => w.by.run.km) > 0 ? sum(prev, (w) => w.by.run.dsec) / sum(prev, (w) => w.by.run.km) : null;
  const pace = runKm > 0 ? runSec / runKm : null;

  const weightsIn = s.weights.filter((w) => w.date >= from);
  const lastW = s.weights[s.weights.length - 1];
  const firstW = weightsIn[0];

  // régularité : calendrier, semaines à l'objectif, série en cours
  const sec = new Map(s.calendar.map((c) => [c.date, c]));
  const columns: Cell[][] = ws.map((w) =>
    Array.from({ length: 7 }, (_, i) => {
      const date = addDays(w.start, i);
      if (date > s.today) return null;
      const c = sec.get(date);
      const day = fromIso(date).toLocaleDateString("fr-FR", { weekday: "long", day: "numeric", month: "short" });
      return { date, sec: c?.sec ?? 0, label: c ? `${day} · ${hours(c.sec)} de ${SPORT_STYLE[c.sport].label.toLowerCase()}` : `${day} · repos` };
    }),
  );
  const activeDays = columns.flat().filter((c) => c && c.sec > 0).length;
  const onGoal = ws.slice(0, -1).filter((w) => w.by.run.n >= goal).length;
  let streak = 0;
  for (let i = all.length - 2; i >= 0 && all[i].by.run.n >= goal; i--) streak++;
  const race = s.goal.raceDate ? Math.ceil((fromIso(s.goal.raceDate).getTime() - fromIso(s.today).getTime()) / 86400000) : null;

  const volume: StackBar[] = ws.map((w, i) => ({
    key: w.start, label: wLabel(w), axis: i % axisEvery === 0 ? shortDate(w.start) : "", current: w === cur,
    tooltip: `${wLabel(w)} · ${m.fmt(m.val(w))}`, parts: SPORT_ORDER.map((k) => ({ value: m.val(w.by[k]), color: SPORT_STYLE[k].bar })),
  }));
  const loadBars: StackBar[] = ws.map((w, i) => ({
    key: w.start, label: wLabel(w), axis: i % axisEvery === 0 ? shortDate(w.start) : "", current: w === cur,
    tooltip: `${wLabel(w)} · charge ${w.load}`, parts: SPORT_ORDER.map((k) => ({ value: w.by[k].load, color: SPORT_STYLE[k].bar })),
  }));
  const zoneBars: StackBar[] = ws.map((w, i) => ({
    key: w.start, label: wLabel(w), axis: i % axisEvery === 0 ? shortDate(w.start) : "", current: w === cur,
    tooltip: `${wLabel(w)} · ${w.zones.map((z, k) => `Z${k + 1} ${hours(z)}`).join(" · ")}`,
    parts: w.zones.map((z, k) => ({ value: z, color: ZONES[k].color })),
  }));
  const zoneTot = [0, 1, 2, 3, 4].map((k) => sum(ws, (w) => w.zones[k]));
  const zoneAll = zoneTot.reduce((a, b) => a + b, 0);
  const strengthBars: StackBar[] = ws.map((w, i) => ({
    key: w.start, label: wLabel(w), axis: i % axisEvery === 0 ? shortDate(w.start) : "", current: w === cur,
    tooltip: `${wLabel(w)} · ${w.by.strength.n} séance${w.by.strength.n > 1 ? "s" : ""} de muscu`, parts: [{ value: w.by.strength.n, color: SPORT_STYLE.strength.bar }],
  }));
  const strengthN = tot((w) => w.by.strength.n);

  const shareTot = tot((w) => w.sec);
  const paceWeeks = ws.filter((w) => w.by.run.km >= 3).map((w) => ({ label: shortDate(w.start), value: Math.round(w.by.run.dsec / w.by.run.km) }));
  const dayPts = (get: (d: TrainingSummary["days"][number]) => number | null) => s.days.filter((d) => d.date >= from && get(d) !== null).map((d) => ({ label: shortDate(d.date), value: get(d)! }));
  const rhr = dayPts((d) => d.rhr), sleep = dayPts((d) => d.sleepH);
  const hrv = s.days.filter((d) => d.date >= from && d.hrv !== null).map((d) => ({ label: shortDate(d.date), value: d.hrv!, extra: d.hrvWeekly }));
  const series = (f: (w: TrainingWeek) => number) => ws.map(f);
  const line = (key: "kg" | "muscle" | "fat") => weightsIn.filter((w) => w[key]).map((w) => ({ label: shortDate(w.date), value: w[key]! }));

  return (
    <>
      <div className="mb-4 grid grid-cols-4 gap-1 rounded-2xl bg-white p-1 shadow-soft" role="tablist">
        {PERIODS.map((p) => (
          <button key={p.id} role="tab" aria-selected={n === p.id} onClick={() => setN(p.id)} className={`rounded-xl py-2 text-sm font-extrabold transition ${n === p.id ? "bg-lemon" : "text-ink-soft"}`}>{p.label}</button>
        ))}
      </div>

      <div className="mb-4 grid grid-cols-2 gap-3">
        <Kpi bg="bg-sky" label="Distance" value={`${fr(tot((w) => w.km), 0)} km`} d={cmp((w) => w.km)} series={series((w) => w.km)} />
        <Kpi bg="bg-mint" label="Temps" value={hours(tot((w) => w.sec))} d={cmp((w) => w.sec)} series={series((w) => w.sec)} />
        <Kpi bg="bg-peach" label="Séances" value={String(tot((w) => w.n))} d={cmp((w) => w.n)} series={series((w) => w.n)} />
        <Kpi bg="bg-lavender" label="Charge" value={String(tot((w) => w.load))} d={cmp((w) => w.load)} series={series((w) => w.load)} />
        <Kpi bg="bg-lemon" label="Dénivelé" value={`${tot((w) => w.elev).toLocaleString("fr-FR")} m`} d={cmp((w) => w.elev)} series={series((w) => w.elev)} />
        {pace && <Kpi bg="bg-rose" label="Allure course" value={`${clock(pace)} /km`} d={prevPace ? pct(pace, prevPace) : null} invert series={ws.map((w) => (w.by.run.km > 0 ? w.by.run.dsec / w.by.run.km : 0)).filter(Boolean)} />}
        {lastW && <Kpi bg="bg-sky" label="Poids" value={`${fr(lastW.kg)} kg`} d={null} series={weightsIn.map((w) => w.kg)} />}
        {lastW && firstW && firstW !== lastW && <div className="-mt-1 col-span-2 text-center text-xs font-bold text-ink-soft">Poids sur la période : {lastW.kg - firstW.kg > 0 ? "+" : "−"}{fr(Math.abs(lastW.kg - firstW.kg))} kg</div>}
      </div>
      <p className="-mt-2 mb-4 text-center text-xs font-semibold text-ink-soft">{prev ? "Comparé à la période précédente de même durée · semaine en cours incluse" : "Pas assez d'historique pour comparer"}</p>

      <Card title="Régularité" hint={`${activeDays} jour${activeDays > 1 ? "s" : ""} de sport · ${fr(avg(ws.map((w) => w.n)))} séances par semaine`}>
        <Heatmap columns={columns} />
        <div className="mt-3 grid grid-cols-2 gap-2 text-sm font-bold">
          <div className="rounded-2xl bg-cream p-3"><p className="text-xs text-ink-soft">Objectif {goal} courses/sem.</p><p className="text-lg font-extrabold">{onGoal}/{Math.max(ws.length - 1, 0)} semaines</p></div>
          <div className="rounded-2xl bg-cream p-3"><p className="text-xs text-ink-soft">Série en cours</p><p className="text-lg font-extrabold">{streak > 0 ? `🔥 ${streak} sem.` : "—"}</p></div>
          {race !== null && race >= 0 && <div className="col-span-2 rounded-2xl bg-lemon p-3 text-center">{s.goal.raceName ?? "Course"} dans <span className="text-lg font-extrabold">{race}</span> jours</div>}
        </div>
      </Card>

      <Card title="Volume par semaine" hint="Touche une barre pour le détail. Les barres claires sont la semaine en cours.">
        <div className="mb-3 grid grid-cols-3 gap-1 rounded-2xl bg-cream p-1">
          {(Object.keys(METRICS) as (keyof typeof METRICS)[]).map((k) => (
            <button key={k} onClick={() => setMetric(k)} className={`rounded-xl py-1.5 text-sm font-extrabold ${metric === k ? "bg-white shadow-soft" : "text-ink-soft"}`}>{METRICS[k].label}</button>
          ))}
        </div>
        <StackedBars bars={volume} formatTick={m.tick} title={`${m.label} par semaine`} />
        <ul className="mt-4 space-y-2 border-t border-ink/10 pt-3 text-sm">
          {SPORT_ORDER.filter((k) => tot((w) => w.by[k].n) > 0).map((k) => {
            const sec = tot((w) => w.by[k].sec), km = tot((w) => w.by[k].km), cnt = tot((w) => w.by[k].n);
            return (
              <li key={k}>
                <div className="flex justify-between font-bold"><span>{SPORT_STYLE[k].icon} {SPORT_STYLE[k].label}</span><span className="text-ink-soft">{cnt}× · {k === "strength" || km === 0 ? "" : `${fr(km, k === "swim" ? 1 : 0)} km · `}{hours(sec)}</span></div>
                <div className="mt-1 h-2 overflow-hidden rounded-full bg-ink/10"><div className={`h-full rounded-full ${SPORT_STYLE[k].bar}`} style={{ width: `${shareTot ? (sec / shareTot) * 100 : 0}%` }} /></div>
              </li>
            );
          })}
        </ul>
      </Card>

      {zoneAll > 0 && (
        <Card title="Intensité" hint="Temps passé dans chaque zone de fréquence cardiaque.">
          <StackedBars bars={zoneBars} formatTick={(v) => `${Math.round(v / 3600)} h`} title="Zones cardiaques par semaine" />
          <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-xs font-bold text-ink-soft">
            {ZONES.map((z, k) => <span key={z.name} className="flex items-center gap-1.5"><span className={`h-2.5 w-2.5 rounded-full ${z.color}`} />Z{k + 1} {Math.round((zoneTot[k] / zoneAll) * 100)} %</span>)}
          </div>
          <p className="mt-2 text-xs font-semibold text-ink-soft">{Math.round(((zoneTot[0] + zoneTot[1]) / zoneAll) * 100)} % du temps en endurance facile (Z1-Z2), {Math.round(((zoneTot[3] + zoneTot[4]) / zoneAll) * 100)} % en dur (Z4-Z5).</p>
        </Card>
      )}

      <Card title="Charge" hint="Charge Garmin cumulée par semaine : monte-t-elle trop vite ?">
        <StackedBars bars={loadBars} formatTick={(v) => String(v)} title="Charge par semaine" />
      </Card>

      {paceWeeks.length > 2 && (
        <Card title="Allure en course" hint="Allure moyenne des semaines avec au moins 3 km de course. Plus bas = plus rapide.">
          <Line points={paceWeeks} format={clock} unit=" /km" title="Allure en course" color="stroke-rose-deep" dot="bg-rose-deep" />
        </Card>
      )}

      {strengthN > 0 && (
        <Card title="Musculation" hint={`${strengthN} séance${strengthN > 1 ? "s" : ""} sur la période${s.strength.last ? ` · dernière le ${shortDate(s.strength.last)}` : ""}`}>
          <StackedBars bars={strengthBars} formatTick={(v) => String(Math.round(v))} title="Séances de musculation par semaine" />
        </Card>
      )}

      {line("kg").length > 1 && (
        <Card title="Corps" hint="Pesées de la balance Garmin sur la période.">
          <Line points={line("kg")} format={(v) => fr(v)} unit=" kg" title="Poids" />
          {line("muscle").length > 1 && <><p className="mb-1 mt-4 text-xs font-extrabold uppercase text-ink-soft">Muscle (kg)</p><Line points={line("muscle")} format={(v) => fr(v)} unit=" kg" color="stroke-mint-deep" dot="bg-mint-deep" title="Muscle" /></>}
          {line("fat").length > 1 && <><p className="mb-1 mt-4 text-xs font-extrabold uppercase text-ink-soft">Masse grasse (%)</p><Line points={line("fat")} format={(v) => fr(v)} unit=" %" color="stroke-peach-deep" dot="bg-peach-deep" title="Masse grasse" /></>}
        </Card>
      )}

      {(sleep.length > 2 || hrv.length > 2 || rhr.length > 2) && (
        <Card title="Récupération" hint="Seulement ce que la montre mesure : elle n'est portée la nuit que de temps en temps.">
          {sleep.length > 2 && <><p className="mb-1 text-xs font-extrabold uppercase text-ink-soft">Sommeil (h)</p><Line points={sleep} format={(v) => fr(v)} unit=" h" color="stroke-lavender-deep" dot="bg-lavender-deep" title="Sommeil" /></>}
          {hrv.length > 2 && <><p className="mb-1 mt-4 text-xs font-extrabold uppercase text-ink-soft">VFC (ms), pointillés = moyenne 7 jours</p><Line points={hrv} format={(v) => String(Math.round(v))} unit=" ms" color="stroke-mint-deep" dot="bg-mint-deep" title="VFC" /></>}
          {rhr.length > 2 && <><p className="mb-1 mt-4 text-xs font-extrabold uppercase text-ink-soft">FC au repos (bpm), faussée si la montre n'est portée que pour le sport</p><Line points={rhr} format={(v) => String(Math.round(v))} unit=" bpm" color="stroke-rose-deep" dot="bg-rose-deep" title="FC au repos" /></>}
        </Card>
      )}

      <Card title="Records" hint="Sur tout l'historique récupéré."><Records s={s} /></Card>

      <Card title="Plus grosses journées" hint="Classées par temps passé à bouger.">
        <ol className="space-y-2">
          {s.biggestDays.map((d, i) => (
            <li key={d.date} className="flex items-center gap-3">
              <span className="flex h-7 w-7 items-center justify-center rounded-full bg-lemon text-sm font-extrabold">{i + 1}</span>
              <span className="flex-1 font-bold">{fromIso(d.date).toLocaleDateString("fr-FR", { weekday: "short", day: "numeric", month: "short", year: "2-digit" })}</span>
              <span className="text-sm font-bold text-ink-soft">{hours(d.sec)} · {fr(d.km)} km</span>
            </li>
          ))}
        </ol>
      </Card>

      <Card title="Dernières sorties">
        <ul className="divide-y divide-ink/10">
          {s.recent.map((a, i) => (
            <li key={i} className="flex items-center gap-3 py-2">
              <span className="text-xl">{SPORT_STYLE[a.sport].icon}</span>
              <div className="min-w-0 flex-1"><p className="truncate font-bold">{a.name || SPORT_STYLE[a.sport].label}</p><p className="text-xs font-semibold text-ink-soft">{shortDate(a.date)}{a.hr ? ` · ${Math.round(a.hr)} bpm` : ""}</p></div>
              <span className="text-right text-sm font-bold">{a.km > 0 ? `${fr(a.km, a.sport === "swim" ? 2 : 1)} km` : ""}<br /><span className="text-ink-soft">{hours(a.sec)}</span></span>
            </li>
          ))}
        </ul>
      </Card>

      {s.anomalies.length > 0 && <p className="pb-2 text-center text-xs font-semibold text-ink-soft">⚠️ Durée écartée (montre oubliée ?) : {s.anomalies.map((a) => `${shortDate(a.date)} · ${fr(a.km)} km en ${Math.round(a.hours)} h`).join(" ; ")}</p>}
      <p className="pb-2 text-center text-xs font-semibold text-ink-soft">
        {s.counts.activities} sorties · {shortDate(s.range.from)} → {shortDate(s.range.to)} · mis à jour le {new Date(s.generatedAt).toLocaleString("fr-FR", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}
      </p>
    </>
  );
}

export function Sport() {
  const { data, isLoading, error } = useTraining();
  return (
    <section className="overflow-x-clip">
      <div className="mb-4 flex items-center justify-between">
        <h2 className="flex items-center gap-2 text-lg font-extrabold"><span className="rounded-xl bg-lemon px-2 py-1">📈</span> Sport</h2>
        <span className="text-xs font-bold text-ink-soft">⌚ Garmin</span>
      </div>
      {isLoading ? <p className="py-8 text-center text-ink-soft">Chargement…</p>
        : error ? <p className="rounded-3xl bg-rose-soft p-4 text-center text-sm font-bold">{error.message}</p>
        : data && "empty" in data && data.empty ? (
          <div className="rounded-3xl bg-white p-6 text-center shadow-soft">
            <p className="text-3xl">📭</p>
            <p className="mt-2 font-extrabold">Pas encore de données</p>
            <p className="mt-1 text-sm font-semibold text-ink-soft">Sur l'ordinateur, lance <code className="rounded bg-cream px-1.5 py-0.5">scripts/garmin/refresh.sh</code> puis recharge cette page.</p>
          </div>
        ) : data && <Content s={data as TrainingSummary} />}
    </section>
  );
}

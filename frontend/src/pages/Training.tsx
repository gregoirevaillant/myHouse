import { useState, type ReactNode } from "react";
import { Line, StackedBars, type StackBar } from "../components/training/Charts";
import type { TrainingRecord, TrainingSummary, TrainingWeek } from "../lib/api";
import { fromIso, shortDate } from "../lib/dates";
import { avg, clock, fr, hours, SPORT_ORDER, SPORT_STYLE, useTraining } from "../lib/training";

const Card = ({ title, hint, children }: { title: string; hint?: string; children: ReactNode }) => (
  <div className="mb-4 rounded-3xl bg-white p-4 shadow-soft">
    <h3 className="font-extrabold">{title}</h3>
    {hint && <p className="mb-3 text-xs font-semibold text-ink-soft">{hint}</p>}
    {!hint && <div className="mb-3" />}
    {children}
  </div>
);

function Stat({ label, value, sub, bg }: { label: string; value: string; sub?: string; bg: string }) {
  return (
    <div className={`rounded-3xl p-4 shadow-soft ${bg}`}>
      <p className="text-xs font-extrabold uppercase tracking-wide text-ink/60">{label}</p>
      <p className="mt-1 text-2xl font-extrabold leading-tight">{value}</p>
      {sub && <p className="text-sm font-bold text-ink/60">{sub}</p>}
    </div>
  );
}

const delta = (now: number, ref: number, unit: string) => {
  if (!ref) return undefined;
  const d = Math.round(((now - ref) / ref) * 100);
  return `${d > 0 ? "+" : d < 0 ? "−" : ""}${Math.abs(d)} % ${unit}`;
};
const weekLabel = (w: TrainingWeek) => `Sem. du ${shortDate(w.start)}`;

const METRICS = {
  km: { label: "Distance", tick: (v: number) => `${v} km`, val: (b: { km: number }) => b.km, fmt: (v: number) => `${fr(v)} km` },
  sec: { label: "Temps", tick: (v: number) => `${Math.round(v / 3600)} h`, val: (b: { sec: number }) => b.sec, fmt: (v: number) => hours(v) },
  n: { label: "Séances", tick: (v: number) => String(v), val: (b: { n: number }) => b.n, fmt: (v: number) => `${v} séance${v > 1 ? "s" : ""}` },
} as const;

function Goal({ s, thisWeek, past }: { s: TrainingSummary; thisWeek: TrainingWeek; past: TrainingWeek[] }) {
  const goal = s.goal.runsPerWeek;
  const done = thisWeek.by.run.n;
  let streak = 0;
  for (let i = past.length - 1; i >= 0 && past[i].by.run.n >= goal; i--) streak++;
  const days = s.goal.raceDate ? Math.ceil((fromIso(s.goal.raceDate).getTime() - fromIso(s.today).getTime()) / 86400000) : null;
  return (
    <div className="mb-4 rounded-3xl bg-lemon p-4 shadow-soft">
      <p className="text-xs font-extrabold uppercase tracking-wide text-ink/60">Objectif</p>
      <p className="font-extrabold">{s.goal.label}</p>
      {days !== null && days >= 0 && <p className="mt-1 text-sm font-bold">{s.goal.raceName ?? "Course"} dans <span className="text-lg">{days}</span> jours</p>}
      <div className="mt-3 flex items-center gap-3">
        <div className="flex gap-1.5" aria-label={`${done} courses sur ${goal} cette semaine`}>
          {Array.from({ length: Math.max(goal, done) }, (_, i) => (
            <span key={i} className={`flex h-9 w-9 items-center justify-center rounded-full text-lg ${i < done ? "bg-white shadow-soft" : "border-2 border-dashed border-ink/25"}`}>{i < done ? "🏃" : ""}</span>
          ))}
        </div>
        <div className="text-sm font-bold text-ink/70">
          <p>{done}/{goal} courses cette semaine</p>
          <p>{streak > 0 ? `🔥 ${streak} semaine${streak > 1 ? "s" : ""} de suite à ${goal}+` : "Pas encore de série en cours"}</p>
        </div>
      </div>
    </div>
  );
}

function Records({ s }: { s: TrainingSummary }) {
  const r = s.records;
  const rows: { icon: string; label: string; value: string; sub: string }[] = [];
  const add = (icon: string, label: string, rec: TrainingRecord | null, value: (x: TrainingRecord) => string) => rec && rows.push({ icon, label, value: value(rec), sub: `${shortDate(rec.date)}` });
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
  const [metric, setMetric] = useState<keyof typeof METRICS>("km");
  const m = METRICS[metric];
  const thisWeek = s.weeks[s.weeks.length - 1];
  const past = s.weeks.slice(0, -1);
  const prev4 = past.slice(-4);
  const last = (xs: (number | null)[], n: number) => xs.filter((v): v is number => v !== null).slice(-n);

  const w12 = s.weeks.slice(-12);
  const bars: StackBar[] = w12.map((w, i) => ({
    key: w.start, label: weekLabel(w), axis: i % 3 === 0 || i === w12.length - 1 ? shortDate(w.start) : "", current: w === thisWeek,
    tooltip: `${weekLabel(w)}${w === thisWeek ? " (en cours)" : ""} · ${m.fmt(m.val(w))}`,
    parts: SPORT_ORDER.map((k) => ({ value: m.val(w.by[k]), color: SPORT_STYLE[k].bar })),
  }));
  const w26 = s.weeks;
  const loadBars: StackBar[] = w26.map((w, i) => ({
    key: w.start, label: weekLabel(w), axis: i % 6 === 0 ? shortDate(w.start) : "", current: w === thisWeek,
    tooltip: `${weekLabel(w)} · charge ${w.load}`, parts: SPORT_ORDER.map((k) => ({ value: w.by[k].load, color: SPORT_STYLE[k].bar })),
  }));
  const strengthBars: StackBar[] = w26.map((w, i) => ({
    key: w.start, label: weekLabel(w), axis: i % 6 === 0 ? shortDate(w.start) : "", current: w === thisWeek,
    tooltip: `${weekLabel(w)} · ${w.by.strength.n} séance${w.by.strength.n > 1 ? "s" : ""} de muscu`, parts: [{ value: w.by.strength.n, color: SPORT_STYLE.strength.bar }],
  }));

  const dayPts = (get: (d: TrainingSummary["days"][number]) => number | null) =>
    s.days.filter((d) => get(d) !== null).map((d) => ({ label: shortDate(d.date), value: get(d)! }));
  const rhr = dayPts((d) => d.rhr), sleep = dayPts((d) => d.sleepH), hrv = s.days.filter((d) => d.hrv !== null).map((d) => ({ label: shortDate(d.date), value: d.hrv!, extra: d.hrvWeekly }));
  const weight = s.weights.map((w) => ({ label: shortDate(w.date), value: w.kg }));
  const muscle = s.weights.filter((w) => w.muscle).map((w) => ({ label: shortDate(w.date), value: w.muscle! }));
  const fat = s.weights.filter((w) => w.fat).map((w) => ({ label: shortDate(w.date), value: w.fat! }));
  const lastW = s.weights[s.weights.length - 1];
  const w30 = [...s.weights].reverse().find((w) => w.date <= new Date(fromIso(s.today).getTime() - 30 * 86400000).toISOString().slice(0, 10)) ?? s.weights[0];
  const sleep7 = last(s.days.map((d) => d.sleepH), 7);

  return (
    <>
      <Goal s={s} thisWeek={thisWeek} past={past} />

      <div className="mb-4 grid grid-cols-2 gap-3">
        <Stat bg="bg-sky" label="Km cette semaine" value={`${fr(thisWeek.km)} km`} sub={delta(thisWeek.km, avg(prev4.map((w) => w.km)), "vs 4 sem.")} />
        <Stat bg="bg-mint" label="Séances" value={String(thisWeek.n)} sub={hours(thisWeek.sec)} />
        <Stat bg="bg-peach" label="Charge" value={String(thisWeek.load)} sub={delta(thisWeek.load, avg(prev4.map((w) => w.load)), "vs 4 sem.")} />
        {lastW && <Stat bg="bg-lavender" label="Poids" value={`${fr(lastW.kg)} kg`} sub={w30 && w30 !== lastW ? `${lastW.kg - w30.kg > 0 ? "+" : "−"}${fr(Math.abs(lastW.kg - w30.kg))} kg en 30 j` : shortDate(lastW.date)} />}
        {sleep7.length > 0 && <Stat bg="bg-sky" label="Sommeil" value={`${fr(avg(sleep7))} h`} sub={`moy. sur ${sleep7.length} nuit${sleep7.length > 1 ? "s" : ""}`} />}
        {rhr.length > 0 && <Stat bg="bg-rose" label="FC au repos" value={`${rhr[rhr.length - 1].value} bpm`} sub={shortDate(s.days.filter((d) => d.rhr !== null).slice(-1)[0].date)} />}
        {hrv.length > 0 && <Stat bg="bg-mint" label="VFC" value={`${hrv[hrv.length - 1].value} ms`} sub={s.days.filter((d) => d.hrv !== null).slice(-1)[0]?.hrvStatus?.toLowerCase() ?? undefined} />}
      </div>

      <Card title="Cette semaine contre les précédentes" hint="12 dernières semaines, du lundi au dimanche. Touche une barre pour le détail.">
        <div className="mb-3 grid grid-cols-3 gap-1 rounded-2xl bg-cream p-1">
          {(Object.keys(METRICS) as (keyof typeof METRICS)[]).map((k) => (
            <button key={k} onClick={() => setMetric(k)} className={`rounded-xl py-1.5 text-sm font-extrabold ${metric === k ? "bg-white shadow-soft" : "text-ink-soft"}`}>{METRICS[k].label}</button>
          ))}
        </div>
        <StackedBars bars={bars} formatTick={m.tick} title={`${m.label} par semaine`} />
        <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-xs font-bold text-ink-soft">
          {SPORT_ORDER.filter((k) => w12.some((w) => w.by[k].n > 0)).map((k) => (
            <span key={k} className="flex items-center gap-1.5"><span className={`h-2.5 w-2.5 rounded-full ${SPORT_STYLE[k].bar}`} />{SPORT_STYLE[k].label}</span>
          ))}
        </div>
        <ul className="mt-4 space-y-1.5 border-t border-ink/10 pt-3 text-sm">
          {SPORT_ORDER.filter((k) => thisWeek.by[k].n > 0).map((k) => {
            const b = thisWeek.by[k];
            return (
              <li key={k} className="flex justify-between font-bold">
                <span>{SPORT_STYLE[k].icon} {SPORT_STYLE[k].label}</span>
                <span className="text-ink-soft">{b.n}× · {k === "strength" ? hours(b.sec) : `${fr(b.km, k === "swim" ? 2 : 1)} km · ${hours(b.sec)}`}</span>
              </li>
            );
          })}
          {thisWeek.n === 0 && <li className="font-bold text-ink-soft">Rien de fait cette semaine pour l'instant.</li>}
        </ul>
      </Card>

      <Card title="Charge d'entraînement" hint="Charge Garmin cumulée par semaine : monte-t-elle trop vite ?">
        <StackedBars bars={loadBars} formatTick={(v) => String(v)} title="Charge par semaine" />
      </Card>

      {s.strength.total > 0 && (
        <Card title="Musculation" hint={`${s.strength.total} séance${s.strength.total > 1 ? "s" : ""} au total${s.strength.last ? ` · dernière le ${shortDate(s.strength.last)}` : ""}`}>
          <StackedBars bars={strengthBars} formatTick={(v) => String(Math.round(v))} title="Séances de musculation par semaine" />
        </Card>
      )}

      {weight.length > 1 && (
        <Card title="Poids" hint={`${weight.length} pesées · la composition (muscle, gras) vient de la balance Garmin`}>
          <Line points={weight} format={(v) => fr(v)} unit=" kg" title="Poids" />
          {muscle.length > 1 && <><p className="mb-1 mt-4 text-xs font-extrabold uppercase text-ink-soft">Muscle (kg)</p><Line points={muscle} format={(v) => fr(v)} unit=" kg" color="stroke-mint-deep" dot="bg-mint-deep" title="Muscle" /></>}
          {fat.length > 1 && <><p className="mb-1 mt-4 text-xs font-extrabold uppercase text-ink-soft">Masse grasse (%)</p><Line points={fat} format={(v) => fr(v)} unit=" %" color="stroke-peach-deep" dot="bg-peach-deep" title="Masse grasse" /></>}
        </Card>
      )}

      {sleep.length > 2 && <Card title="Sommeil" hint="Heures dormies, quand la montre est portée la nuit."><Line points={sleep} format={(v) => fr(v)} unit=" h" color="stroke-lavender-deep" dot="bg-lavender-deep" title="Sommeil" /></Card>}
      {hrv.length > 2 && <Card title="VFC (HRV)" hint="Moyenne de la nuit, pointillés = moyenne sur 7 jours."><Line points={hrv} format={(v) => String(Math.round(v))} unit=" ms" color="stroke-mint-deep" dot="bg-mint-deep" title="VFC" /></Card>}
      {rhr.length > 2 && <Card title="Fréquence cardiaque au repos" hint="Attention : la montre n'est portée que pour le sport, cette valeur est faussée."><Line points={rhr} format={(v) => String(Math.round(v))} unit=" bpm" color="stroke-rose-deep" dot="bg-rose-deep" title="FC au repos" /></Card>}

      <Card title="Records"><Records s={s} /></Card>

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

      <p className="pb-2 text-center text-xs font-semibold text-ink-soft">
        {s.counts.activities} sorties · {shortDate(s.range.from)} → {shortDate(s.range.to)} · mis à jour le {new Date(s.generatedAt).toLocaleString("fr-FR", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}
      </p>
    </>
  );
}

export function Training() {
  const { data, isLoading, error } = useTraining();
  return (
    <section>
      <div className="mb-4 flex items-center justify-between">
        <h2 className="flex items-center gap-2 text-lg font-extrabold"><span className="rounded-xl bg-lemon px-2 py-1">🏃</span> Entraînement</h2>
        <span className="text-xs font-bold text-ink-soft">⌚ Garmin</span>
      </div>
      {isLoading ? <p className="py-8 text-center text-ink-soft">Chargement…</p>
        : error ? <p className="rounded-3xl bg-rose-soft p-4 text-center text-sm font-bold">{error.message}</p>
        : data && "empty" in data && data.empty ? (
          <div className="rounded-3xl bg-white p-6 text-center shadow-soft">
            <p className="text-3xl">📭</p>
            <p className="mt-2 font-extrabold">Pas encore de données</p>
            <p className="mt-1 text-sm font-semibold text-ink-soft">Sur l'ordinateur, lance la commande <code className="rounded bg-cream px-1.5 py-0.5">npm run garmin:refresh</code> puis recharge cette page.</p>
          </div>
        ) : data && <Content s={data as TrainingSummary} />}
    </section>
  );
}

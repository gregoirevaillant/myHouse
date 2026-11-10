import { RefreshButton } from "../components/health/RefreshButton";
import { useState, type ReactNode } from "react";
import { Line, Spark, StackedBars, type StackBar } from "../components/training/Charts";
import type { HealthNight } from "../lib/api";
import { fromIso, shortDate } from "../lib/dates";
import { duration, longDay, relativeDay } from "../lib/garmin";
import { hasHealth, useHealth } from "../lib/health";

const PERIODS = [
  { id: 30, label: "30 j" },
  { id: 90, label: "3 mois" },
  { id: 365, label: "1 an" },
  { id: 0, label: "Tout" }, // tout l'historique
] as const;

const GOAL_H = 8; // objectif de nuit, en heures
const STAGES = [
  { key: "deep", label: "Profond", bar: "bg-lavender-deep" },
  { key: "light", label: "Léger", bar: "bg-lavender" },
  { key: "rem", label: "Paradoxal", bar: "bg-sky" },
  { key: "awake", label: "Éveillé", bar: "bg-rose" },
] as const;

const fr = (n: number, digits = 1) => n.toFixed(digits).replace(".", ",");
const avg = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0);
const hm = (minutes: number) => `${Math.floor(minutes / 60)} h ${String(Math.round(minutes % 60)).padStart(2, "0")}`;
// « 23:40 » → minutes depuis 18 h (une nuit passe minuit : 00:30 doit être après 23:40)
const sinceEvening = (t: string) => { const [h, m] = t.split(":").map(Number); return ((h * 60 + m - 18 * 60 + 1440) % 1440); };
const clockOf = (fromEvening: number) => { const t = (fromEvening + 18 * 60) % 1440; return `${String(Math.floor(t / 60)).padStart(2, "0")}:${String(Math.round(t % 60)).padStart(2, "0")}`; };

const Card = ({ title, hint, children }: { title: string; hint?: string; children: ReactNode }) => (
  <div className="mb-4 rounded-3xl bg-white p-4 shadow-soft">
    <h3 className="font-extrabold">{title}</h3>
    {hint ? <p className="mb-3 text-xs font-semibold text-ink-soft">{hint}</p> : <div className="mb-3" />}
    {children}
  </div>
);

function Kpi({ label, value, sub, series, bg }: { label: string; value: string; sub?: string; series: number[]; bg: string }) {
  return (
    <div className={`rounded-3xl p-4 shadow-soft ${bg}`}>
      <p className="text-xs font-extrabold uppercase tracking-wide text-ink/60">{label}</p>
      <p className="mt-1 text-2xl font-extrabold leading-tight">{value}</p>
      <div className="mt-1 flex items-center justify-between gap-2"><span className="text-xs font-bold text-ink/60">{sub}</span><span className="w-16"><Spark values={series} /></span></div>
    </div>
  );
}

function StageBar({ n }: { n: HealthNight }) {
  const total = n.deep + n.light + n.rem + n.awake || 1;
  return (
    <>
      <div className="flex h-3 overflow-hidden rounded-full bg-white">
        {STAGES.map((s) => <span key={s.key} className={s.bar} style={{ width: `${(n[s.key] / total) * 100}%` }} />)}
      </div>
      <p className="mt-1.5 text-xs font-semibold text-ink-soft">{STAGES.map((s) => `${s.label} ${duration(n[s.key])}`).join(" · ")}</p>
    </>
  );
}

function Content({ nights, today }: { nights: HealthNight[]; today: string }) {
  const [days, setDays] = useState<(typeof PERIODS)[number]["id"]>(0);
  const last = nights[nights.length - 1];
  const from = fromIso(today);
  from.setDate(from.getDate() - days + 1);
  const ns = days === 0 ? nights : nights.filter((n) => fromIso(n.date) >= from);

  const mean = avg(ns.map((n) => n.seconds)) / 60;
  const scores = ns.flatMap((n) => (n.score === null ? [] : [n.score]));
  const bedtimes = ns.flatMap((n) => (n.start ? [sinceEvening(n.start)] : []));
  const wakes = ns.flatMap((n) => (n.end ? [sinceEvening(n.end)] : []));
  const bed = bedtimes.length ? avg(bedtimes) : null;
  // régularité : écart moyen du coucher à sa moyenne
  const spread = bed !== null && bedtimes.length > 2 ? avg(bedtimes.map((b) => Math.abs(b - bed))) : null;
  const debt = ns.reduce((s, n) => s + (GOAL_H * 3600 - n.seconds), 0) / 3600; // heures manquantes sur la période
  const goodNights = ns.filter((n) => n.seconds >= 7 * 3600).length;
  const tot = STAGES.map((s) => ns.reduce((sum, n) => sum + n[s.key], 0));
  const totAll = tot.reduce((a, b) => a + b, 0) || 1;

  const bars: StackBar[] = ns.map((n, i) => ({
    key: n.date, label: n.date, axis: i % Math.max(1, Math.ceil(ns.length / 4)) === 0 ? shortDate(n.date) : "", current: n === last,
    tooltip: `${longDay(n.date)} · ${duration(n.seconds)}${n.score !== null ? ` · score ${n.score}` : ""}`,
    // minutes, pour des graduations rondes en heures
    parts: STAGES.map((s) => ({ value: Math.round(n[s.key] / 60), color: s.bar })),
  }));
  const scorePts = ns.flatMap((n) => (n.score === null ? [] : [{ label: shortDate(n.date), value: n.score }]));
  const hrvPts = ns.flatMap((n) => (n.hrv === null ? [] : [{ label: shortDate(n.date), value: n.hrv }]));
  const hrPts = ns.flatMap((n) => (n.heartRate === null ? [] : [{ label: shortDate(n.date), value: n.heartRate }]));

  return (
    <>
      <div className="mb-4 rounded-3xl bg-lavender-soft p-4">
        <p className="text-xs font-bold uppercase tracking-wide text-ink-soft">Dernière nuit · {relativeDay(last.date, today)}</p>
        <p className="mt-1 text-3xl font-extrabold">{duration(last.seconds)}{last.score !== null && <span className="ml-2 text-base text-ink-soft">score {last.score}</span>}</p>
        {last.start && last.end && <p className="text-sm font-bold text-ink-soft">{last.start} → {last.end}</p>}
        <div className="mt-2"><StageBar n={last} /></div>
        <p className="mt-2 text-xs font-semibold text-ink-soft">
          {[last.heartRate !== null && `❤️ ${last.heartRate} bpm`, last.spo2 !== null && `SpO₂ ${last.spo2} %`, last.breath !== null && `🫁 ${last.breath} resp./min`, last.stress !== null && `stress ${last.stress}`].filter(Boolean).join(" · ")}
        </p>
      </div>

      <div className="mb-4 grid grid-cols-4 gap-1 rounded-2xl bg-white p-1 shadow-soft" role="tablist">
        {PERIODS.map((p) => (
          <button key={p.id} role="tab" aria-selected={days === p.id} onClick={() => setDays(p.id)} className={`rounded-xl py-2 text-sm font-extrabold transition ${days === p.id ? "bg-lavender" : "text-ink-soft"}`}>{p.label}</button>
        ))}
      </div>
      <p className="-mt-2 mb-4 text-center text-xs font-semibold text-ink-soft">{ns.length} nuit{ns.length > 1 ? "s" : ""} mesurée{ns.length > 1 ? "s" : ""}{days === 0 ? ` depuis le ${shortDate(nights[0].date)}` : ""}</p>

      {ns.length === 0 ? (
        <p className="rounded-3xl bg-white p-4 text-center text-sm font-bold text-ink-soft shadow-soft">Aucune nuit mesurée sur cette période. La montre n'enregistre le sommeil que si tu la portes la nuit.</p>
      ) : (
        <>
          <div className="mb-4 grid grid-cols-2 gap-3">
            <Kpi bg="bg-lavender" label="Durée moyenne" value={hm(mean)} sub={`objectif ${GOAL_H} h`} series={ns.map((n) => n.seconds)} />
            {scores.length > 0 && <Kpi bg="bg-mint" label="Score moyen" value={String(Math.round(avg(scores)))} sub="sur 100" series={scores} />}
            {bed !== null && <Kpi bg="bg-sky" label="Coucher moyen" value={clockOf(bed)} sub={spread !== null ? `± ${Math.round(spread)} min` : undefined} series={bedtimes} />}
            {wakes.length > 0 && <Kpi bg="bg-lemon" label="Lever moyen" value={clockOf(avg(wakes))} series={wakes} />}
            <Kpi bg="bg-peach" label="Nuits ≥ 7 h" value={`${goodNights}/${ns.length}`} sub={debt > 0 ? `${fr(debt)} h de dette` : `${fr(-debt)} h d'avance`} series={ns.map((n) => (n.seconds >= 7 * 3600 ? 1 : 0))} />
          </div>

          <Card title="Nuits" hint="Durée par phase de sommeil. Touche une barre pour le détail.">
            <StackedBars bars={bars} formatTick={(v) => `${Math.round(v / 60)} h`} title="Sommeil par nuit" />
            <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-xs font-bold text-ink-soft">
              {STAGES.map((s, k) => <span key={s.key} className="flex items-center gap-1.5"><span className={`h-2.5 w-2.5 rounded-full ${s.bar}`} />{s.label} {Math.round((tot[k] / totAll) * 100)} %</span>)}
            </div>
            <p className="mt-2 text-xs font-semibold text-ink-soft">Repères adultes : environ 15-20 % de profond et 20-25 % de paradoxal.</p>
          </Card>

          {scorePts.length > 2 && (
            <Card title="Score de sommeil" hint="Note sur 100 calculée par Garmin.">
              <Line points={scorePts} format={(v) => String(Math.round(v))} unit="" title="Score de sommeil" color="stroke-mint-deep" dot="bg-mint-deep" />
            </Card>
          )}

          {hrPts.length > 2 && (
            <Card title="Cœur pendant la nuit" hint="Fréquence cardiaque moyenne du sommeil : plus bas = mieux récupéré.">
              <Line points={hrPts} format={(v) => String(Math.round(v))} unit=" bpm" title="FC pendant la nuit" color="stroke-rose-deep" dot="bg-rose-deep" />
            </Card>
          )}

          {hrvPts.length > 2 && (
            <Card title="Variabilité cardiaque (VFC)" hint="Moyenne de la nuit : plus elle est haute, mieux tu récupères.">
              <Line points={hrvPts} format={(v) => String(Math.round(v))} unit=" ms" title="VFC" color="stroke-sky-deep" dot="bg-sky-deep" />
            </Card>
          )}

          <Card title="Détail des nuits" hint={ns.length > 30 ? "Les 30 dernières." : undefined}>
            <ul className="divide-y divide-ink/10">
              {[...ns].reverse().slice(0, 30).map((n) => (
                <li key={n.date} className="py-2">
                  <div className="flex items-baseline justify-between"><span className="font-bold">{longDay(n.date)}</span><span className="font-extrabold">{duration(n.seconds)}{n.score !== null && <span className="ml-2 text-xs text-ink-soft">{n.score}</span>}</span></div>
                  {n.start && n.end && <p className="text-xs font-semibold text-ink-soft">{n.start} → {n.end}</p>}
                </li>
              ))}
            </ul>
          </Card>
        </>
      )}
    </>
  );
}

export function Sleep() {
  const { data, isLoading, error } = useHealth();
  return (
    <section className="overflow-x-clip">
      <div className="mb-4 flex items-center justify-between">
        <h2 className="flex items-center gap-2 text-lg font-extrabold"><span className="rounded-xl bg-lavender px-2 py-1">😴</span> Sommeil</h2>
        <RefreshButton />
      </div>
      {isLoading ? <p className="py-8 text-center text-ink-soft">Chargement…</p>
        : error ? <p className="rounded-3xl bg-rose-soft p-4 text-center text-sm font-bold">{error.message}</p>
        : !hasHealth(data) ? (
          <div className="rounded-3xl bg-white p-6 text-center shadow-soft">
            <p className="text-3xl">📭</p>
            <p className="mt-2 font-extrabold">Pas encore de données</p>
            <p className="mt-1 text-sm font-semibold text-ink-soft">Sur l'ordinateur, lance <code className="rounded bg-cream px-1.5 py-0.5">scripts/garmin/refresh.sh --full</code> puis recharge cette page.</p>
          </div>
        ) : data.nights.length === 0 ? (
          <div className="rounded-3xl bg-white p-6 text-center shadow-soft">
            <p className="text-3xl">🌙</p>
            <p className="mt-2 font-extrabold">Aucune nuit mesurée</p>
            <p className="mt-1 text-sm font-semibold text-ink-soft">Porte ta montre la nuit : le sommeil apparaîtra ici.</p>
          </div>
        ) : <Content nights={data.nights} today={data.today} />}
    </section>
  );
}

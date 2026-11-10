import { useState, type ReactNode } from "react";
import { Line, Spark, StackedBars, type StackBar } from "../training/Charts";
import type { HealthDay, HealthSummary } from "../../lib/api";
import { addDays, fromIso, mondayOf, shortDate } from "../../lib/dates";
import { relativeDay } from "../../lib/garmin";
import { avg, fr, n } from "../../lib/health";

const PERIODS = [
  { id: 30, label: "30 j" },
  { id: 90, label: "3 mois" },
  { id: 365, label: "1 an" },
  { id: 0, label: "Tout" }, // tout l'historique
] as const;

const Card = ({ title, hint, children }: { title: string; hint?: string; children: ReactNode }) => (
  <div className="mb-4 rounded-3xl bg-white p-4 shadow-soft">
    <h3 className="font-extrabold">{title}</h3>
    {hint ? <p className="mb-3 text-xs font-semibold text-ink-soft">{hint}</p> : <div className="mb-3" />}
    {children}
  </div>
);

const monday = (iso: string) => mondayOf(fromIso(iso));
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

// anneau de progression des pas
function Ring({ steps, goal }: { steps: number; goal: number | null }) {
  const r = 46;
  const c = 2 * Math.PI * r;
  const p = goal ? Math.min(1, steps / goal) : 1;
  return (
    <div className="relative h-32 w-32 shrink-0">
      <svg viewBox="0 0 110 110" className="h-full w-full -rotate-90" role="img" aria-label={`${n(steps)} pas`}>
        <circle cx={55} cy={55} r={r} fill="none" strokeWidth={10} className="stroke-white" />
        <circle cx={55} cy={55} r={r} fill="none" strokeWidth={10} strokeLinecap="round" strokeDasharray={`${p * c} ${c}`} className="stroke-mint-deep" />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span className="text-2xl font-extrabold leading-none">{n(steps)}</span>
        <span className="mt-1 text-xs font-bold text-ink-soft">{goal ? `sur ${n(goal)}` : "pas"}</span>
      </div>
    </div>
  );
}

const Stat = ({ label, value }: { label: string; value: string }) => (
  <div>
    <dt className="text-[11px] font-bold text-ink-soft">{label}</dt>
    <dd className="font-extrabold">{value}</dd>
  </div>
);

type Num = (d: HealthDay) => number | null;
const vals = (ds: HealthDay[], f: Num) => ds.flatMap((d) => { const v = f(d); return v === null ? [] : [v]; });
const mean = (ds: HealthDay[], f: Num) => { const v = vals(ds, f); return v.length ? avg(v) : null; };

export function Summary({ s }: { s: HealthSummary }) {
  const [period, setPeriod] = useState<(typeof PERIODS)[number]["id"]>(0);
  const all = s.days;
  const from = period === 0 ? "0000-00-00" : addDays(s.today, -period + 1);
  const ds = all.filter((d) => d.date >= from);
  // période précédente de même durée, si l'historique la couvre
  const prev = period === 0 ? null : all.filter((d) => d.date >= addDays(from, -period) && d.date < from);
  const span = Math.max(1, ds.length ? Math.round((fromIso(ds[ds.length - 1].date).getTime() - fromIso(ds[0].date).getTime()) / 86400000) + 1 : 1);
  const weekly = period === 0 || period > 90; // au-delà de 3 mois : une barre par semaine

  // moyennes par jour (ou par semaine) pour les courbes
  const bucketKey = (d: HealthDay) => (weekly ? monday(d.date) : d.date);
  const groups = new Map<string, HealthDay[]>();
  for (const d of ds) groups.set(bucketKey(d), [...(groups.get(bucketKey(d)) ?? []), d]);
  const buckets = [...groups.entries()].sort(([a], [b]) => (a < b ? -1 : 1));
  const points = (f: Num) => buckets.flatMap(([k, g]) => { const v = mean(g, f); return v === null ? [] : [{ label: weekly ? `Sem. du ${shortDate(k)}` : shortDate(k), value: v }]; });
  const every = Math.max(1, Math.ceil(buckets.length / 4));

  const latest = [...all].reverse().find((d) => d.steps !== null);
  const goalOf = (d: HealthDay) => d.goal ?? 8000;
  const stepDays = ds.filter((d) => d.steps !== null);
  const onGoal = stepDays.filter((d) => d.steps! >= goalOf(d)).length;

  const kpi = (f: Num) => ({ v: mean(ds, f), p: prev ? mean(prev, f) : null, series: buckets.flatMap(([, g]) => { const v = mean(g, f); return v === null ? [] : [v]; }) });
  const steps = kpi((d) => d.steps), rhr = kpi((d) => d.rhr), stress = kpi((d) => d.stress), bb = kpi((d) => d.bb), floors = kpi((d) => d.floors), kcal = kpi((d) => d.kcal), resp = kpi((d) => d.resp);
  const intenseWeek = (list: HealthDay[], days: number) => (list.reduce((t, d) => t + (d.intense ?? 0), 0) / Math.max(days, 1)) * 7;
  const dpct = (k: { v: number | null; p: number | null }) => (k.v !== null && k.p !== null ? pct(k.v, k.p) : null);

  const stepBars: StackBar[] = buckets.flatMap(([k, g], i) => {
    const v = mean(g, (d) => d.steps);
    return v === null ? [] : [{ key: k, label: k, axis: i % every === 0 ? shortDate(k) : "", tooltip: `${weekly ? `Sem. du ${shortDate(k)}` : shortDate(k)} · ${n(v)} pas${weekly ? "/jour" : ""}`, parts: [{ value: Math.round(v), color: "bg-mint-deep" }] }];
  });
  // minutes intenses : toujours par semaine
  const weeks = new Map<string, number>();
  for (const d of ds) weeks.set(monday(d.date), (weeks.get(monday(d.date)) ?? 0) + (d.intense ?? 0));
  const weekList = [...weeks.entries()].sort(([a], [b]) => (a < b ? -1 : 1));
  const wEvery = Math.max(1, Math.ceil(weekList.length / 4));
  const intenseBars: StackBar[] = weekList.map(([k, v], i) => ({ key: k, label: k, axis: i % wEvery === 0 ? shortDate(k) : "", tooltip: `Sem. du ${shortDate(k)} · ${v} min`, parts: [{ value: v, color: "bg-peach-deep" }] }));
  const goalWeeks = weekList.slice(0, -1).filter(([, v]) => v >= 150).length;

  // totaux et records sur toute la vie de la montre
  const best = (f: Num, max = true) => all.reduce<HealthDay | null>((m, d) => (f(d) === null ? m : m === null || (max ? f(d)! > f(m)! : f(d)! < f(m)!) ? d : m), null);
  const bestSteps = best((d) => d.steps), lowRhr = best((d) => d.rhr, false), bestFloors = best((d) => d.floors);
  const totalSteps = vals(all, (d) => d.steps).reduce((a, b) => a + b, 0);
  const totalKm = vals(all, (d) => d.km).reduce((a, b) => a + b, 0);
  const allWeeks = new Map<string, number[]>();
  for (const d of all) if (d.steps !== null) allWeeks.set(monday(d.date), [...(allWeeks.get(monday(d.date)) ?? []), d.steps]);
  const bestWeek = [...allWeeks.entries()].filter(([, v]) => v.length >= 5).reduce<[string, number] | null>((m, [k, v]) => (m === null || avg(v) > m[1] ? [k, avg(v)] : m), null);
  let streak = 0;
  const byDate = new Map(all.map((d) => [d.date, d]));
  for (let day = s.today; ; day = addDays(day, -1)) {
    const d = byDate.get(day);
    if (!d) { if (day === s.today) continue; break; } // aujourd'hui peut ne pas être encore synchronisé
    if (d.steps !== null && d.steps >= goalOf(d)) streak++; else if (day === s.today) continue; else break;
  }

  // mois par mois (12 derniers)
  const months = new Map<string, HealthDay[]>();
  for (const d of all) months.set(d.date.slice(0, 7), [...(months.get(d.date.slice(0, 7)) ?? []), d]);
  const monthRows = [...months.entries()].sort(([a], [b]) => (a < b ? 1 : -1)).slice(0, 12);

  return (
    <div>
      <div className="mb-4 rounded-3xl bg-mint-soft p-4">
        {latest ? (
          <>
            <p className="mb-3 text-xs font-bold uppercase tracking-wide text-ink-soft">Dernier jour mesuré · {relativeDay(latest.date, s.today)}</p>
            <div className="flex items-center gap-4">
              <Ring steps={latest.steps!} goal={latest.goal} />
              <dl className="grid flex-1 grid-cols-2 gap-x-3 gap-y-3 text-sm">
                {latest.km !== null && <Stat label="Distance" value={`${fr(latest.km)} km`} />}
                {latest.kcal !== null && <Stat label="Calories actives" value={`${n(latest.kcal)} kcal`} />}
                {latest.rhr !== null && <Stat label="FC au repos" value={`${latest.rhr} bpm`} />}
                {latest.hrMax !== null && <Stat label="FC max" value={`${latest.hrMax} bpm`} />}
                {latest.bb !== null && <Stat label="Batterie corps" value={`${latest.bb} / 100`} />}
                {latest.stress !== null && <Stat label="Stress moyen" value={`${latest.stress} / 100`} />}
              </dl>
            </div>
          </>
        ) : <p className="text-center text-sm font-bold text-ink-soft">Aucun pas enregistré : porte ta montre pour voir ta journée ici.</p>}
      </div>

      <div className="mb-3 grid grid-cols-4 gap-1 rounded-2xl bg-white p-1 shadow-soft" role="tablist">
        {PERIODS.map((p) => (
          <button key={p.id} role="tab" aria-selected={period === p.id} onClick={() => setPeriod(p.id)} className={`rounded-xl py-2 text-sm font-extrabold transition ${period === p.id ? "bg-mint" : "text-ink-soft"}`}>{p.label}</button>
        ))}
      </div>
      <p className="mb-4 text-center text-xs font-semibold text-ink-soft">{ds.length} jour{ds.length > 1 ? "s" : ""} mesuré{ds.length > 1 ? "s" : ""}{period === 0 ? ` depuis le ${shortDate(all[0].date)}` : ""}{prev ? " · comparé à la période précédente" : ""}</p>

      <div className="mb-4 grid grid-cols-2 gap-3">
        {steps.v !== null && <Kpi bg="bg-mint" label="Pas par jour" value={n(steps.v)} d={dpct(steps)} series={steps.series} />}
        {rhr.v !== null && <Kpi bg="bg-rose" label="FC au repos" value={`${Math.round(rhr.v)} bpm`} d={dpct(rhr)} invert series={rhr.series} />}
        {stress.v !== null && <Kpi bg="bg-lemon" label="Stress moyen" value={`${Math.round(stress.v)} / 100`} d={dpct(stress)} invert series={stress.series} />}
        {bb.v !== null && <Kpi bg="bg-sky" label="Batterie corps" value={`${Math.round(bb.v)} / 100`} d={dpct(bb)} series={bb.series} />}
        {ds.some((d) => d.intense) && <Kpi bg="bg-peach" label="Minutes intenses" value={`${Math.round(intenseWeek(ds, span))} /sem.`} d={prev ? pct(intenseWeek(ds, span), intenseWeek(prev, period)) : null} series={weekList.map(([, v]) => v)} />}
        {floors.v !== null && <Kpi bg="bg-lavender" label="Étages par jour" value={fr(floors.v, 0)} d={dpct(floors)} series={floors.series} />}
        {kcal.v !== null && <Kpi bg="bg-peach" label="Calories actives" value={`${n(kcal.v)} kcal`} d={dpct(kcal)} series={kcal.series} />}
        {resp.v !== null && <Kpi bg="bg-sky" label="Respiration" value={`${fr(resp.v)} /min`} d={dpct(resp)} series={resp.series} />}
      </div>

      {stepBars.length > 0 && (
        <Card title="Pas" hint={`${onGoal} jour${onGoal > 1 ? "s" : ""} sur ${stepDays.length} à l'objectif (${stepDays.length ? Math.round((onGoal / stepDays.length) * 100) : 0} %)${weekly ? " · moyenne par jour, semaine par semaine" : ""}`}>
          <StackedBars bars={stepBars} formatTick={(v) => n(v)} title="Pas" />
        </Card>
      )}

      {points((d) => d.rhr).length > 2 && (
        <Card title="Fréquence cardiaque au repos" hint="Plus bas = cœur plus efficace. Elle monte avec la fatigue, la maladie ou le stress.">
          <Line points={points((d) => d.rhr)} format={(v) => String(Math.round(v))} unit=" bpm" title="FC au repos" color="stroke-rose-deep" dot="bg-rose-deep" />
          {vals(ds, (d) => d.hrMax).length > 0 && <p className="mt-2 text-xs font-semibold text-ink-soft">Sur la période : repos de {Math.min(...vals(ds, (d) => d.rhr))} à {Math.max(...vals(ds, (d) => d.rhr))} bpm · pic à {Math.max(...vals(ds, (d) => d.hrMax))} bpm.</p>}
        </Card>
      )}

      {points((d) => d.stress).length > 2 && (
        <Card title="Stress" hint="Mesuré par la variabilité cardiaque : 0-25 repos, 26-50 faible, 51-75 moyen, 76-100 élevé.">
          <Line points={points((d) => d.stress)} format={(v) => String(Math.round(v))} unit=" / 100" title="Stress" color="stroke-peach-deep" dot="bg-peach-deep" />
        </Card>
      )}

      {points((d) => d.bb).length > 2 && (
        <Card title="Batterie corporelle" hint="Niveau d'énergie le plus haut de la journée.">
          <Line points={points((d) => d.bb)} format={(v) => String(Math.round(v))} unit=" / 100" title="Batterie corporelle" color="stroke-sky-deep" dot="bg-sky-deep" />
        </Card>
      )}

      {intenseBars.length > 0 && weekList.some(([, v]) => v > 0) && (
        <Card title="Minutes d'activité intense" hint={`Objectif OMS : 150 min par semaine (une minute intense compte double). Atteint ${goalWeeks} semaine${goalWeeks > 1 ? "s" : ""} sur ${Math.max(weekList.length - 1, 0)}.`}>
          <StackedBars bars={intenseBars} formatTick={(v) => String(Math.round(v))} title="Minutes intenses par semaine" />
        </Card>
      )}

      {points((d) => d.resp).length > 2 && (
        <Card title="Respiration" hint="Respirations par minute en moyenne sur la journée.">
          <Line points={points((d) => d.resp)} format={(v) => fr(v)} unit=" /min" title="Respiration" color="stroke-lavender-deep" dot="bg-lavender-deep" />
        </Card>
      )}

      <Card title="Records et totaux" hint="Sur tout l'historique de la montre.">
        <div className="grid grid-cols-2 gap-2">
          {([
            ["👣", "Pas au total", n(totalSteps), `${all.filter((d) => d.steps !== null).length} jours`],
            ["📍", "Distance à pied", `${n(totalKm)} km`, "tous jours confondus"],
            bestSteps && ["🏆", "Meilleur jour", `${n(bestSteps.steps!)} pas`, shortDate(bestSteps.date)],
            bestWeek && ["📅", "Meilleure semaine", `${n(bestWeek[1])} pas/j`, `sem. du ${shortDate(bestWeek[0])}`],
            lowRhr && ["❤️", "FC repos la plus basse", `${lowRhr.rhr} bpm`, shortDate(lowRhr.date)],
            bestFloors && ["🪜", "Plus d'étages", `${bestFloors.floors}`, shortDate(bestFloors.date)],
            ["🔥", "Série objectif pas", streak > 0 ? `${streak} jour${streak > 1 ? "s" : ""}` : "—", "jours de suite"],
          ] as (false | null | string[])[]).flatMap((x) => (x ? [x] : [])).map(([icon, label, value, sub]) => (
            <div key={label} className="rounded-2xl bg-cream p-3">
              <p className="text-xs font-bold text-ink-soft">{icon} {label}</p>
              <p className="text-lg font-extrabold">{value}</p>
              <p className="text-xs font-semibold text-ink-soft">{sub}</p>
            </div>
          ))}
        </div>
      </Card>

      <Card title="Mois par mois" hint="Moyennes par jour.">
        <table className="w-full text-sm">
          <thead><tr className="text-left text-xs font-bold text-ink-soft"><th className="pb-1">Mois</th><th className="pb-1 text-right">Pas</th><th className="pb-1 text-right">FC repos</th><th className="pb-1 text-right">Stress</th></tr></thead>
          <tbody className="divide-y divide-ink/10">
            {monthRows.map(([m, g]) => {
              const st = mean(g, (d) => d.steps), r = mean(g, (d) => d.rhr), sr = mean(g, (d) => d.stress);
              return (
                <tr key={m} className="font-bold">
                  <td className="py-1.5">{fromIso(`${m}-01`).toLocaleDateString("fr-FR", { month: "short", year: "2-digit" })}</td>
                  <td className="py-1.5 text-right">{st === null ? "—" : n(st)}</td>
                  <td className="py-1.5 text-right">{r === null ? "—" : Math.round(r)}</td>
                  <td className="py-1.5 text-right">{sr === null ? "—" : Math.round(sr)}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </Card>

      <p className="pb-2 text-center text-xs font-semibold text-ink-soft">
        {all.length} jours · {shortDate(s.range.from)} → {shortDate(s.range.to)} · mis à jour le {new Date(s.generatedAt).toLocaleString("fr-FR", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}
      </p>
    </div>
  );
}

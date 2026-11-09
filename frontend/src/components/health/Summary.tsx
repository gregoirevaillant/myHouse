import type { GarminDay, GarminOverview } from "../../lib/api";
import { duration, km, relativeDay } from "../../lib/garmin";

const n = (v: number) => v.toLocaleString("fr-FR");

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

// pas des 14 derniers jours ; un jour sans donnée = montre non portée
function StepsChart({ days, goal, today }: { days: GarminDay[]; goal: number | null; today: string }) {
  const last14 = Array.from({ length: 14 }, (_, i) => {
    const date = new Date(Date.parse(`${today}T12:00:00Z`) - (13 - i) * 86400000).toISOString().slice(0, 10);
    return { date, steps: days.find((d) => d.date === date)?.steps ?? null };
  });
  const max = Math.max(goal ?? 0, ...last14.map((d) => d.steps ?? 0), 1);
  return (
    <div className="rounded-3xl bg-white p-4 shadow-soft">
      <p className="mb-3 text-xs font-bold uppercase tracking-wide text-ink-soft">Pas · 14 derniers jours</p>
      <div className="relative flex h-24 items-end gap-1">
        {goal && <div className="pointer-events-none absolute inset-x-0 border-t border-dashed border-ink-soft/40" style={{ bottom: `${(goal / max) * 100}%` }} />}
        {last14.map((d) => (
          <div key={d.date} className="flex h-full flex-1 flex-col items-center justify-end gap-1" title={d.steps === null ? "Pas de donnée" : `${n(d.steps)} pas`}>
            <span
              className={`w-full rounded-t-md ${d.steps === null ? "bg-ink-soft/20" : goal && d.steps >= goal ? "bg-mint-deep" : "bg-mint"}`}
              style={{ height: d.steps === null ? "4px" : `${Math.max(6, (d.steps / max) * 100)}%` }}
            />
            <span className="text-[9px] font-bold text-ink-soft">{new Date(`${d.date}T12:00:00`).toLocaleDateString("fr-FR", { weekday: "narrow" })}</span>
          </div>
        ))}
      </div>
      <p className="mt-2 text-[11px] font-semibold text-ink-soft">Les jours en gris : montre non portée. Trait pointillé : ton objectif.</p>
    </div>
  );
}

export function Summary({ data }: { data: GarminOverview }) {
  // dernier jour qui a des pas (la montre n'est pas toujours portée)
  const latest = [...data.days].reverse().find((d) => d.steps !== null);
  const { week } = data;
  const intensityPct = Math.min(100, (week.intensityMin / data.intensityGoal) * 100);

  return (
    <div className="space-y-4">
      <div className="rounded-3xl bg-mint-soft p-4">
        {latest ? (
          <>
            <p className="mb-3 text-xs font-bold uppercase tracking-wide text-ink-soft">{relativeDay(latest.date, data.today)}</p>
            <div className="flex items-center gap-4">
              <Ring steps={latest.steps!} goal={latest.stepGoal ?? data.stepGoal} />
              <dl className="grid flex-1 grid-cols-2 gap-x-3 gap-y-3 text-sm">
                {latest.distanceM !== null && <Stat label="Distance" value={km(latest.distanceM)} />}
                {latest.activeKcal !== null && <Stat label="Calories actives" value={`${n(latest.activeKcal)} kcal`} />}
                {latest.floors !== null && <Stat label="Étages" value={n(latest.floors)} />}
                {latest.bodyBattery !== null && <Stat label="Batterie corps" value={`${latest.bodyBattery} / 100`} />}
                {latest.stress !== null && <Stat label="Stress moyen" value={`${latest.stress} / 100`} />}
              </dl>
            </div>
          </>
        ) : (
          <p className="text-center text-sm font-bold text-ink-soft">Aucune donnée de pas ces dernières semaines : porte ta montre pour voir ta journée ici.</p>
        )}
      </div>

      <div className="rounded-3xl bg-white p-4 shadow-soft">
        <p className="text-xs font-bold uppercase tracking-wide text-ink-soft">7 derniers jours</p>
        <div className="mt-2 flex items-baseline justify-between">
          <p className="text-2xl font-extrabold">
            {week.intensityMin} <span className="text-sm font-bold text-ink-soft">/ {data.intensityGoal} min d'activité intense</span>
          </p>
          {week.intensityMin >= data.intensityGoal && <span className="text-lg" aria-label="Objectif atteint">🎉</span>}
        </div>
        <div className="mt-2 h-3 overflow-hidden rounded-full bg-mint-soft">
          <div className="h-full rounded-full bg-mint-deep" style={{ width: `${intensityPct}%` }} />
        </div>
        <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-sm font-bold text-ink-soft">
          <span>🏅 {week.sessions} sortie{week.sessions > 1 ? "s" : ""}</span>
          <span>📍 {km(week.distanceM)}</span>
          <span>⏱️ {duration(week.durationS) ?? "0 min"}</span>
        </div>
      </div>

      <StepsChart days={data.days} goal={data.stepGoal} today={data.today} />
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-[11px] font-bold text-ink-soft">{label}</dt>
      <dd className="font-extrabold">{value}</dd>
    </div>
  );
}

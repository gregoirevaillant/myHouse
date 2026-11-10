import { useState, type ReactNode } from "react";

const tip = (ratio: number) => (ratio < 0.3 ? { left: 0 } : ratio > 0.7 ? { right: 0 } : { left: `${ratio * 100}%`, transform: "translate(-50%, -100%)" });
const Tip = ({ ratio, children }: { ratio: number; children: ReactNode }) => (
  <div className="pointer-events-none absolute -top-2 z-10 -translate-y-full whitespace-nowrap rounded-xl bg-ink px-3 py-1.5 text-xs font-bold text-white shadow-soft" style={tip(ratio)}>
    {children}
  </div>
);

export type StackBar = { key: string; label: string; axis?: string; tooltip: string; parts: { value: number; color: string }[]; current?: boolean };

// barres empilées (une couleur par sport), survol ou toucher pour le détail
export function StackedBars({ bars, formatTick, title }: { bars: StackBar[]; formatTick: (v: number) => string; title: string }) {
  const [active, setActive] = useState<number | null>(null);
  const totals = bars.map((b) => b.parts.reduce((s, p) => s + p.value, 0));
  const top = Math.max(...totals, 0);
  const step = top > 0 ? [1, 2, 5, 10, 20, 50, 100, 200, 500, 1000, 2000, 5000, 10000, 20000].find((s) => s * 3 >= top) ?? top : 1;
  const max = Math.max(step * Math.ceil(top / step), step);
  const ticks = [max, max / 2, 0];
  return (
    <div>
      <div className="relative flex h-40 gap-2">
        <div className="relative w-12 shrink-0 text-right text-[11px] tabular-nums text-ink-soft">
          {ticks.map((t, i) => (
            <span key={t} className="absolute right-0 -translate-y-1/2" style={{ top: `${i * 50}%` }}>{formatTick(t)}</span>
          ))}
        </div>
        <div className="relative flex-1" onPointerLeave={() => setActive(null)}>
          {ticks.map((t, i) => <div key={t} className="absolute inset-x-0 border-t border-ink/10" style={{ top: `${i * 50}%` }} />)}
          <div className="absolute inset-0 flex items-end">
            {bars.map((b, i) => (
              <button key={b.key} type="button" aria-label={b.tooltip} className="flex h-full flex-1 items-end justify-center px-px outline-none" onPointerEnter={() => setActive(i)} onFocus={() => setActive(i)} onClick={() => setActive(i)}>
                <span className={`flex w-full max-w-6 flex-col-reverse overflow-hidden rounded-t ${b.current ? "opacity-70" : ""} ${active === i ? "brightness-90" : ""}`} style={{ height: `${(totals[i] / max) * 100}%`, minHeight: totals[i] > 0 ? 2 : 0 }}>
                  {b.parts.filter((p) => p.value > 0).map((p, k) => <span key={k} className={p.color} style={{ height: `${(p.value / totals[i]) * 100}%` }} />)}
                </span>
              </button>
            ))}
          </div>
          {active !== null && <Tip ratio={(active + 0.5) / bars.length}>{bars[active].tooltip}</Tip>}
        </div>
      </div>
      <div className="ml-14 mt-1 flex text-[11px] font-semibold text-ink-soft">
        {bars.map((b, i) => (
          <span key={b.key} className="relative h-4 min-w-0 flex-1">
            {/* repère posé sans élargir la ligne ; calé à gauche/droite aux extrémités pour ne pas déborder de l'écran */}
            {b.axis && <span className={`absolute top-0 whitespace-nowrap ${i < bars.length * 0.15 ? "left-0" : i > bars.length * 0.85 ? "right-0" : "left-1/2 -translate-x-1/2"}`}>{b.axis}</span>}
          </span>
        ))}
      </div>
      {/* version lisible par les lecteurs d'écran ; dans un conteneur qui coupe, un tableau « sr-only » élargirait la page */}
      <div className="sr-only"><table><caption>{title}</caption><tbody>{bars.map((b) => <tr key={b.key}><th>{b.label}</th><td>{b.tooltip}</td></tr>)}</tbody></table></div>
    </div>
  );
}

export type Point = { label: string; value: number; extra?: number | null };

// courbe avec repères (min / milieu / max) et valeur exacte au survol ; extra = deuxième courbe en pointillés (ex. moyenne)
export function Line({ points, format, color = "stroke-sky-deep", dot = "bg-sky-deep", title, unit = "", pad = 0.1 }: { points: Point[]; format: (v: number) => string; color?: string; dot?: string; title: string; unit?: string; pad?: number }) {
  const [active, setActive] = useState<number | null>(null);
  const values = points.flatMap((p) => [p.value, ...(p.extra != null ? [p.extra] : [])]);
  const lo0 = Math.min(...values), hi0 = Math.max(...values);
  const margin = (hi0 - lo0 || 1) * pad;
  const lo = lo0 - margin, hi = hi0 + margin;
  const x = (i: number) => (points.length > 1 ? (i / (points.length - 1)) * 100 : 50);
  const y = (v: number) => 100 - ((v - lo) / (hi - lo)) * 100;
  const path = (get: (p: Point) => number | null | undefined) => points.map((p, i) => (get(p) == null ? null : `${x(i)},${y(get(p)!)}`)).filter(Boolean).join(" ");
  const move = (e: React.PointerEvent<HTMLDivElement>) => {
    const r = e.currentTarget.getBoundingClientRect();
    setActive(Math.max(0, Math.min(points.length - 1, Math.round(((e.clientX - r.left) / r.width) * (points.length - 1)))));
  };
  const a = active !== null ? points[active] : null;
  return (
    <div>
      <div className="flex gap-2">
        <div className="relative h-32 w-12 shrink-0 text-right text-[11px] tabular-nums text-ink-soft">
          {[hi0, (hi0 + lo0) / 2, lo0].map((t, i) => <span key={i} className="absolute right-0 -translate-y-1/2" style={{ top: `${y(t)}%` }}>{format(t)}</span>)}
        </div>
        <div className="relative h-32 flex-1 touch-pan-y" onPointerMove={move} onPointerDown={move} onPointerLeave={() => setActive(null)}>
          {[hi0, (hi0 + lo0) / 2, lo0].map((t, i) => <div key={i} className="absolute inset-x-0 border-t border-ink/10" style={{ top: `${y(t)}%` }} />)}
          <svg viewBox="0 0 100 100" preserveAspectRatio="none" className="absolute inset-0 h-full w-full overflow-visible" role="img" aria-label={title}>
            {points.some((p) => p.extra != null) && <polyline points={path((p) => p.extra)} fill="none" strokeWidth={1.5} strokeDasharray="3 3" vectorEffect="non-scaling-stroke" className="stroke-ink/30" />}
            <polyline points={path((p) => p.value)} fill="none" strokeWidth={2.5} strokeLinejoin="round" strokeLinecap="round" vectorEffect="non-scaling-stroke" className={color} />
          </svg>
          {points.length === 1 && <span className={`absolute h-2.5 w-2.5 -translate-x-1/2 -translate-y-1/2 rounded-full ${dot}`} style={{ left: "50%", top: `${y(points[0].value)}%` }} />}
          {a && active !== null && (
            <>
              <div className="absolute inset-y-0 border-l border-ink/20" style={{ left: `${x(active)}%` }} />
              <span className={`absolute h-3 w-3 -translate-x-1/2 -translate-y-1/2 rounded-full ring-2 ring-white ${dot}`} style={{ left: `${x(active)}%`, top: `${y(a.value)}%` }} />
              <Tip ratio={x(active) / 100}>{a.label} · {format(a.value)}{unit}{a.extra != null ? ` (moy. ${format(a.extra)})` : ""}</Tip>
            </>
          )}
        </div>
      </div>
      <div className="ml-14 mt-1 flex justify-between text-[11px] font-semibold text-ink-soft"><span>{points[0].label}</span><span>{points[points.length - 1].label}</span></div>
    </div>
  );
}

// mini-courbe sans axes (tendance d'un indicateur sur la période)
export function Spark({ values, color = "stroke-ink/40" }: { values: number[]; color?: string }) {
  if (values.length < 2) return null;
  const lo = Math.min(...values), hi = Math.max(...values);
  const pts = values.map((v, i) => `${(i / (values.length - 1)) * 100},${100 - ((v - lo) / (hi - lo || 1)) * 80 - 10}`).join(" ");
  return (
    <svg viewBox="0 0 100 100" preserveAspectRatio="none" className="h-8 w-full overflow-visible" aria-hidden>
      <polyline points={pts} fill="none" strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" vectorEffect="non-scaling-stroke" className={color} />
    </svg>
  );
}

export type Cell = { date: string; sec: number; label: string } | null;

// calendrier de régularité : une colonne par semaine (lundi → dimanche), plus c'est foncé, plus la journée est longue
export function Heatmap({ columns }: { columns: Cell[][] }) {
  const [sel, setSel] = useState<string>("");
  const tone = (s: number) => (s <= 0 ? "bg-ink/10" : s < 1800 ? "bg-sky-deep/35" : s < 3600 ? "bg-sky-deep/60" : s < 5400 ? "bg-sky-deep/80" : "bg-sky-deep");
  return (
    <div>
      <div className="flex gap-[3px]" onPointerLeave={() => setSel("")}>
        {columns.map((col, i) => (
          <div key={i} className="flex flex-1 flex-col gap-[3px]">
            {col.map((c, j) => (
              <button key={j} type="button" disabled={!c} aria-label={c?.label} onPointerEnter={() => c && setSel(c.label)} onClick={() => c && setSel(c.label)} className={`aspect-square w-full rounded-[3px] ${c ? tone(c.sec) : "opacity-0"}`} />
            ))}
          </div>
        ))}
      </div>
      <p className="mt-2 h-4 text-xs font-bold text-ink-soft">{sel || "Touche une case pour le détail."}</p>
    </div>
  );
}

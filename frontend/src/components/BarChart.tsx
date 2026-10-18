import { useState } from "react";

export type Bar = { key: string; label: string; tooltip: string; value: number; axisLabel?: string };

// Arrondit le maximum de l'axe à une valeur ronde (1, 2, 5 × 10^n)
function niceMax(max: number) {
  if (max <= 0) return 1;
  const raw = max / 3;
  const pow = 10 ** Math.floor(Math.log10(raw));
  const step = [1, 2, 5, 10].map((m) => m * pow).find((s) => s >= raw)!;
  return Math.ceil(max / step) * step;
}

// ancre l'infobulle à gauche, au centre ou à droite pour qu'elle ne déborde pas
function tooltipPosition(ratio: number) {
  if (ratio < 0.3) return { left: 0 };
  if (ratio > 0.7) return { right: 0 };
  return { left: `${ratio * 100}%`, transform: "translate(-50%, -100%)" };
}

export function BarChart({
  bars,
  formatTick,
  formatValue,
  selectedKey,
  onSelect,
  title,
}: {
  bars: Bar[];
  formatTick: (v: number) => string;
  formatValue: (v: number) => string;
  selectedKey?: string;
  onSelect?: (key: string) => void;
  title: string;
}) {
  const [active, setActive] = useState<number | null>(null);
  const max = niceMax(Math.max(0, ...bars.map((b) => b.value)));
  const ticks = [max, max / 2, 0];
  const activeBar = active !== null ? bars[active] : null;

  return (
    <div>
      <div className="relative flex h-40 gap-2">
        {/* axe Y */}
        <div className="relative w-12 shrink-0 text-right text-[11px] tabular-nums text-ink-soft">
          {ticks.map((t, i) => (
            <span key={t} className="absolute right-0 -translate-y-1/2" style={{ top: `${(i / (ticks.length - 1)) * 100}%` }}>
              {formatTick(t)}
            </span>
          ))}
        </div>

        <div className="relative flex-1" onPointerLeave={() => setActive(null)}>
          {/* grille */}
          {ticks.map((t, i) => (
            <div key={t} className="absolute inset-x-0 border-t border-ink/10" style={{ top: `${(i / (ticks.length - 1)) * 100}%` }} />
          ))}

          <div className="absolute inset-0 flex items-end">
            {bars.map((b, i) => {
              const selected = selectedKey === undefined || b.key === selectedKey;
              return (
                <button
                  key={b.key}
                  type="button"
                  aria-label={`${b.label} : ${formatValue(b.value)}`}
                  className="flex h-full flex-1 items-end justify-center px-px outline-none"
                  onPointerEnter={() => setActive(i)}
                  onFocus={() => setActive(i)}
                  onClick={() => {
                    setActive(i);
                    onSelect?.(b.key);
                  }}
                >
                  <span
                    className={`block w-full max-w-6 rounded-t transition-colors ${
                      selected ? "bg-sky-deep" : "bg-sky"
                    } ${active === i ? "opacity-80" : ""}`}
                    style={{ height: `${(b.value / max) * 100}%`, minHeight: b.value > 0 ? 2 : 0 }}
                  />
                </button>
              );
            })}
          </div>

          {activeBar && active !== null && (
            <div
              className="pointer-events-none absolute -top-2 z-10 -translate-y-full whitespace-nowrap rounded-xl bg-ink px-3 py-1.5 text-xs font-bold text-white shadow-soft"
              style={tooltipPosition((active + 0.5) / bars.length)}
            >
              {activeBar.tooltip} · {formatValue(activeBar.value)}
            </div>
          )}
        </div>
      </div>

      {/* axe X */}
      <div className="ml-14 mt-1 flex text-[11px] font-semibold text-ink-soft">
        {bars.map((b) => (
          <span key={b.key} className="flex-1 text-center">
            {b.axisLabel ?? b.label}
          </span>
        ))}
      </div>

      <table className="sr-only">
        <caption>{title}</caption>
        <tbody>
          {bars.map((b) => (
            <tr key={b.key}>
              <th>{b.label}</th>
              <td>{formatValue(b.value)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

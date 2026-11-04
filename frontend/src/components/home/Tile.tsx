import type { ReactNode } from "react";
import { Link } from "react-router-dom";

// Le lien couvre toute la tuile (derrière) ; le contenu laisse passer les clics, sauf les actions rapides (`Action`).
export function Tile({ to, icon, label, className, children }: { to: string; icon: string; label: string; className: string; children: ReactNode }) {
  return (
    <div className={`bento-tile group relative flex flex-col overflow-hidden rounded-3xl p-4 shadow-soft transition hover:-translate-y-0.5 active:scale-95 ${className}`}>
      <Link to={to} aria-label={label} className="absolute inset-0 z-0" />
      {/* grand emoji décoratif dans le coin */}
      <span
        aria-hidden
        className="pointer-events-none absolute -bottom-3 -right-3 rotate-12 select-none text-7xl opacity-25 transition group-hover:rotate-0 group-hover:scale-110"
      >
        {icon}
      </span>
      <div className="pointer-events-none relative z-10">{children}</div>
    </div>
  );
}

export const Action = ({ children, className = "" }: { children: ReactNode; className?: string }) => (
  <div className={`pointer-events-auto ${className}`}>{children}</div>
);

export const Label = ({ children }: { children: ReactNode }) => (
  <p className="text-xs font-extrabold uppercase tracking-wider text-ink/50">{children}</p>
);

export function MealChip({ icon, label, text }: { icon: string; label: string; text?: string }) {
  return (
    <div className="rounded-2xl bg-white/70 px-3 py-2">
      <p className="text-xs font-bold text-ink-soft">
        {icon} {label}
      </p>
      <p className={`truncate font-bold ${text ? "" : "text-ink/40"}`}>{text ?? "Rien de prévu"}</p>
    </div>
  );
}

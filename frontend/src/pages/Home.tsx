import type { CSSProperties, ReactNode } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { api, type JournalSummary, type Meal } from "../lib/api";
import { consentWarning, useBudgetMonth } from "../lib/budget";
import { mondayOf, monthKey, shortDate, toIso } from "../lib/dates";
import { computeDebt, useExpenses } from "../lib/expenses";
import { useMembers } from "../lib/members";
import { formatEur } from "../lib/money";
import { cardsQuery, shoppingQuery } from "../lib/offline";
import { useVisibleTabs } from "../lib/tabs";

export function Home() {
  const visible = new Set(useVisibleTabs().map((t) => t.to));
  const today = toIso(new Date());
  const week = mondayOf(new Date());

  const { data: items = [] } = useQuery({ ...shoppingQuery, enabled: visible.has("/courses") });
  const { data: cards = [] } = useQuery({ ...cardsQuery, enabled: visible.has("/cartes") });
  const { data: meals = [] } = useQuery({
    queryKey: ["meals", week],
    queryFn: () => api<Meal[]>(`/meals?week=${week}`),
    enabled: visible.has("/repas"),
  });
  const { data: expenses = [] } = useExpenses(visible.has("/depenses"));
  const { data: members = [] } = useMembers();
  const { data: journals = [] } = useQuery({
    queryKey: ["journals"],
    queryFn: () => api<JournalSummary[]>("/journals"),
    enabled: visible.has("/journal"),
  });

  const { data: budget } = useBudgetMonth(monthKey(today), visible.has("/budget"));

  const toBuy = items.filter((i) => !i.checked);
  const meal = (slot: Meal["slot"]) => meals.find((m) => m.date === today && m.slot === slot)?.text;
  const debt = computeDebt(expenses, members);
  const wroteToday = journals.some((j) => j.lastDate === today);
  const budgetLeft = budget && budget.totals.income - budget.totals.outflow - budget.totals.invested;
  const nextDue = budget?.recurring
    .filter((r) => r.upcoming.length && r.amountCents < 0)
    .sort((a, b) => a.upcoming[0].localeCompare(b.upcoming[0]))[0];

  // l'ordre des tuiles compose la grille ; grid-flow-dense comble les trous quand une page est masquée
  const tiles: { to: string; node: ReactNode }[] = [
    {
      to: "/repas",
      node: (
        <Tile to="/repas" icon="🍽️" className="col-span-2 bg-peach">
          <Label>Au menu aujourd'hui</Label>
          <p className="mt-1 text-xl font-extrabold first-letter:uppercase">
            {new Date().toLocaleDateString("fr-FR", { weekday: "long", day: "numeric", month: "long" })}
          </p>
          <div className="mt-3 grid grid-cols-2 gap-2">
            <MealChip icon="☀️" label="Midi" text={meal("LUNCH")} />
            <MealChip icon="🌙" label="Soir" text={meal("DINNER")} />
          </div>
        </Tile>
      ),
    },
    {
      to: "/courses",
      node: (
        <Tile to="/courses" icon="🛒" className="row-span-2 bg-mint">
          <Label>Courses</Label>
          <p className="mt-1 text-5xl font-extrabold leading-none">{toBuy.length}</p>
          <p className="text-sm font-bold text-ink/60">à acheter</p>
          <ul className="mt-3 space-y-1">
            {toBuy.slice(0, 4).map((i) => (
              <li key={i.id} className="truncate rounded-xl bg-white/60 px-2 py-1 text-sm font-semibold">
                {i.label}
              </li>
            ))}
            {toBuy.length > 4 && <li className="px-2 text-xs font-bold text-ink/50">+ {toBuy.length - 4} autres</li>}
            {toBuy.length === 0 && <li className="text-sm font-semibold text-ink/60">Tout est pris ✓</li>}
          </ul>
        </Tile>
      ),
    },
    {
      to: "/cartes",
      node: (
        <Tile to="/cartes" icon="💳" className="bg-lavender">
          <Label>Cartes</Label>
          <div className="mt-3 flex h-8 items-center">
            {cards.slice(0, 4).map((c, i) => (
              <span
                key={c.id}
                style={{ backgroundColor: c.color, transform: `rotate(${(i - 1) * 8}deg)` }}
                className="-ml-2 h-8 w-12 rounded-lg border-2 border-white shadow-soft first:ml-0"
              />
            ))}
          </div>
          <p className="mt-2 text-sm font-bold text-ink/60">
            {cards.length} carte{cards.length > 1 ? "s" : ""}
          </p>
        </Tile>
      ),
    },
    {
      to: "/depenses",
      node: (
        <Tile to="/depenses" icon="💶" className="bg-sky">
          <Label>Dépenses</Label>
          {debt ? (
            <p className="mt-2 text-sm font-bold leading-snug">
              {debt.from.name} doit <span className="block text-2xl font-extrabold">{formatEur(debt.cents)}</span>à {debt.to.name}
            </p>
          ) : (
            <p className="mt-2 text-lg font-extrabold leading-tight">Comptes à jour ✓</p>
          )}
        </Tile>
      ),
    },
    {
      to: "/journal",
      node: (
        <Tile to="/journal" icon="📔" className="bg-lemon">
          <Label>Journal</Label>
          <p className="mt-1 font-extrabold leading-snug">{wroteToday ? "Tu as écrit aujourd'hui ✓" : "Qu'as-tu vécu aujourd'hui ?"}</p>
          <p className="text-sm font-bold text-ink/60">
            {journals.length} journa{journals.length > 1 ? "ux" : "l"}
          </p>
        </Tile>
      ),
    },
    {
      to: "/budget",
      node: (
        <Tile to="/budget" icon="📊" className="bg-rose">
          <Label>Budget</Label>
          {!budget?.bank.connected ? (
            <p className="mt-2 text-lg font-extrabold leading-tight">Connecte ta banque</p>
          ) : (
            <>
              <p className="mt-1 text-2xl font-extrabold">{formatEur(budgetLeft ?? 0)}</p>
              <p className="text-sm font-bold text-ink/60">reste ce mois</p>
              {consentWarning(budget.bank.consentUntil) ? (
                <p className="mt-2 text-xs font-bold">⚠️ Accès banque à renouveler</p>
              ) : (
                nextDue && (
                  <p className="mt-2 truncate text-xs font-bold text-ink/60">
                    {shortDate(nextDue.upcoming[0])} · {nextDue.label} {formatEur(-nextDue.amountCents)}
                  </p>
                )
              )}
            </>
          )}
        </Tile>
      ),
    },
  ];

  const shown = tiles.filter((t) => visible.has(t.to));

  return (
    <section className="grid auto-rows-[minmax(8rem,auto)] grid-flow-dense grid-cols-2 gap-3 sm:grid-cols-3">
      {shown.map((t, i) => (
        <div key={t.to} className="contents" style={{ "--delay": `${i * 60}ms` } as CSSProperties}>
          {t.node}
        </div>
      ))}
      <div className="contents" style={{ "--delay": `${shown.length * 60}ms` } as CSSProperties}>
        <Tile to="/profil" icon="⚙️" className="bg-rose">
          <Label>Réglages</Label>
          <p className="mt-2 text-sm font-bold text-ink/60">Menu, pages, mot de passe</p>
        </Tile>
      </div>
    </section>
  );
}

function Tile({ to, icon, className, children }: { to: string; icon: string; className: string; children: ReactNode }) {
  return (
    <Link
      to={to}
      className={`bento-tile group relative flex flex-col overflow-hidden rounded-3xl p-4 shadow-soft transition hover:-translate-y-0.5 active:scale-95 ${className}`}
    >
      {/* grand emoji décoratif dans le coin */}
      <span
        aria-hidden
        className="pointer-events-none absolute -bottom-3 -right-3 rotate-12 select-none text-7xl opacity-25 transition group-hover:rotate-0 group-hover:scale-110"
      >
        {icon}
      </span>
      <div className="relative">{children}</div>
    </Link>
  );
}

const Label = ({ children }: { children: ReactNode }) => (
  <p className="text-xs font-extrabold uppercase tracking-wider text-ink/50">{children}</p>
);

function MealChip({ icon, label, text }: { icon: string; label: string; text?: string }) {
  return (
    <div className="rounded-2xl bg-white/70 px-3 py-2">
      <p className="text-xs font-bold text-ink-soft">
        {icon} {label}
      </p>
      <p className={`truncate font-bold ${text ? "" : "text-ink/40"}`}>{text ?? "Rien de prévu"}</p>
    </div>
  );
}

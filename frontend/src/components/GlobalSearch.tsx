import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import { shortDate } from "../lib/dates";
import { useExpenses, useTrackers } from "../lib/expenses";
import { formatEur } from "../lib/money";
import { cardsQuery, infosQuery, shoppingQuery } from "../lib/offline";
import { normalize, useProducts } from "../lib/products";
import { cuisineInfo, districtLabel, useRestaurants } from "../lib/restaurants";
import { useVisibleTabs } from "../lib/tabs";

type Result = { key: string; icon: string; title: string; subtitle?: string; to: string; state?: unknown };
type Section = { label: string; results: Result[] };

const MAX_PER_SECTION = 5;

// Recherche dans toute l'app : courses, produits, cartes, restos, infos, dépenses (pages visibles seulement)
export function GlobalSearch({ onClose }: { onClose: () => void }) {
  const navigate = useNavigate();
  const visible = new Set(useVisibleTabs().map((t) => t.to));
  const [query, setQuery] = useState("");

  const { data: items = [] } = useQuery({ ...shoppingQuery, enabled: visible.has("/courses") });
  const { data: products = [] } = useProducts();
  const { data: cards = [] } = useQuery({ ...cardsQuery, enabled: visible.has("/cartes") });
  const { data: restaurants = [] } = useRestaurants(visible.has("/restos"));
  const { data: infos = [] } = useQuery({ ...infosQuery, enabled: visible.has("/infos") });
  const { data: expenses = [] } = useExpenses(visible.has("/depenses"));
  const { data: trackers = [] } = useTrackers();

  const q = normalize(query);
  const matches = (...fields: (string | null | undefined)[]) => fields.some((f) => f && normalize(f).includes(q));

  const sections: Section[] = !q
    ? []
    : [
        {
          label: "Courses",
          results: visible.has("/courses")
            ? [
                ...items
                  .filter((i) => matches(i.label))
                  .map((i) => ({ key: `s-${i.id}`, icon: i.checked ? "✅" : "🛒", title: i.label, subtitle: i.checked ? "Dans le panier" : "Sur la liste", to: "/courses" })),
                ...products
                  .filter((p) => matches(p.name, p.note))
                  .map((p) => ({ key: `p-${p.id}`, icon: "🛍️", title: p.name, subtitle: p.note ?? "Produit", to: "/courses/produits" })),
              ]
            : [],
        },
        {
          label: "Infos",
          results: infos
            .filter((i) => matches(i.label, i.value, i.note))
            .map((i) => ({ key: `i-${i.id}`, icon: "🔑", title: i.label, subtitle: i.value, to: "/infos" })),
        },
        {
          label: "Restos",
          results: restaurants
            .filter((r) => matches(r.name, cuisineInfo(r.cuisine).label, r.district, r.address))
            .map((r) => ({
              key: `r-${r.id}`,
              icon: cuisineInfo(r.cuisine).emoji,
              title: r.name,
              subtitle: `${cuisineInfo(r.cuisine).label} · ${districtLabel(r)}${r.wishlist ? " · à tester" : ""}`,
              to: "/restos",
              state: { open: r.id },
            })),
        },
        {
          label: "Cartes",
          results: cards
            .filter((c) => matches(c.name, c.description))
            .map((c) => ({ key: `c-${c.id}`, icon: "💳", title: c.name, subtitle: c.description ?? undefined, to: `/cartes/${c.id}` })),
        },
        {
          label: "Dépenses",
          results: [
            ...trackers
              .filter((t) => visible.has("/depenses") && matches(t.name))
              .map((t) => ({ key: `t-${t.id}`, icon: t.emoji, title: t.name, subtitle: "Carnet", to: `/depenses/${t.id}` })),
            ...expenses
              .filter((e) => matches(e.title))
              .sort((a, b) => b.date.localeCompare(a.date))
              .map((e) => {
                const tracker = trackers.find((t) => t.id === e.trackerId);
                return {
                  key: `e-${e.id}`,
                  icon: tracker?.emoji ?? "💶",
                  title: e.title,
                  subtitle: `${formatEur(e.amountCents)} · ${shortDate(e.date)}${tracker ? ` · ${tracker.name}` : ""}`,
                  to: `/depenses/${e.trackerId}`,
                  // le carnet s'ouvre sur le mois de la dépense
                  state: { month: e.date.slice(0, 7) },
                };
              }),
          ],
        },
      ].filter((s) => s.results.length);

  const go = (r: Result) => {
    onClose();
    navigate(r.to, { state: r.state });
  };

  return (
    <div className="space-y-4">
      <input
        className="input focus:border-lavender"
        placeholder="Un resto, un code, un produit, une dépense…"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        autoFocus
        enterKeyHint="search"
      />

      {q && !sections.length && <p className="rounded-3xl bg-lavender-soft p-6 text-center font-semibold text-ink-soft">Rien trouvé pour « {query.trim()} »</p>}

      {sections.map((s) => (
        <div key={s.label}>
          <p className="mb-1.5 px-1 text-xs font-extrabold uppercase tracking-wide text-ink-soft">
            {s.label} · {s.results.length}
          </p>
          <ul className="space-y-1.5">
            {s.results.slice(0, MAX_PER_SECTION).map((r) => (
              <li key={r.key}>
                <button onClick={() => go(r)} className="flex w-full items-center gap-3 rounded-2xl bg-white px-4 py-2.5 text-left shadow-soft transition active:scale-[0.98]">
                  <span className="text-xl">{r.icon}</span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate font-bold">{r.title}</span>
                    {r.subtitle && <span className="block truncate text-xs font-semibold text-ink-soft">{r.subtitle}</span>}
                  </span>
                </button>
              </li>
            ))}
          </ul>
          {s.results.length > MAX_PER_SECTION && (
            <p className="mt-1 px-1 text-xs font-bold text-ink-soft">+ {s.results.length - MAX_PER_SECTION} autres : précise ta recherche</p>
          )}
        </div>
      ))}
    </div>
  );
}

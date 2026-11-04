import { useState, type FormEvent } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api, type JournalSummary, type Meal, type ShoppingItem } from "../../lib/api";
import { useMe } from "../../lib/auth";
import { budgetSummary, useBudgetItems } from "../../lib/budget";
import { totalKcal, useCalorieEntries } from "../../lib/calories";
import { mondayOf, shortDate, toIso } from "../../lib/dates";
import { computeDebt, useExpenses } from "../../lib/expenses";
import { useMembers } from "../../lib/members";
import { formatEur } from "../../lib/money";
import { cardsQuery, infosQuery, shoppingQuery } from "../../lib/offline";
import { recipeCategory, useRecipes } from "../../lib/recipes";
import { cuisineInfo, useRestaurants } from "../../lib/restaurants";
import { CalorieEntryForm } from "../CalorieEntryForm";
import { Modal } from "../Modal";
import { Action, Label, MealChip, Tile } from "./Tile";

// une tuile par page de l'accueil ; `wide` = sur 2 colonnes (réglage de la personne)
type Props = { wide: boolean };
const span = (wide: boolean) => (wide ? "col-span-2 " : "");

export function MealsTile({ wide }: Props) {
  const today = toIso(new Date());
  const week = mondayOf(new Date());
  const { data: meals = [] } = useQuery({ queryKey: ["meals", week], queryFn: () => api<Meal[]>(`/meals?week=${week}`) });
  const meal = (slot: Meal["slot"]) => meals.find((m) => m.date === today && m.slot === slot)?.text;
  return (
    <Tile to="/repas" icon="🍽️" label="Repas" className={`${span(wide)}bg-peach`}>
      <Label>Au menu aujourd'hui</Label>
      <p className="mt-1 text-xl font-extrabold first-letter:uppercase">
        {new Date().toLocaleDateString("fr-FR", { weekday: "long", day: "numeric", month: "long" })}
      </p>
      <div className={`mt-3 grid gap-2 ${wide ? "grid-cols-2" : "grid-cols-1"}`}>
        <MealChip icon="☀️" label="Midi" text={meal("LUNCH")} />
        <MealChip icon="🌙" label="Soir" text={meal("DINNER")} />
      </div>
    </Tile>
  );
}

export function ShoppingTile({ wide }: Props) {
  const qc = useQueryClient();
  const { data: items = [] } = useQuery(shoppingQuery);
  const [label, setLabel] = useState("");
  const toBuy = items.filter((i) => !i.checked);
  const add = useMutation({
    mutationFn: (text: string) => api<ShoppingItem>("/shopping", { method: "POST", json: { label: text } }),
    onSuccess: (item) => {
      qc.setQueryData<ShoppingItem[]>(shoppingQuery.queryKey, (old = []) => [item, ...old]);
      setLabel("");
    },
  });
  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (label.trim()) add.mutate(label.trim());
  };
  return (
    <Tile to="/courses" icon="🛒" label="Courses" className={`${wide ? "col-span-2" : "row-span-2"} bg-mint`}>
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
      <Action className="mt-3">
        <form onSubmit={submit} className="flex gap-1.5">
          <input
            className="min-w-0 flex-1 rounded-xl bg-white/80 px-3 py-2 text-base font-semibold outline-none placeholder:text-ink/40"
            placeholder="Ajouter…"
            aria-label="Ajouter un article aux courses"
            value={label}
            onChange={(e) => setLabel(e.target.value)}
          />
          <button className="h-10 w-10 shrink-0 rounded-xl bg-white/80 text-lg font-extrabold disabled:opacity-40" aria-label="Ajouter" disabled={add.isPending || !label.trim()}>
            +
          </button>
        </form>
      </Action>
    </Tile>
  );
}

export function CardsTile({ wide }: Props) {
  const { data: cards = [] } = useQuery(cardsQuery);
  return (
    <Tile to="/cartes" icon="💳" label="Cartes" className={`${span(wide)}bg-lavender`}>
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
  );
}

export function RestosTile({ wide }: Props) {
  const { data: restaurants = [] } = useRestaurants();
  const tested = restaurants.filter((r) => !r.wishlist);
  const lastVisited = tested.filter((r) => r.visits[0]).sort((a, b) => b.visits[0].localeCompare(a.visits[0]))[0];
  return (
    <Tile to="/restos" icon="🍜" label="Restos" className={`${span(wide)}bg-peach`}>
      <Label>Restos</Label>
      <p className="mt-1 text-2xl font-extrabold">
        {tested.length} <span className="text-sm font-bold text-ink/60">testé{tested.length > 1 ? "s" : ""}</span>
      </p>
      <p className="text-sm font-bold text-ink/60">{restaurants.length - tested.length} à tester</p>
      {lastVisited && (
        <p className="mt-2 truncate text-xs font-bold text-ink/60">
          Dernier : {cuisineInfo(lastVisited.cuisine).emoji} {lastVisited.name}
        </p>
      )}
    </Tile>
  );
}

export function RecipesTile({ wide }: Props) {
  const { data: recipes = [] } = useRecipes();
  // idée du jour : change chaque jour, la même pour les deux
  const idea = recipes.length ? recipes[Math.floor(Date.parse(toIso(new Date())) / 86_400_000) % recipes.length] : undefined;
  return (
    <Tile to="/recettes" icon="📖" label="Recettes" className={`${span(wide)}bg-rose`}>
      <Label>Recettes</Label>
      {idea ? (
        <>
          <p className="mt-1 text-xs font-bold text-ink/60">Idée du jour</p>
          <p className="line-clamp-2 font-extrabold leading-snug">
            {recipeCategory(idea.category).emoji} {idea.name}
          </p>
        </>
      ) : (
        <p className="mt-2 text-lg font-extrabold leading-tight">Nos recettes</p>
      )}
      <p className="mt-2 text-sm font-bold text-ink/60">
        {recipes.length} recette{recipes.length > 1 ? "s" : ""}
      </p>
    </Tile>
  );
}

export function ExpensesTile({ wide }: Props) {
  const { data: expenses = [] } = useExpenses();
  const { data: members = [] } = useMembers();
  const debt = computeDebt(expenses, members);
  return (
    <Tile to="/depenses" icon="💶" label="Dépenses" className={`${span(wide)}bg-sky`}>
      <Label>Dépenses</Label>
      {debt ? (
        <p className="mt-2 text-sm font-bold leading-snug">
          {debt.from.name} doit <span className="block text-2xl font-extrabold">{formatEur(debt.cents)}</span>à {debt.to.name}
        </p>
      ) : (
        <p className="mt-2 text-lg font-extrabold leading-tight">Comptes à jour ✓</p>
      )}
    </Tile>
  );
}

export function JournalTile({ wide }: Props) {
  const { data: journals = [] } = useQuery({ queryKey: ["journals"], queryFn: () => api<JournalSummary[]>("/journals") });
  const wroteToday = journals.some((j) => j.lastDate === toIso(new Date()));
  return (
    <Tile to="/journal" icon="📔" label="Journal" className={`${span(wide)}bg-lemon`}>
      <Label>Journal</Label>
      <p className="mt-1 font-extrabold leading-snug">{wroteToday ? "Tu as écrit aujourd'hui ✓" : "Qu'as-tu vécu aujourd'hui ?"}</p>
      <p className="text-sm font-bold text-ink/60">
        {journals.length} journa{journals.length > 1 ? "ux" : "l"}
      </p>
    </Tile>
  );
}

export function InfosTile({ wide }: Props) {
  const { data: infos = [] } = useQuery(infosQuery);
  return (
    <Tile to="/infos" icon="🔑" label="Infos" className={`${span(wide)}bg-lavender`}>
      <Label>Infos</Label>
      {infos.length ? (
        <ul className="mt-2 space-y-1">
          {infos
            .filter((i) => i.category === "CODE")
            .slice(0, 2)
            .map((i) => (
              <li key={i.id} className="truncate rounded-xl bg-white/60 px-2 py-1 text-sm font-semibold">
                {i.label} · <span className="font-mono font-extrabold">{i.value}</span>
              </li>
            ))}
        </ul>
      ) : (
        <p className="mt-2 text-lg font-extrabold leading-tight">Codes, Wi-Fi, numéros</p>
      )}
      <p className="mt-2 text-sm font-bold text-ink/60">
        {infos.length} info{infos.length > 1 ? "s" : ""}
      </p>
    </Tile>
  );
}

export function CaloriesTile({ wide }: Props) {
  const { data: me } = useMe();
  const today = toIso(new Date());
  const { data: entries = [] } = useCalorieEntries(today, today);
  const [adding, setAdding] = useState(false);
  return (
    <>
    <Tile to="/calories" icon="🔥" label="Calories" className={`${span(wide)}bg-peach`}>
      <Label>Calories</Label>
      <p className="mt-1 text-2xl font-extrabold">
        {totalKcal(entries)} <span className="text-sm font-bold text-ink/60">kcal</span>
      </p>
      <p className="text-sm font-bold text-ink/60">{me?.calorieGoal ? `sur ${me.calorieGoal} aujourd'hui` : "aujourd'hui"}</p>
      <Action className="mt-3">
        <button className="h-10 rounded-xl bg-white/80 px-4 text-sm font-extrabold" onClick={() => setAdding(true)}>
          + Repas
        </button>
      </Action>
    </Tile>
    {/* hors de la tuile : son overflow et ses transformations casseraient le plein écran du modal */}
    {adding && (
      <Modal title="Ajouter un repas" onClose={() => setAdding(false)}>
        <CalorieEntryForm date={today} onDone={() => setAdding(false)} />
      </Modal>
    )}
    </>
  );
}

export function BudgetTile({ wide }: Props) {
  const { data: items = [] } = useBudgetItems();
  const budget = budgetSummary(items, toIso(new Date()));
  return (
    <Tile to="/budget" icon="📊" label="Budget" className={`${span(wide)}bg-rose`}>
      <Label>Budget</Label>
      {items.length === 0 ? (
        <p className="mt-2 text-lg font-extrabold leading-tight">Ajoute tes charges</p>
      ) : (
        <>
          <p className="mt-1 text-2xl font-extrabold">{formatEur(budget.leftCents)}</p>
          <p className="text-sm font-bold text-ink/60">reste par mois</p>
          {budget.next && (
            <p className="mt-2 truncate text-xs font-bold text-ink/60">
              {shortDate(budget.next.date)} · {budget.next.item.label} {formatEur(budget.next.item.amountCents)}
            </p>
          )}
        </>
      )}
    </Tile>
  );
}

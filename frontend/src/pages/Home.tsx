import type { CSSProperties, ReactNode } from "react";
import { Label, Tile } from "../components/home/Tile";
import { BudgetTile, CaloriesTile, CardsTile, ExpensesTile, InfosTile, JournalTile, MealsTile, MediaTile, RecipesTile, RestosTile, ShoppingTile, WeightTile, HealthTile, SportTile, SleepTile, TodayTile } from "../components/home/tiles";
import { Link } from "react-router-dom";
import { usePrivateTabs, useHomeTabs, useWideTiles } from "../lib/tabs";

const TILES: Record<string, (p: { wide: boolean }) => ReactNode> = {
  "/repas": MealsTile,
  "/courses": ShoppingTile,
  "/cartes": CardsTile,
  "/restos": RestosTile,
  "/recettes": RecipesTile,
  "/depenses": ExpensesTile,
  "/journal": JournalTile,
  "/infos": InfosTile,
  "/calories": CaloriesTile,
  "/budget": BudgetTile,
  "/media": MediaTile,
  "/poids": WeightTile,
  "/sante": HealthTile,
  "/sport": SportTile,
  "/sommeil": SleepTile,
  "/aujourdhui": TodayTile,
};

// accueil de la famille ou espace privé (administrateur) : deux grosses tuiles pour choisir
function SpaceChoice() {
  const hasPrivate = usePrivateTabs().length > 0;
  if (!hasPrivate) return null;
  return (
    <div className="mb-3 grid grid-cols-2 gap-3">
      <Link to="/" className="rounded-3xl bg-peach p-4 text-center font-extrabold shadow-soft">🏠 Famille</Link>
      <Link to="/prive" className="rounded-3xl bg-lavender p-4 text-center font-extrabold shadow-soft">🔒 Mon espace</Link>
    </div>
  );
}

// espace privé : notes (journal), médias, calories et poids, hors de toute famille
export function PrivateHome() {
  const shown = usePrivateTabs();
  return (
    <>
      <SpaceChoice />
      <section className="grid auto-rows-[minmax(8rem,auto)] grid-flow-dense grid-cols-2 gap-3 sm:grid-cols-3">
        {shown.map((t, i) => {
          const Component = TILES[t.to];
          return (
            <div key={t.to} className="contents" style={{ "--delay": `${i * 60}ms` } as CSSProperties}>
              <Component wide={false} />
            </div>
          );
        })}
      </section>
    </>
  );
}

export function Home() {
  // pages affichées, dans l'ordre choisi (Réglages → Menu) ; grid-flow-dense comble les trous
  const shown = useHomeTabs();
  const wide = useWideTiles();

  return (
    <>
    <SpaceChoice />
    <section className="grid auto-rows-[minmax(8rem,auto)] grid-flow-dense grid-cols-2 gap-3 sm:grid-cols-3">
      {shown.map((t, i) => {
        const Component = TILES[t.to];
        return (
          <div key={t.to} className="contents" style={{ "--delay": `${i * 60}ms` } as CSSProperties}>
            <Component wide={wide.has(t.to)} />
          </div>
        );
      })}
      <div className="contents" style={{ "--delay": `${shown.length * 60}ms` } as CSSProperties}>
        <Tile to="/profil" icon="⚙️" label="Réglages" className="bg-rose">
          <Label>Réglages</Label>
          <p className="mt-2 text-sm font-bold text-ink/60">Menu, pages, mot de passe</p>
        </Tile>
      </div>
    </section>
    </>
  );
}

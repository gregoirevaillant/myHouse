import type { CSSProperties, ReactNode } from "react";
import { Label, Tile } from "../components/home/Tile";
import { BudgetTile, CaloriesTile, CardsTile, ExpensesTile, InfosTile, JournalTile, MealsTile, RecipesTile, RestosTile, ShoppingTile } from "../components/home/tiles";
import { useHomeTabs, useWideTiles } from "../lib/tabs";

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
};

export function Home() {
  // pages affichées, dans l'ordre choisi (Réglages → Menu) ; grid-flow-dense comble les trous
  const shown = useHomeTabs();
  const wide = useWideTiles();

  return (
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
  );
}

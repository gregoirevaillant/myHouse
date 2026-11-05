import { useQuery } from "@tanstack/react-query";
import { api, type Recipe, type RecipeCategory } from "./api";

export const RECIPE_CATEGORIES: { id: RecipeCategory; label: string; emoji: string; color: string }[] = [
  { id: "PLAT", label: "Plats", emoji: "🍲", color: "bg-peach" },
  { id: "ENTREE", label: "Entrées", emoji: "🥗", color: "bg-mint" },
  { id: "DESSERT", label: "Desserts", emoji: "🍰", color: "bg-rose" },
  { id: "APERO", label: "Apéro", emoji: "🧀", color: "bg-lemon" },
  { id: "PETIT_DEJ", label: "Petit-déj", emoji: "🥐", color: "bg-sky" },
  { id: "AUTRE", label: "Autre", emoji: "🍴", color: "bg-lavender" },
];
export const recipeCategory = (id: RecipeCategory) => RECIPE_CATEGORIES.find((c) => c.id === id) ?? RECIPE_CATEGORIES[RECIPE_CATEGORIES.length - 1];

// par défaut seulement les recettes partagées ; withPrivate ajoute mes aliments privés (suivi des calories)
export function useRecipes(enabled = true, withPrivate = false) {
  return useQuery({
    queryKey: ["recipes"],
    queryFn: () => api<Recipe[]>("/recipes"),
    select: (list) => (withPrivate ? list : list.filter((r) => !r.private)),
    enabled,
  });
}

// « 250 kcal / 100 g » ou « 180 kcal / portion »
export const caloriesLabel = (r: Pick<Recipe, "calories" | "per100g">) => (r.calories ? `${r.calories} kcal / ${r.per100g ? "100 g" : "portion"}` : "");

export const recipeImage = (r: Pick<Recipe, "id">) => `/api/recipes/${r.id}/image`;

// une ligne = un ingrédient ou une étape ; puces et numéros collés depuis un site sont retirés
export const lines = (text: string) =>
  text
    .split("\n")
    .map((l) => l.replace(/^\s*(?:[-–•*]|\d+[.)])\s*/, "").trim())
    .filter(Boolean);

export function formatMinutes(minutes: number) {
  if (minutes < 60) return `${minutes} min`;
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return m ? `${h} h ${String(m).padStart(2, "0")}` : `${h} h`;
}

// « ⏱ 45 min · 👥 4 »
export const recipeMeta = (r: Recipe) =>
  [r.minutes && `⏱ ${formatMinutes(r.minutes)}`, r.servings && `👥 ${r.servings}`, r.calories && `🔥 ${r.calories} kcal${r.per100g ? " / 100 g" : ""}`].filter(Boolean).join(" · ");

// aliment composé (ex. petit-déjeuner) : une ligne d'ingrédients = « 40 g Pain · 250 kcal/100 g »
export type FoodPart = { name: string; grams: number; per100: number };
export const partKcal = (p: FoodPart) => Math.round((p.per100 * p.grams) / 100);
export const partsKcal = (parts: FoodPart[]) => parts.reduce((s, p) => s + partKcal(p), 0);
export const partsToText = (parts: FoodPart[]) => parts.map((p) => `${p.grams} g ${p.name} · ${p.per100} kcal/100 g`).join("\n");
export function textToParts(text: string): FoodPart[] {
  return text.split("\n").flatMap((l) => {
    const m = l.match(/^(\d+(?:\.\d+)?) g (.+) · (\d+) kcal\/100 g$/);
    return m ? [{ grams: Number(m[1]), name: m[2], per100: Number(m[3]) }] : [];
  });
}

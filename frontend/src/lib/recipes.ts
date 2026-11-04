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

export function useRecipes(enabled = true) {
  return useQuery({ queryKey: ["recipes"], queryFn: () => api<Recipe[]>("/recipes"), enabled });
}

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
  [r.minutes && `⏱ ${formatMinutes(r.minutes)}`, r.servings && `👥 ${r.servings}`, r.calories && `🔥 ${r.calories} kcal`].filter(Boolean).join(" · ");

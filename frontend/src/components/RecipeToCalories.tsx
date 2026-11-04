import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { api, type CalorieEntry, type CalorieEntryInput, type CalorieMeal, type Recipe } from "../lib/api";
import { mealNow } from "../lib/calories";
import { MealPicker } from "./MealPicker";
import { toIso } from "../lib/dates";

// ajoute une recette (en portions) au suivi des calories d'aujourd'hui
export function RecipeToCalories({ recipe, onDone }: { recipe: Recipe; onDone: () => void }) {
  const [meal, setMeal] = useState<CalorieMeal>(mealNow());
  const [portions, setPortions] = useState("1");
  const count = Number(portions.replace(",", "."));
  // recette sans calories connues : on les saisit ici (pour ce repas seulement)
  const [perPortion, setPerPortion] = useState(recipe.calories?.toString() ?? "");
  const total = Math.round(Number(perPortion) * count);
  const valid = count > 0 && count <= 20 && total >= 1;

  const add = useMutation({
    mutationFn: () => {
      const body: CalorieEntryInput = {
        date: toIso(new Date()),
        meal,
        label: count === 1 ? recipe.name : `${recipe.name} × ${portions.replace(",", ".")}`,
        kcal: total,
      };
      return api<CalorieEntry>("/calories", { method: "POST", json: body });
    },
  });

  if (add.isSuccess) {
    return (
      <p className="rounded-2xl bg-mint px-3 py-2.5 text-center text-sm font-bold">
        ✓ {total} kcal ajoutées aujourd'hui ·{" "}
        <Link to="/calories" className="underline">
          voir
        </Link>{" "}
        ·{" "}
        <button className="underline" onClick={onDone}>
          fermer
        </button>
      </p>
    );
  }

  return (
    <div className="space-y-3 rounded-3xl bg-peach-soft p-4">
      <p className="font-extrabold">🔥 Ajouter à mon suivi</p>
      <MealPicker value={meal} onChange={setMeal} />
      {!recipe.calories && (
        <div>
          <label className="label" htmlFor="per-portion">Calories par portion (kcal)</label>
          <input id="per-portion" className="input focus:border-peach" inputMode="numeric" pattern="[0-9]*" placeholder="450" value={perPortion} onChange={(e) => setPerPortion(e.target.value.replace(/\D/g, ""))} />
        </div>
      )}
      <div className="flex items-end gap-3">
        <div className="flex-1">
          <label className="label" htmlFor="portions">Portions mangées</label>
          <input id="portions" className="input focus:border-peach" inputMode="decimal" value={portions} onChange={(e) => setPortions(e.target.value)} />
        </div>
        <p className="pb-3 text-lg font-extrabold">{total} kcal</p>
      </div>
      {add.error && <p className="text-sm font-bold text-rose-deep">{add.error.message}</p>}
      <button className="btn-primary w-full" disabled={!valid || add.isPending} onClick={() => add.mutate()}>
        Ajouter
      </button>
    </div>
  );
}

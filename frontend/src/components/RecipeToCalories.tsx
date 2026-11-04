import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { api, type CalorieEntry, type CalorieEntryInput, type CalorieMeal, type Recipe } from "../lib/api";
import { MEALS, mealNow } from "../lib/calories";
import { toIso } from "../lib/dates";

// ajoute une recette (en portions) au suivi des calories d'aujourd'hui
export function RecipeToCalories({ recipe, kcal, onDone }: { recipe: Recipe; kcal: number; onDone: () => void }) {
  const [meal, setMeal] = useState<CalorieMeal>(mealNow());
  const [portions, setPortions] = useState("1");
  const count = Number(portions.replace(",", "."));
  const valid = count > 0 && count <= 20;
  const total = Math.round(kcal * (valid ? count : 0));

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
      <div className="flex flex-wrap gap-1.5">
        {MEALS.map((m) => (
          <button
            key={m.id}
            type="button"
            onClick={() => setMeal(m.id)}
            className={`rounded-full px-3 py-1.5 text-sm font-bold shadow-soft transition active:scale-95 ${meal === m.id ? "bg-peach" : "bg-white text-ink-soft"}`}
          >
            {m.icon} {m.label}
          </button>
        ))}
      </div>
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

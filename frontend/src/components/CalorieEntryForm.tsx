import { useCallback, useState, type FormEvent } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { api, type CalorieEntry, type CalorieEntryInput, type CalorieMeal } from "../lib/api";
import { mealNow } from "../lib/calories";
import { useRecipes } from "../lib/recipes";
import { BarcodeScanner } from "./BarcodeScanner";
import { MealPicker } from "./MealPicker";

export function CalorieEntryForm({ entry, meal: initialMeal, date, onDone }: { entry?: CalorieEntry; meal?: CalorieMeal; date: string; onDone: () => void }) {
  const qc = useQueryClient();
  const { data: recipes = [] } = useRecipes();
  const [meal, setMeal] = useState<CalorieMeal>(entry?.meal ?? initialMeal ?? mealNow());
  const [label, setLabel] = useState(entry?.label ?? "");
  const [kcal, setKcal] = useState(entry?.kcal.toString() ?? "");
  const [confirmDelete, setConfirmDelete] = useState(false);
  // produit scanné (kcal / 100 g) ou recette (kcal / portion) : la quantité mangée recalcule le total
  const [scanning, setScanning] = useState(false);
  const [scanError, setScanError] = useState("");
  const [base, setBase] = useState<{ kcal: number; unit: "g" | "portion" } | null>(null);
  const [qty, setQty] = useState("100");
  const value = Number(kcal);
  const onQty = (q: string, b = base) => {
    setQty(q);
    if (b) setKcal(String(Math.round((b.kcal * Number(q.replace(",", "."))) / (b.unit === "g" ? 100 : 1))));
  };
  const onCode = useCallback((code: string) => {
    setScanning(false);
    setScanError("");
    api<{ name: string; kcalPer100g: number }>(`/calories/product/${code}`)
      .then((p) => {
        setLabel(p.name);
        setBase({ kcal: p.kcalPer100g, unit: "g" });
        setQty("100");
        setKcal(String(p.kcalPer100g));
      })
      .catch((e: Error) => setScanError(e.message));
  }, []);
  const done = () => {
    qc.invalidateQueries({ queryKey: ["calories"] });
    onDone();
  };

  const save = useMutation({
    mutationFn: () => {
      const body: CalorieEntryInput = { date: entry?.date ?? date, meal, label: label.trim(), kcal: value };
      return api<CalorieEntry>(entry ? `/calories/${entry.id}` : "/calories", { method: entry ? "PATCH" : "POST", json: body });
    },
    onSuccess: done,
  });
  const remove = useMutation({ mutationFn: () => api(`/calories/${entry!.id}`, { method: "DELETE" }), onSuccess: done });

  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (label.trim() && value > 0) save.mutate();
  };

  return (
    <form onSubmit={submit} className="space-y-4">
      <MealPicker value={meal} onChange={setMeal} />

      {!entry &&
        (scanning ? (
          <BarcodeScanner onCode={onCode} onClose={() => setScanning(false)} />
        ) : (
          <button type="button" className="btn-ghost w-full" onClick={() => setScanning(true)}>
            📷 Scanner un produit
          </button>
        ))}
      {scanError && <p className="text-sm font-bold text-rose-deep">{scanError}</p>}

      {!entry && recipes.length > 0 && (
        <div>
          <label className="label" htmlFor="cal-recipe">Depuis une recette</label>
          <select
            id="cal-recipe"
            className="input focus:border-peach"
            value=""
            onChange={(e) => {
              const r = recipes.find((x) => x.id === e.target.value);
              if (!r) return;
              setLabel(r.name);
              if (r.calories) {
                const b = { kcal: r.calories, unit: "portion" as const };
                setBase(b);
                onQty("1", b);
              } else {
                setBase(null);
                setKcal("");
              }
            }}
          >
            <option value="">Choisir une recette…</option>
            {recipes.map((r) => (
              <option key={r.id} value={r.id}>
                {r.name}{r.calories ? ` · ${r.calories} kcal / portion` : ""}
              </option>
            ))}
          </select>
        </div>
      )}

      <div>
        <label className="label" htmlFor="cal-label">Quoi ?</label>
        <input id="cal-label" className="input focus:border-peach" placeholder="Pâtes bolo, yaourt, pomme…" value={label} onChange={(e) => setLabel(e.target.value)} required />
      </div>
      {base && (
        <div>
          <label className="label" htmlFor="cal-qty">
            {base.unit === "g" ? `Quantité mangée (g) · ${base.kcal} kcal / 100 g` : `Portions mangées · ${base.kcal} kcal / portion`}
          </label>
          <input id="cal-qty" className="input focus:border-peach" inputMode="decimal" value={qty} onChange={(e) => onQty(e.target.value)} />
        </div>
      )}
      <div>
        <label className="label" htmlFor="cal-kcal">Calories (kcal)</label>
        <input id="cal-kcal" className="input focus:border-peach" inputMode="numeric" pattern="[0-9]*" placeholder="450" value={kcal} onChange={(e) => setKcal(e.target.value.replace(/\D/g, ""))} required />
      </div>

      {save.error && <p className="text-sm font-bold text-rose-deep">{save.error.message}</p>}
      <button className="btn-primary w-full" disabled={save.isPending || !label.trim() || !(value > 0)}>
        {entry ? "Enregistrer" : "Ajouter"}
      </button>

      {entry && (
        <div className="text-center">
          {confirmDelete ? (
            <div className="flex justify-center gap-2">
              <button type="button" className="btn-ghost" onClick={() => setConfirmDelete(false)}>Annuler</button>
              <button type="button" className="btn bg-rose-deep text-white" onClick={() => remove.mutate()} disabled={remove.isPending}>Supprimer</button>
            </div>
          ) : (
            <button type="button" className="text-sm font-bold text-ink-soft" onClick={() => setConfirmDelete(true)}>Supprimer</button>
          )}
        </div>
      )}
    </form>
  );
}

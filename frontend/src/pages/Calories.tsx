import { useCallback, useState, type FormEvent } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { BarcodeScanner } from "../components/BarcodeScanner";
import { MealPicker } from "../components/MealPicker";
import { Modal } from "../components/Modal";
import { api, type CalorieEntry, type CalorieEntryInput, type CalorieMeal } from "../lib/api";
import { useMe, useUpdatePreferences } from "../lib/auth";
import { MEALS, mealNow, totalKcal, useCalorieEntries } from "../lib/calories";
import { addDays, dayName, fromIso, shortDate, toIso } from "../lib/dates";
import { useRecipes } from "../lib/recipes";

type Opened = { entry?: CalorieEntry; meal?: CalorieMeal } | null;

export function Calories() {
  const { data: me } = useMe();
  const today = toIso(new Date());
  const [date, setDate] = useState(today);
  const [opened, setOpened] = useState<Opened>(null);
  const [goalOpen, setGoalOpen] = useState(false);
  // 7 jours se terminant à la date affichée, pour la petite courbe de la semaine
  const from = addDays(date, -6);
  const { data: entries = [], isLoading } = useCalorieEntries(from, date);
  const day = entries.filter((e) => e.date === date);
  const total = totalKcal(day);
  const goal = me?.calorieGoal ?? null;
  const left = goal !== null ? goal - total : null;
  const week = Array.from({ length: 7 }, (_, i) => {
    const d = addDays(from, i);
    return { date: d, kcal: totalKcal(entries.filter((e) => e.date === d)) };
  });
  const weekMax = Math.max(goal ?? 0, ...week.map((w) => w.kcal), 1);

  return (
    <section>
      <div className="mb-4 flex items-center justify-between">
        <h2 className="flex items-center gap-2 text-lg font-extrabold">
          <span className="rounded-xl bg-peach px-2 py-1">🔥</span> Calories
        </h2>
        <button className="btn bg-peach px-4 py-2 shadow-soft" onClick={() => setOpened({ meal: mealNow() })}>
          + Ajouter
        </button>
      </div>

      <div className="mb-4 flex items-center justify-between rounded-2xl bg-white px-2 py-1.5 shadow-soft">
        <button className="px-3 py-1 text-lg font-bold" aria-label="Jour précédent" onClick={() => setDate(addDays(date, -1))}>◀</button>
        <button className="text-center font-extrabold" onClick={() => setDate(today)}>
          {date === today ? "Aujourd'hui" : <span className="capitalize">{dayName(date)}</span>}
          <span className="block text-xs font-semibold text-ink-soft">{shortDate(date)}</span>
        </button>
        <button className="px-3 py-1 text-lg font-bold disabled:opacity-30" aria-label="Jour suivant" disabled={date >= today} onClick={() => setDate(addDays(date, 1))}>▶</button>
      </div>

      <div className="mb-4 rounded-3xl bg-peach-soft p-4">
        <div className="flex items-baseline justify-between">
          <p className="text-3xl font-extrabold">
            {total} <span className="text-base text-ink-soft">kcal</span>
          </p>
          <button className="text-sm font-bold text-ink-soft underline" onClick={() => setGoalOpen(true)}>
            {goal ? `objectif ${goal}` : "Fixer un objectif"}
          </button>
        </div>
        {goal !== null && left !== null && (
          <>
            <div className="mt-3 h-3 overflow-hidden rounded-full bg-white">
              <div className={`h-full rounded-full ${left < 0 ? "bg-rose-deep" : "bg-peach-deep"}`} style={{ width: `${Math.min(100, (total / goal) * 100)}%` }} />
            </div>
            <p className={`mt-1.5 text-sm font-bold ${left < 0 ? "text-rose-deep" : "text-ink-soft"}`}>
              {left >= 0 ? `Il reste ${left} kcal` : `${-left} kcal au-dessus de l'objectif`}
            </p>
          </>
        )}
        <div className="mt-4 flex h-16 items-end gap-1.5" aria-label="7 derniers jours">
          {week.map((w) => (
            <button key={w.date} onClick={() => setDate(w.date)} className="flex h-full flex-1 flex-col items-center justify-end gap-1" aria-label={`${shortDate(w.date)} : ${w.kcal} kcal`}>
              <span className={`w-full rounded-t-lg ${w.date === date ? "bg-peach-deep" : "bg-peach"}`} style={{ height: `${Math.max(4, (w.kcal / weekMax) * 100)}%` }} />
              <span className="text-[10px] font-bold text-ink-soft">{fromIso(w.date).toLocaleDateString("fr-FR", { weekday: "narrow" })}</span>
            </button>
          ))}
        </div>
      </div>

      {isLoading ? (
        <p className="text-center text-ink-soft">Chargement…</p>
      ) : (
        <div className="space-y-3">
          {MEALS.map((m) => {
            const list = day.filter((e) => e.meal === m.id);
            return (
              <div key={m.id} className="rounded-3xl bg-white p-3 shadow-soft">
                <div className="mb-1 flex items-center justify-between">
                  <p className="font-extrabold">
                    {m.icon} {m.label}
                  </p>
                  <span className="text-sm font-bold text-ink-soft">{list.length ? `${totalKcal(list)} kcal` : ""}</span>
                </div>
                {list.map((e) => (
                  <button key={e.id} onClick={() => setOpened({ entry: e })} className="flex w-full items-center justify-between gap-3 rounded-xl px-1 py-2 text-left font-semibold active:bg-peach-soft">
                    <span className="min-w-0 truncate">{e.label}</span>
                    <span className="shrink-0 text-sm text-ink-soft">{e.kcal} kcal</span>
                  </button>
                ))}
                <button className="mt-1 text-sm font-bold text-ink-soft" onClick={() => setOpened({ meal: m.id })}>
                  + Ajouter
                </button>
              </div>
            );
          })}
        </div>
      )}

      {opened && (
        <Modal title={opened.entry ? "Modifier" : "Ajouter un repas"} onClose={() => setOpened(null)}>
          <EntryForm entry={opened.entry} meal={opened.meal} date={date} onDone={() => setOpened(null)} />
        </Modal>
      )}
      {goalOpen && (
        <Modal title="Objectif quotidien" onClose={() => setGoalOpen(false)}>
          <GoalForm goal={goal} onDone={() => setGoalOpen(false)} />
        </Modal>
      )}
    </section>
  );
}

function EntryForm({ entry, meal: initialMeal, date, onDone }: { entry?: CalorieEntry; meal?: CalorieMeal; date: string; onDone: () => void }) {
  const qc = useQueryClient();
  const { data: recipes = [] } = useRecipes();
  const withCalories = recipes.filter((r) => r.calories);
  const [meal, setMeal] = useState<CalorieMeal>(entry?.meal ?? initialMeal ?? mealNow());
  const [label, setLabel] = useState(entry?.label ?? "");
  const [kcal, setKcal] = useState(entry?.kcal.toString() ?? "");
  const [confirmDelete, setConfirmDelete] = useState(false);
  // produit scanné : kcal pour 100 g, la quantité mangée recalcule le total
  const [scanning, setScanning] = useState(false);
  const [scanError, setScanError] = useState("");
  const [per100, setPer100] = useState<number | null>(null);
  const [grams, setGrams] = useState("100");
  const value = Number(kcal);
  const onGrams = (g: string) => {
    setGrams(g);
    if (per100 !== null) setKcal(String(Math.round((per100 * Number(g)) / 100)));
  };
  const onCode = useCallback((code: string) => {
    setScanning(false);
    setScanError("");
    api<{ name: string; kcalPer100g: number }>(`/calories/product/${code}`)
      .then((p) => {
        setLabel(p.name);
        setPer100(p.kcalPer100g);
        setGrams("100");
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

      {!entry && withCalories.length > 0 && (
        <div>
          <label className="label" htmlFor="cal-recipe">Depuis une recette</label>
          <select
            id="cal-recipe"
            className="input focus:border-peach"
            value=""
            onChange={(e) => {
              const r = recipes.find((x) => x.id === e.target.value);
              if (r?.calories) {
                setLabel(r.name);
                setKcal(String(r.calories));
              }
            }}
          >
            <option value="">Choisir… (par portion)</option>
            {withCalories.map((r) => (
              <option key={r.id} value={r.id}>
                {r.name} · {r.calories} kcal
              </option>
            ))}
          </select>
        </div>
      )}

      <div>
        <label className="label" htmlFor="cal-label">Quoi ?</label>
        <input id="cal-label" className="input focus:border-peach" placeholder="Pâtes bolo, yaourt, pomme…" value={label} onChange={(e) => setLabel(e.target.value)} required />
      </div>
      {per100 !== null && (
        <div>
          <label className="label" htmlFor="cal-grams">Quantité mangée (g) · {per100} kcal / 100 g</label>
          <input id="cal-grams" className="input focus:border-peach" inputMode="numeric" pattern="[0-9]*" value={grams} onChange={(e) => onGrams(e.target.value.replace(/\D/g, ""))} />
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

function GoalForm({ goal, onDone }: { goal: number | null; onDone: () => void }) {
  const update = useUpdatePreferences();
  const [value, setValue] = useState(goal?.toString() ?? "");
  const n = Number(value);
  const valid = n >= 500 && n <= 10000;

  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (valid) update.mutate({ calorieGoal: n }, { onSuccess: onDone });
  };

  return (
    <form onSubmit={submit} className="space-y-4">
      <div>
        <label className="label" htmlFor="cal-goal">Calories par jour (kcal)</label>
        <input id="cal-goal" className="input focus:border-peach" inputMode="numeric" pattern="[0-9]*" placeholder="2000" value={value} onChange={(e) => setValue(e.target.value.replace(/\D/g, ""))} />
        {value && !valid && <p className="mt-1 text-sm font-bold text-rose-deep">Entre une valeur entre 500 et 10 000</p>}
      </div>
      <button className="btn-primary w-full" disabled={!valid || update.isPending}>Enregistrer</button>
      {goal !== null && (
        <button type="button" className="w-full text-sm font-bold text-ink-soft" onClick={() => update.mutate({ calorieGoal: null }, { onSuccess: onDone })}>
          Retirer l'objectif
        </button>
      )}
    </form>
  );
}

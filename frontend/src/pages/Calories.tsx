import { useState, type FormEvent } from "react";
import { Link } from "react-router-dom";
import { CalorieEntryForm } from "../components/CalorieEntryForm";
import { Modal } from "../components/Modal";
import type { CalorieEntry, CalorieMeal } from "../lib/api";
import { useMe, useUpdatePreferences } from "../lib/auth";
import { MEALS, mealNow, totalKcal, useCalorieEntries } from "../lib/calories";
import { addDays, dayName, fromIso, shortDate, toIso } from "../lib/dates";

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
        <div className="flex gap-2">
          <Link to="/calories/recettes" className="btn bg-white px-4 py-2 shadow-soft">
            🍲 Mes recettes
          </Link>
          <button className="btn bg-peach px-4 py-2 shadow-soft" onClick={() => setOpened({ meal: mealNow() })}>
            + Ajouter
          </button>
        </div>
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
          <CalorieEntryForm entry={opened.entry} meal={opened.meal} date={date} onDone={() => setOpened(null)} />
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

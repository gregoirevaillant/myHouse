import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { api, type MealSlot } from "../lib/api";
import { addDays, dayName, shortDate, toIso } from "../lib/dates";

// Choix d'un jour et d'un repas (7 prochains jours) pour y inscrire un resto ou une recette
export function PlanMeal({ title, text, restaurantId, onDone }: { title: string; text: string; restaurantId?: string; onDone: () => void }) {
  const today = toIso(new Date());
  const days = Array.from({ length: 7 }, (_, i) => addDays(today, i));
  const [date, setDate] = useState(today);
  const [slot, setSlot] = useState<MealSlot>(new Date().getHours() < 14 ? "LUNCH" : "DINNER");
  const qc = useQueryClient();
  const plan = useMutation({
    mutationFn: ({ date, slot }: { date: string; slot: MealSlot }) => api("/meals", { method: "PUT", json: { date, slot, text, restaurantId } }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["meals"] }),
  });

  if (plan.isSuccess) {
    return (
      <div className="rounded-3xl bg-mint-soft p-4 text-center">
        <p className="font-extrabold">C'est noté ✓</p>
        <p className="text-sm font-semibold text-ink-soft">
          {dayName(date)} {slot === "LUNCH" ? "midi" : "soir"} : {title}
        </p>
        <div className="mt-3 flex justify-center gap-2">
          <Link to="/repas" className="btn-ghost px-4 py-2 text-sm">
            Voir les repas
          </Link>
          <button className="btn-ghost px-4 py-2 text-sm" onClick={onDone}>
            OK
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="rounded-3xl bg-white p-4 shadow-soft">
      <p className="mb-2 font-extrabold">📅 Prévoir</p>
      <div className="-mx-1 flex gap-1.5 overflow-x-auto px-1 pb-1">
        {days.map((d, i) => (
          <button
            key={d}
            onClick={() => setDate(d)}
            className={`shrink-0 rounded-2xl px-3 py-2 text-sm font-bold capitalize ${date === d ? "bg-peach" : "bg-cream text-ink-soft"}`}
          >
            {i === 0 ? "Aujourd'hui" : i === 1 ? "Demain" : dayName(d).slice(0, 3) + ". " + shortDate(d).split(" ")[0]}
          </button>
        ))}
      </div>
      <div className="mt-2 grid grid-cols-2 gap-2">
        {(["LUNCH", "DINNER"] as const).map((s) => (
          <button key={s} onClick={() => setSlot(s)} className={`rounded-2xl py-2 text-sm font-bold ${slot === s ? "bg-peach" : "bg-cream text-ink-soft"}`}>
            {s === "LUNCH" ? "☀️ Midi" : "🌙 Soir"}
          </button>
        ))}
      </div>
      {plan.error && <p className="mt-2 text-sm font-semibold text-rose-deep">{plan.error.message}</p>}
      <div className="mt-3 flex gap-2">
        <button className="btn-ghost flex-1 py-2" onClick={onDone}>
          Annuler
        </button>
        <button className="btn flex-1 bg-peach-deep py-2 text-white shadow-soft" disabled={plan.isPending} onClick={() => plan.mutate({ date, slot })}>
          Prévoir
        </button>
      </div>
      <p className="mt-2 text-center text-xs text-ink-soft">Remplace ce qui était prévu pour ce repas.</p>
    </div>
  );
}

import { MEALS } from "../lib/calories";
import type { CalorieMeal } from "../lib/api";

export function MealPicker({ value, onChange }: { value: CalorieMeal; onChange: (meal: CalorieMeal) => void }) {
  return (
    <div className="flex flex-wrap gap-1.5">
      {MEALS.map((m) => (
        <button
          key={m.id}
          type="button"
          onClick={() => onChange(m.id)}
          className={`rounded-full px-3 py-1.5 text-sm font-bold shadow-soft transition active:scale-95 ${value === m.id ? "bg-peach" : "bg-white text-ink-soft"}`}
        >
          {m.icon} {m.label}
        </button>
      ))}
    </div>
  );
}

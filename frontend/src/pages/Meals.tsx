import { useEffect, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { api, type Meal, type MealSlot } from "../lib/api";
import { addDays, dayName, mondayOf, shortDate, toIso } from "../lib/dates";

const DAY_COLORS = ["bg-lavender-soft", "bg-rose-soft", "bg-peach-soft", "bg-mint-soft", "bg-sky-soft", "bg-lemon-soft", "bg-rose-soft"];

export function Meals() {
  const [week, setWeek] = useState(() => mondayOf(new Date()));
  const today = toIso(new Date());
  const { data: meals = [] } = useQuery({
    queryKey: ["meals", week],
    queryFn: () => api<Meal[]>(`/meals?week=${week}`),
  });

  const meal = (date: string, slot: MealSlot) => meals.find((m) => m.date === date && m.slot === slot);
  const days = Array.from({ length: 7 }, (_, i) => addDays(week, i));
  const isCurrentWeek = week === mondayOf(new Date());

  return (
    <section>
      <h2 className="mb-4 flex items-center gap-2 text-lg font-extrabold">
        <span className="rounded-xl bg-peach px-2 py-1">🍽️</span> Repas de la semaine
      </h2>

      <div className="mb-5 flex items-center justify-between rounded-2xl bg-white p-2 shadow-soft">
        <button className="btn px-4 py-2 hover:bg-peach-soft" onClick={() => setWeek(addDays(week, -7))} aria-label="Semaine précédente">
          ◀
        </button>
        <button className="text-center" onClick={() => setWeek(mondayOf(new Date()))}>
          <p className="font-extrabold">
            {shortDate(week)} – {shortDate(addDays(week, 6))}
          </p>
          <p className="text-xs font-semibold text-ink-soft">{isCurrentWeek ? "Cette semaine" : "Revenir à cette semaine"}</p>
        </button>
        <button className="btn px-4 py-2 hover:bg-peach-soft" onClick={() => setWeek(addDays(week, 7))} aria-label="Semaine suivante">
          ▶
        </button>
      </div>

      <div className="space-y-3">
        {days.map((date, i) => (
          <div key={date} className={`rounded-3xl p-4 ${DAY_COLORS[i]} ${date === today ? "ring-2 ring-peach-deep/50" : ""}`}>
            <p className="mb-2 font-extrabold capitalize">
              {dayName(date)} <span className="font-semibold text-ink-soft">· {shortDate(date)}</span>
              {date === today && <span className="ml-2 rounded-full bg-white px-2 py-0.5 text-xs text-peach-deep">aujourd'hui</span>}
            </p>
            <div className="grid gap-2 sm:grid-cols-2">
              <MealField date={date} slot="LUNCH" serverText={meal(date, "LUNCH")?.text ?? ""} restaurantId={meal(date, "LUNCH")?.restaurantId} />
              <MealField date={date} slot="DINNER" serverText={meal(date, "DINNER")?.text ?? ""} restaurantId={meal(date, "DINNER")?.restaurantId} />
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}

function MealField({ date, slot, serverText, restaurantId }: { date: string; slot: MealSlot; serverText: string; restaurantId?: string | null }) {
  const [value, setValue] = useState(serverText);
  const [status, setStatus] = useState<"idle" | "saving" | "saved" | "error">("idle");
  const focused = useRef(false);
  const timer = useRef<number>(undefined);

  // synchronise avec les modifs de l'autre personne, sauf pendant la saisie
  useEffect(() => {
    if (!focused.current && timer.current === undefined) setValue(serverText);
  }, [serverText]);

  const save = async (text: string) => {
    timer.current = undefined;
    setStatus("saving");
    try {
      await api("/meals", { method: "PUT", json: { date, slot, text } });
      setStatus("saved");
    } catch {
      setStatus("error");
    }
  };

  const onChange = (text: string) => {
    setValue(text);
    window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => save(text), 600);
  };

  return (
    <label className="block rounded-2xl bg-white/80 px-3 py-2">
      <span className="flex items-center justify-between text-xs font-bold text-ink-soft">
        {slot === "LUNCH" ? "☀️ Midi" : "🌙 Soir"}
        <span className="font-semibold">
          {/* repas prévu depuis un resto : modifier le texte défait le lien */}
          {restaurantId && status === "idle" && (
            <Link to="/restos" className="rounded-full bg-peach px-2 py-0.5 text-peach-deep" onClick={(e) => e.stopPropagation()}>
              🍜 voir les restos
            </Link>
          )}
          {status === "saving" && "…"}
          {status === "saved" && "✓"}
          {status === "error" && <span className="text-rose-deep">erreur</span>}
        </span>
      </span>
      <textarea
        rows={1}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onFocus={() => (focused.current = true)}
        onBlur={() => (focused.current = false)}
        placeholder="Qu'est-ce qu'on mange ?"
        className="mt-1 w-full resize-none bg-transparent font-semibold outline-none [field-sizing:content] placeholder:font-normal placeholder:text-ink-soft/60"
      />
    </label>
  );
}

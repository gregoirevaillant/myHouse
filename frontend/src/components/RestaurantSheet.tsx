import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { api, type MealSlot, type Restaurant } from "../lib/api";
import { addDays, dayName, shortDate, toIso } from "../lib/dates";
import { appleMapsUrl, cuisineInfo, directionsUrl, districtLabel, priceLabel, shareText, useAddVisit, usePlanMeal } from "../lib/restaurants";
import { Stars } from "./Stars";

export function RestaurantSheet({ restaurant: r, onEdit }: { restaurant: Restaurant; onEdit: () => void }) {
  const qc = useQueryClient();
  const today = toIso(new Date());
  const [visitDate, setVisitDate] = useState(today);
  const [planning, setPlanning] = useState(false);
  const addVisit = useAddVisit();
  const removeVisit = useMutation({
    mutationFn: (date: string) => api(`/restaurants/${r.id}/visits/${date}`, { method: "DELETE" }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["restaurants"] }),
  });
  const cuisine = cuisineInfo(r.cuisine);
  const [copied, setCopied] = useState(false);

  // feuille de partage de l'iPhone (Messages, WhatsApp…) ; sinon copie du texte
  const share = async () => {
    const text = shareText(r);
    const url = appleMapsUrl(r);
    if (navigator.share) {
      try {
        await navigator.share({ title: r.name, text, url });
      } catch {
        // partage annulé
      }
      return;
    }
    await navigator.clipboard.writeText(`${text}\n${url}`);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  return (
    <div className="space-y-4">
      <div className="flex items-start gap-3">
        <span className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl bg-peach text-3xl">{cuisine.emoji}</span>
        <div className="min-w-0 flex-1">
          <p className="font-bold text-ink-soft">
            {cuisine.label} · {districtLabel(r)} {r.price ? `· ${priceLabel(r.price)}` : ""}
          </p>
          <Stars value={r.rating} />
          <p className="mt-0.5 text-sm font-semibold text-ink-soft">
            {r.wishlist ? "✨ À tester" : `${r.visits.length} visite${r.visits.length > 1 ? "s" : ""}`}
          </p>
        </div>
        <button className="btn-ghost shrink-0 px-3 py-2 text-sm" onClick={onEdit}>
          ✏️ Modifier
        </button>
      </div>

      {r.address && <p className="text-sm font-semibold">📍 {r.address}</p>}

      <div className="grid grid-cols-4 gap-2">
        <a href={directionsUrl(r)} target="_blank" rel="noreferrer" className="btn-ghost flex-col gap-0.5 px-2 py-2 text-xs">
          <span className="text-xl">🧭</span> Itinéraire
        </a>
        {r.url ? (
          <a href={r.url} target="_blank" rel="noreferrer" className="btn-ghost flex-col gap-0.5 px-2 py-2 text-xs">
            <span className="text-xl">🌐</span> {/instagram\.com/.test(r.url) ? "Instagram" : "Site"}
          </a>
        ) : (
          <span className="btn flex-col gap-0.5 bg-white/50 px-2 py-2 text-xs text-ink-soft/50">
            <span className="text-xl opacity-50">🌐</span> Pas de site
          </span>
        )}
        {r.phone ? (
          <a href={`tel:${r.phone.replace(/\s/g, "")}`} className="btn-ghost flex-col gap-0.5 px-2 py-2 text-xs">
            <span className="text-xl">📞</span> Appeler
          </a>
        ) : (
          <span className="btn flex-col gap-0.5 bg-white/50 px-2 py-2 text-xs text-ink-soft/50">
            <span className="text-xl opacity-50">📞</span> Pas de numéro
          </span>
        )}
        <button onClick={share} className="btn-ghost flex-col gap-0.5 px-2 py-2 text-xs">
          <span className="text-xl">📤</span> {copied ? "Copié ✓" : "Partager"}
        </button>
      </div>

      <div className="rounded-3xl bg-peach-soft p-4">
        <p className="mb-2 font-extrabold">🍴 On y est allés</p>
        <div className="flex gap-2">
          <input type="date" className="input py-2 focus:border-peach" value={visitDate} max={today} onChange={(e) => setVisitDate(e.target.value)} />
          <button
            className="btn shrink-0 bg-peach-deep px-4 text-white shadow-soft"
            disabled={!visitDate || addVisit.isPending}
            onClick={() => addVisit.mutate({ id: r.id, date: visitDate })}
          >
            {visitDate === today ? "Aujourd'hui" : "Ajouter"}
          </button>
        </div>
        {r.visits.length > 0 && (
          <ul className="mt-3 flex flex-wrap gap-1.5">
            {r.visits.map((d) => (
              <li key={d} className="flex items-center gap-1 rounded-full bg-white py-1 pl-3 pr-1 text-sm font-bold">
                {shortDate(d)} {d.slice(0, 4) !== today.slice(0, 4) && d.slice(0, 4)}
                <button
                  onClick={() => removeVisit.mutate(d)}
                  aria-label={`Retirer la visite du ${shortDate(d)}`}
                  className="h-6 w-6 rounded-full text-xs text-ink-soft hover:bg-rose-soft"
                >
                  ✕
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>

      {planning ? (
        <PlanMeal restaurant={r} onDone={() => setPlanning(false)} />
      ) : (
        <button className="btn-ghost w-full" onClick={() => setPlanning(true)}>
          📅 Prévoir dans les repas
        </button>
      )}
    </div>
  );
}

export function PlanMeal({ restaurant, onDone }: { restaurant: Restaurant; onDone: () => void }) {
  const today = toIso(new Date());
  const days = Array.from({ length: 7 }, (_, i) => addDays(today, i));
  const [date, setDate] = useState(today);
  const [slot, setSlot] = useState<MealSlot>(new Date().getHours() < 14 ? "LUNCH" : "DINNER");
  const plan = usePlanMeal();

  if (plan.isSuccess) {
    return (
      <div className="rounded-3xl bg-mint-soft p-4 text-center">
        <p className="font-extrabold">C'est noté ✓</p>
        <p className="text-sm font-semibold text-ink-soft">
          {dayName(date)} {slot === "LUNCH" ? "midi" : "soir"} : {restaurant.name}
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
        <button className="btn flex-1 bg-peach-deep py-2 text-white shadow-soft" disabled={plan.isPending} onClick={() => plan.mutate({ restaurant, date, slot })}>
          Prévoir
        </button>
      </div>
      <p className="mt-2 text-center text-xs text-ink-soft">Remplace ce qui était prévu pour ce repas.</p>
    </div>
  );
}

import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { api, type Restaurant } from "../lib/api";
import { shortDate, toIso } from "../lib/dates";
import { useHasPage } from "../lib/tabs";
import { appleMapsUrl, cuisineInfo, directionsUrl, districtLabel, priceLabel, restaurantMealText, shareText, useAddVisit } from "../lib/restaurants";
import { PlanMeal } from "./PlanMeal";
import { Stars } from "./Stars";

const ACTION = "btn-ghost min-w-0 flex-1 flex-col gap-0.5 whitespace-nowrap px-2 py-2 text-xs";

export function RestaurantSheet({ restaurant: r, onEdit }: { restaurant: Restaurant; onEdit: () => void }) {
  const hasMeals = useHasPage("repas");
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

      {/* seulement les actions disponibles, qui se partagent la largeur */}
      <div className="flex gap-2">
        <a href={directionsUrl(r)} target="_blank" rel="noreferrer" className={ACTION}>
          <span className="text-xl">🧭</span> Itinéraire
        </a>
        {r.url && (
          <a href={r.url} target="_blank" rel="noreferrer" className={ACTION}>
            <span className="text-xl">🌐</span> {/instagram\.com/.test(r.url) ? "Instagram" : "Site"}
          </a>
        )}
        {r.phone && (
          <a href={`tel:${r.phone.replace(/\s/g, "")}`} className={ACTION}>
            <span className="text-xl">📞</span> Appeler
          </a>
        )}
        <button onClick={share} className={ACTION}>
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

      {!hasMeals ? null : planning ? (
        <PlanMeal title={r.name} text={restaurantMealText(r)} restaurantId={r.id} onDone={() => setPlanning(false)} />
      ) : (
        <button className="btn-ghost w-full" onClick={() => setPlanning(true)}>
          📅 Prévoir dans les repas
        </button>
      )}
    </div>
  );
}

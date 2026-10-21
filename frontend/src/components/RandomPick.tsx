import { useState } from "react";
import type { Restaurant } from "../lib/api";
import { compareDistricts, cuisineInfo, districtLabel, priceLabel } from "../lib/restaurants";
import { PlanMeal } from "./RestaurantSheet";
import { Stars } from "./Stars";

type Status = "ALL" | "DONE" | "TODO";

export function RandomPick({ restaurants, onOpen }: { restaurants: Restaurant[]; onOpen: (r: Restaurant) => void }) {
  const [status, setStatus] = useState<Status>("ALL");
  const [cuisine, setCuisine] = useState("");
  const [district, setDistrict] = useState("");
  const [pick, setPick] = useState<Restaurant | null>(null);
  const [planning, setPlanning] = useState(false);

  const cuisines = [...new Set(restaurants.map((r) => r.cuisine))].map(cuisineInfo).sort((a, b) => a.label.localeCompare(b.label, "fr"));
  const districts = [...new Set(restaurants.map(districtLabel))].sort(compareDistricts);
  const pool = restaurants.filter(
    (r) =>
      (status === "ALL" || r.wishlist === (status === "TODO")) &&
      (!cuisine || r.cuisine === cuisine) &&
      (!district || districtLabel(r) === district),
  );

  const draw = () => {
    setPlanning(false);
    // évite de retomber sur le même quand il y a le choix
    const others = pool.length > 1 && pick ? pool.filter((r) => r.id !== pick.id) : pool;
    setPick(others[Math.floor(Math.random() * others.length)] ?? null);
  };

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-3 gap-1 rounded-2xl bg-white p-1 shadow-soft">
        {(
          [
            ["ALL", "Tous"],
            ["DONE", "Testés"],
            ["TODO", "À tester"],
          ] as const
        ).map(([s, label]) => (
          <button key={s} onClick={() => setStatus(s)} className={`rounded-xl py-2 text-sm font-bold ${status === s ? "bg-peach" : "text-ink-soft"}`}>
            {label}
          </button>
        ))}
      </div>
      <div className="grid grid-cols-2 gap-2">
        <select className="input py-2 focus:border-peach" value={cuisine} onChange={(e) => setCuisine(e.target.value)} aria-label="Cuisine">
          <option value="">Toutes cuisines</option>
          {cuisines.map((c) => (
            <option key={c.id} value={c.id}>
              {c.emoji} {c.label}
            </option>
          ))}
        </select>
        <select className="input py-2 focus:border-peach" value={district} onChange={(e) => setDistrict(e.target.value)} aria-label="Arrondissement">
          <option value="">Partout</option>
          {districts.map((d) => (
            <option key={d} value={d}>
              {d}
            </option>
          ))}
        </select>
      </div>

      {pick && pool.some((r) => r.id === pick.id) ? (
        <div className="rounded-3xl bg-peach p-5 text-center shadow-soft">
          <p className="text-5xl">{cuisineInfo(pick.cuisine).emoji}</p>
          <p className="mt-2 text-2xl font-extrabold">{pick.name}</p>
          <p className="font-bold text-ink/60">
            {cuisineInfo(pick.cuisine).label} · {districtLabel(pick)} {pick.price ? `· ${priceLabel(pick.price)}` : ""}
          </p>
          <div className="mt-1">{pick.wishlist ? <span className="font-bold">✨ À tester</span> : <Stars value={pick.rating} />}</div>
          <button className="mt-3 text-sm font-bold underline" onClick={() => onOpen(pick)}>
            Voir la fiche
          </button>
        </div>
      ) : (
        <p className="rounded-3xl bg-peach-soft p-6 text-center font-semibold text-ink-soft">
          {pool.length ? `${pool.length} resto${pool.length > 1 ? "s" : ""} dans le chapeau 🎩` : "Aucun resto ne correspond"}
        </p>
      )}

      {planning && pick ? (
        <PlanMeal restaurant={pick} onDone={() => setPlanning(false)} />
      ) : (
        <div className="flex gap-2">
          <button className="btn flex-1 bg-peach-deep text-white shadow-soft" disabled={!pool.length} onClick={draw}>
            🎲 {pick ? "Encore !" : "Tirer au sort"}
          </button>
          {pick && pool.some((r) => r.id === pick.id) && (
            <button className="btn-ghost flex-1" onClick={() => setPlanning(true)}>
              📅 Prévoir
            </button>
          )}
        </div>
      )}
    </div>
  );
}

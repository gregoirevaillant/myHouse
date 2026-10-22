import { lazy, Suspense, useEffect, useState } from "react";
import { useQueries } from "@tanstack/react-query";
import { Modal } from "../components/Modal";
import { RandomPick } from "../components/RandomPick";
import { RestaurantForm } from "../components/RestaurantForm";
import { RestaurantSheet } from "../components/RestaurantSheet";
import { Stars } from "../components/Stars";
import { api, type Meal, type Restaurant } from "../lib/api";
import { addDays, mondayOf, fromIso, shortDate, toIso } from "../lib/dates";
import {
  cuisineInfo,
  distanceLabel,
  distanceTo,
  groupRestaurants,
  matchesSearch,
  priceLabel,
  useAddVisit,
  useMyPosition,
  useRestaurants,
  type GroupBy,
} from "../lib/restaurants";

// la carte (Leaflet) n'est téléchargée qu'à la première ouverture
const RestaurantMap = lazy(() => import("../components/RestaurantMap"));

type View = GroupBy | "map" | "near";
type Status = "ALL" | "DONE" | "TODO";
type Opened = { kind: "sheet"; id: string } | { kind: "form"; id?: string } | { kind: "random" } | null;

const VIEWS: { id: View; label: string }[] = [
  { id: "cuisine", label: "🍱 Cuisine" },
  { id: "district", label: "📍 Arrond." },
  { id: "map", label: "🗺️ Carte" },
  { id: "near", label: "🧭 Proches" },
];

// préférences de cette personne sur cet appareil (vue, filtre, bandeaux écartés) : facultatives
function readPref<T extends string>(key: string, allowed: readonly T[], fallback: T): T {
  try {
    const v = localStorage.getItem(key) as T | null;
    return v && allowed.includes(v) ? v : fallback;
  } catch {
    return fallback;
  }
}
function writePref(key: string, value: string) {
  try {
    localStorage.setItem(key, value);
  } catch {
    // stockage indisponible (navigation privée…) : tant pis
  }
}

export function Restaurants() {
  const { data: restaurants = [], isLoading } = useRestaurants();
  const [view, setView] = useState<View>(() => readPref("restos-view", ["cuisine", "district", "map", "near"] as const, "cuisine"));
  const [status, setStatus] = useState<Status>(() => readPref("restos-status", ["ALL", "DONE", "TODO"] as const, "ALL"));
  const [search, setSearch] = useState("");
  const [opened, setOpened] = useState<Opened>(null);

  const chooseView = (v: View) => {
    setView(v);
    writePref("restos-view", v);
  };
  const chooseStatus = (s: Status) => {
    setStatus(s);
    writePref("restos-status", s);
  };

  const filtered = restaurants.filter((r) => (status === "ALL" || r.wishlist === (status === "TODO")) && matchesSearch(r, search));
  const counts = { DONE: restaurants.filter((r) => !r.wishlist).length, TODO: restaurants.filter((r) => r.wishlist).length };
  const openedRestaurant = opened && "id" in opened && opened.id ? restaurants.find((r) => r.id === opened.id) : undefined;
  const open = (r: Restaurant) => setOpened({ kind: "sheet", id: r.id });

  return (
    <section>
      <h2 className="mb-4 flex items-center gap-2 text-lg font-extrabold">
        <span className="rounded-xl bg-peach px-2 py-1">🍜</span> Restos
      </h2>

      <VisitPrompt restaurants={restaurants} />

      <div className="mb-3 flex gap-2">
        <input className="input focus:border-peach" placeholder="Rechercher un resto…" value={search} onChange={(e) => setSearch(e.target.value)} />
        <button className="btn shrink-0 bg-white px-3 shadow-soft" onClick={() => setOpened({ kind: "random" })} aria-label="On mange où ?" title="On mange où ?">
          🎲
        </button>
        <button className="btn shrink-0 bg-peach px-4 shadow-soft" onClick={() => setOpened({ kind: "form" })}>
          + Nouveau
        </button>
      </div>

      <div className="mb-3 grid grid-cols-4 gap-1 rounded-2xl bg-white p-1 shadow-soft">
        {VIEWS.map((v) => (
          <button
            key={v.id}
            onClick={() => chooseView(v.id)}
            className={`truncate rounded-xl px-1 py-2 text-sm font-bold transition ${view === v.id ? "bg-peach" : "text-ink-soft"}`}
          >
            {v.label}
          </button>
        ))}
      </div>

      <div className="mb-5 flex gap-1.5">
        {(
          [
            ["ALL", `Tous · ${restaurants.length}`],
            ["DONE", `Testés · ${counts.DONE}`],
            ["TODO", `À tester · ${counts.TODO}`],
          ] as const
        ).map(([s, label]) => (
          <button
            key={s}
            onClick={() => chooseStatus(s)}
            className={`rounded-full px-3 py-1 text-sm font-bold transition ${status === s ? "bg-ink text-white" : "bg-white text-ink-soft shadow-soft"}`}
          >
            {label}
          </button>
        ))}
      </div>

      {isLoading ? (
        <p className="text-center text-ink-soft">Chargement…</p>
      ) : view === "near" ? (
        <Nearby restaurants={filtered} onOpen={open} />
      ) : view === "map" ? (
        <>
          <Suspense fallback={<div className="h-[60vh] animate-pulse rounded-3xl bg-peach-soft" />}>
            <RestaurantMap restaurants={filtered} onOpen={open} />
          </Suspense>
          <Unplaced restaurants={filtered.filter((r) => r.lat == null || r.lng == null)} onOpen={open} />
        </>
      ) : filtered.length === 0 ? (
        <div className="rounded-3xl bg-peach-soft p-8 text-center text-ink-soft">
          <p className="text-3xl">🍽️</p>
          <p className="mt-2 font-semibold">{restaurants.length ? "Aucun resto trouvé" : "Ajoute les restos où vous êtes allés et ceux à tester"}</p>
        </div>
      ) : (
        <div className="space-y-5">
          {groupRestaurants(filtered, view).map((g) => (
            <details key={g.key} open className="group rounded-3xl bg-peach-soft p-3">
              <summary className="flex cursor-pointer list-none items-center gap-2 px-1 py-1 font-extrabold">
                {g.emoji && <span className="text-xl">{g.emoji}</span>}
                <span className="flex-1">{g.label}</span>
                <span className="rounded-full bg-white px-2 text-sm text-ink-soft">{g.count}</span>
                <span className="text-ink-soft transition group-open:rotate-90">▸</span>
              </summary>
              <div className="mt-2 space-y-3">
                {g.subgroups.map((s) => (
                  <div key={s.key}>
                    <p className="mb-1 px-1 text-xs font-extrabold uppercase tracking-wide text-ink-soft">
                      {s.emoji} {s.label}
                    </p>
                    <ul className="space-y-1.5">
                      {s.items.map((r) => (
                        <RestaurantRow key={r.id} restaurant={r} showEmoji={view === "district"} onOpen={open} />
                      ))}
                    </ul>
                  </div>
                ))}
              </div>
            </details>
          ))}
        </div>
      )}

      {opened?.kind === "random" && (
        <Modal title="On mange où ? 🎲" onClose={() => setOpened(null)}>
          <RandomPick restaurants={restaurants} onOpen={open} />
        </Modal>
      )}
      {opened?.kind === "sheet" && openedRestaurant && (
        <Modal title={openedRestaurant.name} onClose={() => setOpened(null)}>
          <RestaurantSheet restaurant={openedRestaurant} onEdit={() => setOpened({ kind: "form", id: openedRestaurant.id })} />
        </Modal>
      )}
      {opened?.kind === "form" && (
        <Modal title={openedRestaurant ? "Modifier le resto" : "Nouveau resto"} onClose={() => setOpened(null)}>
          <RestaurantForm restaurant={openedRestaurant} onDone={(saved) => setOpened(saved ? { kind: "sheet", id: saved.id } : null)} />
        </Modal>
      )}
    </section>
  );
}

function RestaurantRow({
  restaurant: r,
  showEmoji,
  distance,
  onOpen,
}: {
  restaurant: Restaurant;
  showEmoji: boolean;
  distance?: number;
  onOpen: (r: Restaurant) => void;
}) {
  return (
    <li>
      <button onClick={() => onOpen(r)} className="flex w-full items-center gap-2 rounded-2xl bg-white px-4 py-2.5 text-left shadow-soft transition active:scale-[0.98]">
        {showEmoji && <span className="text-lg">{cuisineInfo(r.cuisine).emoji}</span>}
        <span className="min-w-0 flex-1">
          <span className="block truncate font-bold">{r.name}</span>
          {distance != null && <span className="block text-xs font-extrabold text-peach-deep">🧭 {distanceLabel(distance)}</span>}
          <span className="block text-xs font-semibold text-ink-soft">
            {r.wishlist
              ? "✨ À tester"
              : `${r.visits.length} visite${r.visits.length > 1 ? "s" : ""}${r.visits[0] ? ` · ${shortDate(r.visits[0])}` : ""}`}
          </span>
        </span>
        <span className="flex shrink-0 flex-col items-end">
          <Stars value={r.rating} />
          {r.price && <span className="text-xs font-extrabold text-ink-soft">{priceLabel(r.price)}</span>}
        </span>
      </button>
    </li>
  );
}

// « Autour de moi » : les restos placés, du plus proche au plus loin
function Nearby({ restaurants, onOpen }: { restaurants: Restaurant[]; onOpen: (r: Restaurant) => void }) {
  const position = useMyPosition();
  const { locate } = position;
  useEffect(locate, [locate]);

  if (position.status !== "ok") {
    const message = {
      idle: "Recherche de ta position…",
      locating: "Recherche de ta position…",
      denied: "La localisation est refusée. Autorise-la dans Réglages › Confidentialité › Service de localisation, puis réessaie.",
      error: "Impossible de trouver ta position pour l'instant.",
    }[position.status];
    return (
      <div className="rounded-3xl bg-peach-soft p-8 text-center text-ink-soft">
        <p className={`text-3xl ${position.status === "locating" || position.status === "idle" ? "animate-pulse" : ""}`}>🧭</p>
        <p className="mt-2 font-semibold">{message}</p>
        {(position.status === "denied" || position.status === "error") && (
          <button className="btn mt-4 bg-white px-4 shadow-soft" onClick={locate}>
            Réessayer
          </button>
        )}
      </div>
    );
  }

  const here = position.position;
  const placed = restaurants
    .map((r) => ({ r, d: distanceTo(here, r) }))
    .filter((x): x is { r: Restaurant; d: number } => x.d != null)
    .sort((a, b) => a.d - b.d);

  return (
    <div>
      <div className="mb-2 flex items-center px-1">
        <p className="flex-1 text-sm font-extrabold text-ink-soft">Du plus proche au plus loin</p>
        <button className="text-sm font-bold text-peach-deep" onClick={locate}>
          ↻ Actualiser
        </button>
      </div>
      {placed.length ? (
        <ul className="space-y-1.5">
          {placed.map(({ r, d }) => (
            <RestaurantRow key={r.id} restaurant={r} showEmoji distance={d} onOpen={onOpen} />
          ))}
        </ul>
      ) : (
        <p className="rounded-3xl bg-peach-soft p-6 text-center font-semibold text-ink-soft">Aucun resto avec une adresse</p>
      )}
      <Unplaced restaurants={restaurants.filter((r) => r.lat == null || r.lng == null)} onOpen={onOpen} title="Sans adresse, donc pas de distance" />
    </div>
  );
}

function Unplaced({ restaurants, onOpen, title = "Pas encore placés sur la carte" }: { restaurants: Restaurant[]; onOpen: (r: Restaurant) => void; title?: string }) {
  if (!restaurants.length) return null;
  return (
    <div className="mt-4">
      <p className="mb-2 px-1 text-sm font-extrabold text-ink-soft">{title}</p>
      <ul className="space-y-1.5">
        {restaurants.map((r) => (
          <RestaurantRow key={r.id} restaurant={r} showEmoji onOpen={onOpen} />
        ))}
      </ul>
    </div>
  );
}

// Repas prévus au resto ces 3 derniers jours, sans visite enregistrée : on propose de l'ajouter
function VisitPrompt({ restaurants }: { restaurants: Restaurant[] }) {
  const today = toIso(new Date());
  const weeks = [...new Set([mondayOf(fromIso(addDays(today, -3))), mondayOf(new Date())])];
  const meals = useQueries({
    queries: weeks.map((week) => ({ queryKey: ["meals", week], queryFn: () => api<Meal[]>(`/meals?week=${week}`) })),
  }).flatMap((q) => q.data ?? []);
  const [dismissed, setDismissed] = useState<string[]>(() => {
    try {
      return JSON.parse(localStorage.getItem("restos-dismissed") ?? "[]");
    } catch {
      return [];
    }
  });
  const addVisit = useAddVisit();

  const lunchOver = new Date().getHours() >= 14;
  const pending = meals
    .filter((m) => m.restaurantId && m.date >= addDays(today, -3) && (m.date < today || (m.date === today && m.slot === "LUNCH" && lunchOver)))
    .map((m) => ({ meal: m, key: `${m.date}-${m.slot}`, restaurant: restaurants.find((r) => r.id === m.restaurantId) }))
    .filter((p): p is typeof p & { restaurant: Restaurant } => !!p.restaurant && !p.restaurant.visits.includes(p.meal.date) && !dismissed.includes(p.key))
    .sort((a, b) => b.key.localeCompare(a.key));

  const next = pending[0];
  if (!next) return null;

  const dismiss = () => {
    // on ne garde que les clés récentes
    const keep = [...dismissed, next.key].filter((k) => k >= addDays(today, -7));
    setDismissed(keep);
    writePref("restos-dismissed", JSON.stringify(keep));
  };
  const when =
    next.meal.date === today ? "ce midi" : `${next.meal.date === addDays(today, -1) ? "hier" : shortDate(next.meal.date)} ${next.meal.slot === "LUNCH" ? "midi" : "soir"}`;

  return (
    <div className="mb-4 flex items-center gap-3 rounded-3xl bg-lemon p-4 shadow-soft">
      <span className="text-2xl">{cuisineInfo(next.restaurant.cuisine).emoji}</span>
      <p className="min-w-0 flex-1 font-bold leading-snug">
        Vous étiez chez {next.restaurant.name} {when} ?
      </p>
      <button className="btn shrink-0 bg-white px-3 py-2 text-sm shadow-soft" disabled={addVisit.isPending} onClick={() => addVisit.mutate({ id: next.restaurant.id, date: next.meal.date })}>
        Oui ✓
      </button>
      <button className="shrink-0 text-sm font-bold text-ink/50" onClick={dismiss} aria-label="Non">
        Non
      </button>
    </div>
  );
}

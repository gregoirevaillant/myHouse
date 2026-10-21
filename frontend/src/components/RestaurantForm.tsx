import { useState, type FormEvent } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { api, type GeocodeResult, type Restaurant, type RestaurantInput } from "../lib/api";
import { toIso } from "../lib/dates";
import { CUISINES, compareDistricts, useRestaurants } from "../lib/restaurants";
import { Stars } from "./Stars";

export function RestaurantForm({ restaurant, onDone }: { restaurant?: Restaurant; onDone: (saved?: Restaurant) => void }) {
  const qc = useQueryClient();
  const { data: all = [] } = useRestaurants();
  const [name, setName] = useState(restaurant?.name ?? "");
  const [cuisine, setCuisine] = useState(restaurant?.cuisine ?? "");
  const isCustom = !!cuisine && !CUISINES.some((c) => c.id === cuisine);
  const [customCuisine, setCustomCuisine] = useState(isCustom);
  const [address, setAddress] = useState(restaurant?.address ?? "");
  const [coords, setCoords] = useState(restaurant?.lat != null && restaurant.lng != null ? { lat: restaurant.lat, lng: restaurant.lng } : null);
  const [district, setDistrict] = useState(restaurant?.district ?? "");
  const [rating, setRating] = useState(restaurant?.rating ?? null);
  const [price, setPrice] = useState(restaurant?.price ?? null);
  const [phone, setPhone] = useState(restaurant?.phone ?? "");
  const [url, setUrl] = useState(restaurant?.url ?? "");
  const [visited, setVisited] = useState(false);
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<GeocodeResult[] | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);

  // suggestions : cuisines libres et quartiers déjà utilisés
  const customCuisines = [...new Set(all.map((r) => r.cuisine).filter((c) => !CUISINES.some((k) => k.id === c)))];
  const districts = [...new Set(all.map((r) => r.district).filter((d): d is string => !!d))].sort(compareDistricts);

  const search = useMutation({
    mutationFn: (q: string) => api<GeocodeResult[]>(`/restaurants/geocode?q=${encodeURIComponent(q)}`),
    onSuccess: setResults,
  });

  const pick = (r: GeocodeResult) => {
    setAddress(r.address);
    setCoords({ lat: r.lat, lng: r.lng });
    if (r.district) setDistrict(r.district);
    if (!name.trim() && r.name) setName(r.name);
    setResults(null);
  };

  const save = useMutation({
    mutationFn: () => {
      const body: RestaurantInput = {
        name,
        cuisine: cuisine.trim(),
        district: district.trim() || null,
        address: address.trim() || null,
        lat: coords?.lat ?? null,
        lng: coords?.lng ?? null,
        rating,
        price,
        phone: phone.trim() || null,
        // « monresto.fr » ou « instagram.com/… » : on ajoute le protocole
        url: url.trim() ? (/^https?:\/\//.test(url.trim()) ? url.trim() : `https://${url.trim()}`) : null,
        ...(!restaurant && visited ? { visitedOn: toIso(new Date()) } : {}),
      };
      return api<Restaurant>(restaurant ? `/restaurants/${restaurant.id}` : "/restaurants", {
        method: restaurant ? "PATCH" : "POST",
        json: body,
      });
    },
    onSuccess: (saved) => {
      qc.invalidateQueries({ queryKey: ["restaurants"] });
      onDone(saved);
    },
  });

  const remove = useMutation({
    mutationFn: () => api(`/restaurants/${restaurant!.id}`, { method: "DELETE" }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["restaurants"] });
      qc.invalidateQueries({ queryKey: ["meals"] });
      onDone();
    },
  });

  const submit = (e: FormEvent) => {
    e.preventDefault();
    save.mutate();
  };

  const runSearch = () => {
    const q = (query || name).trim();
    if (q.length >= 2) search.mutate(q);
  };

  return (
    <form onSubmit={submit} className="space-y-4">
      <div>
        <label className="label" htmlFor="resto-name">Nom</label>
        <input id="resto-name" className="input focus:border-peach" placeholder="Le petit bistrot…" value={name} onChange={(e) => setName(e.target.value)} required />
      </div>

      <div>
        <span className="label">Cuisine</span>
        <div className="flex flex-wrap gap-1.5">
          {CUISINES.map((c) => (
            <button
              key={c.id}
              type="button"
              onClick={() => {
                setCuisine(c.id);
                setCustomCuisine(false);
              }}
              className={`rounded-full px-3 py-1.5 text-sm font-bold shadow-soft transition active:scale-95 ${cuisine === c.id ? "bg-peach" : "bg-white text-ink-soft"}`}
            >
              {c.emoji} {c.label}
            </button>
          ))}
          <button
            type="button"
            onClick={() => {
              setCustomCuisine(true);
              if (!isCustom) setCuisine("");
            }}
            className={`rounded-full px-3 py-1.5 text-sm font-bold shadow-soft transition active:scale-95 ${customCuisine ? "bg-peach" : "bg-white text-ink-soft"}`}
          >
            ✏️ Autre…
          </button>
        </div>
        {customCuisine && (
          <>
            <input
              className="input mt-2 focus:border-peach"
              placeholder="Péruvien, éthiopien…"
              list="resto-cuisines"
              value={cuisine}
              onChange={(e) => setCuisine(e.target.value)}
              autoFocus
            />
            <datalist id="resto-cuisines">
              {customCuisines.map((c) => (
                <option key={c} value={c} />
              ))}
            </datalist>
          </>
        )}
      </div>

      <div>
        <span className="label">Adresse</span>
        {address ? (
          <div className="flex items-center gap-2 rounded-2xl bg-white px-4 py-3 shadow-soft">
            <span className="min-w-0 flex-1 text-sm font-semibold">
              📍 {address}
              {!coords && <span className="block text-xs text-ink-soft">pas placé sur la carte</span>}
            </span>
            <button
              type="button"
              className="shrink-0 text-sm font-bold text-ink-soft"
              onClick={() => {
                setAddress("");
                setCoords(null);
              }}
            >
              Changer
            </button>
          </div>
        ) : (
          <>
            <div className="flex gap-2">
              <input
                className="input focus:border-peach"
                placeholder={name ? `Chercher « ${name} »` : "Nom ou adresse"}
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    runSearch();
                  }
                }}
              />
              <button type="button" className="btn shrink-0 bg-peach px-4 shadow-soft" onClick={runSearch} disabled={search.isPending || (query || name).trim().length < 2}>
                {search.isPending ? "…" : "Chercher"}
              </button>
            </div>
            {search.error && <p className="mt-1 text-sm font-semibold text-rose-deep">{search.error.message}</p>}
            {results && (
              <ul className="mt-2 space-y-1">
                {results.length === 0 && <li className="px-2 text-sm text-ink-soft">Rien trouvé, essaie avec l'adresse.</li>}
                {results.map((r) => (
                  <li key={`${r.lat},${r.lng}`}>
                    <button type="button" onClick={() => pick(r)} className="w-full rounded-2xl bg-white px-4 py-2 text-left text-sm shadow-soft">
                      {r.name && <span className="block font-bold">{r.name}</span>}
                      <span className="text-ink-soft">{r.address}</span>
                      {r.district && <span className="ml-1 rounded-full bg-peach-soft px-2 text-xs font-bold">{r.district}</span>}
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </>
        )}
      </div>

      <div>
        <label className="label" htmlFor="resto-district">Arrondissement ou ville</label>
        <input id="resto-district" className="input focus:border-peach" placeholder="11e, Montreuil…" list="resto-districts" value={district} onChange={(e) => setDistrict(e.target.value)} />
        <datalist id="resto-districts">
          {districts.map((d) => (
            <option key={d} value={d} />
          ))}
        </datalist>
      </div>

      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <span className="label">Note</span>
          <Stars value={rating} onChange={setRating} />
        </div>
        <div>
          <span className="label">Prix</span>
          <div className="flex gap-1">
            {[1, 2, 3].map((p) => (
              <button
                key={p}
                type="button"
                onClick={() => setPrice(price === p ? null : p)}
                className={`rounded-xl px-3 py-1.5 text-sm font-extrabold shadow-soft ${price === p ? "bg-peach" : "bg-white text-ink-soft"}`}
              >
                {"€".repeat(p)}
              </button>
            ))}
          </div>
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <div>
          <label className="label" htmlFor="resto-phone">Téléphone</label>
          <input id="resto-phone" type="tel" className="input focus:border-peach" placeholder="01 23 45 67 89" value={phone} onChange={(e) => setPhone(e.target.value)} />
        </div>
        <div>
          <label className="label" htmlFor="resto-url">Site ou Instagram</label>
          <input id="resto-url" className="input focus:border-peach" placeholder="instagram.com/…" inputMode="url" value={url} onChange={(e) => setUrl(e.target.value)} />
        </div>
      </div>

      {!restaurant && (
        <label className="flex items-center gap-3 rounded-2xl bg-white px-4 py-3 font-bold shadow-soft">
          <input type="checkbox" className="h-5 w-5 accent-peach-deep" checked={visited} onChange={(e) => setVisited(e.target.checked)} />
          On y est déjà allés (visite aujourd'hui)
        </label>
      )}

      {save.error && <p className="text-center text-sm font-semibold text-rose-deep">{save.error.message}</p>}
      <button className="btn w-full bg-peach-deep text-white shadow-soft" disabled={!name.trim() || !cuisine.trim() || save.isPending}>
        {save.isPending ? "Enregistrement…" : restaurant ? "Enregistrer" : "Ajouter le resto"}
      </button>

      {restaurant && (
        <div className="text-center">
          {confirmDelete ? (
            <div className="flex justify-center gap-2">
              <button type="button" className="btn-ghost" onClick={() => setConfirmDelete(false)}>Annuler</button>
              <button type="button" className="btn bg-rose-deep text-white" onClick={() => remove.mutate()} disabled={remove.isPending}>
                Supprimer
              </button>
            </div>
          ) : (
            <button type="button" className="text-sm font-bold text-ink-soft" onClick={() => setConfirmDelete(true)}>
              Supprimer le resto
            </button>
          )}
        </div>
      )}
    </form>
  );
}

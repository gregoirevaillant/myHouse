import { useCallback, useState } from "react";
import { api, type Recipe } from "../lib/api";
import { partKcal, partsKcal, type FoodPart } from "../lib/recipes";
import { BarcodeScanner } from "./BarcodeScanner";

// composition d'un aliment : produits scannés, aliments gardés ou saisie manuelle, avec les grammes de chacun
export function FoodParts({ parts, onChange, foods }: { parts: FoodPart[]; onChange: (p: FoodPart[]) => void; foods: Recipe[] }) {
  const [scanning, setScanning] = useState(false);
  const [error, setError] = useState("");
  const [name, setName] = useState("");
  const [per100, setPer100] = useState("");
  const add = (p: FoodPart) => onChange([...parts, p]);
  const onCode = useCallback(
    (code: string) => {
      setScanning(false);
      setError("");
      api<{ name: string; kcalPer100g: number }>(`/calories/product/${code}`)
        .then((p) => onChange([...parts, { name: p.name, per100: p.kcalPer100g, grams: 100 }]))
        .catch((e: Error) => setError(e.message));
    },
    [parts, onChange],
  );
  const per100Foods = foods.filter((f) => f.per100g && f.calories);

  return (
    <div className="space-y-3">
      <span className="label">Composition</span>
      {parts.map((p, i) => (
        <div key={i} className="rounded-2xl bg-white p-3 shadow-soft">
          <div className="flex items-start justify-between gap-2">
            <p className="text-sm font-bold">{p.name}</p>
            <button type="button" aria-label={`Retirer ${p.name}`} className="text-sm font-bold text-ink-soft" onClick={() => onChange(parts.filter((_, j) => j !== i))}>✕</button>
          </div>
          <div className="mt-2 flex items-center gap-2">
            <input
              aria-label={`Grammes de ${p.name}`}
              className="input w-24 focus:border-rose"
              inputMode="decimal"
              value={p.grams || ""}
              onChange={(e) => onChange(parts.map((x, j) => (j === i ? { ...x, grams: Number(e.target.value.replace(",", ".").replace(/[^\d.]/g, "")) || 0 } : x)))}
            />
            <span className="text-sm font-semibold text-ink-soft">g · {p.per100} kcal/100 g = <b>{partKcal(p)} kcal</b></span>
          </div>
        </div>
      ))}

      {scanning ? (
        <BarcodeScanner onCode={onCode} onClose={() => setScanning(false)} />
      ) : (
        <button type="button" className="btn-ghost w-full" onClick={() => setScanning(true)}>📷 Scanner un produit</button>
      )}
      {error && <p className="text-sm font-bold text-rose-deep">{error}</p>}

      {per100Foods.length > 0 && (
        <select
          aria-label="Ajouter un de mes aliments"
          className="input focus:border-rose"
          value=""
          onChange={(e) => {
            const f = per100Foods.find((x) => x.id === e.target.value);
            if (f) add({ name: f.name, per100: f.calories!, grams: 100 });
          }}
        >
          <option value="">+ Ajouter un de mes aliments…</option>
          {per100Foods.map((f) => <option key={f.id} value={f.id}>{f.name} · {f.calories} kcal/100 g</option>)}
        </select>
      )}

      <div className="flex gap-2">
        <input aria-label="Nom de l'ingrédient" className="input min-w-0 flex-1 focus:border-rose" placeholder="Ou à la main : jambon" value={name} onChange={(e) => setName(e.target.value)} />
        <input aria-label="kcal pour 100 g" className="input w-24 focus:border-rose" inputMode="numeric" pattern="[0-9]*" placeholder="kcal/100 g" value={per100} onChange={(e) => setPer100(e.target.value.replace(/\D/g, ""))} />
        <button
          type="button"
          className="btn-ghost"
          disabled={!name.trim() || !(Number(per100) > 0)}
          onClick={() => {
            add({ name: name.trim().replace(/\s*·\s*/g, " "), per100: Number(per100), grams: 100 });
            setName("");
            setPer100("");
          }}
        >
          +
        </button>
      </div>

      {parts.length > 0 && <p className="text-center text-sm font-bold">Total : {partsKcal(parts)} kcal pour 1 portion</p>}
    </div>
  );
}

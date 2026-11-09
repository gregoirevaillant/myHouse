import { useState, type FormEvent } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { api, type WeightEntry } from "../lib/api";
import { toIso } from "../lib/dates";
import { formatKg, parseKg } from "../lib/weight";

export function WeightForm({ entry, onDone }: { entry?: WeightEntry; onDone: () => void }) {
  const qc = useQueryClient();
  const [date, setDate] = useState(entry?.date ?? toIso(new Date()));
  const [kg, setKg] = useState(entry ? formatKg(entry.grams) : "");
  const [fat, setFat] = useState(entry?.bodyFat?.toString().replace(".", ",") ?? "");
  const grams = parseKg(kg);
  const fatValue = fat ? Number(fat.replace(",", ".")) : null;
  const valid = grams >= 30000 && grams <= 300000 && (fatValue === null || (fatValue >= 1 && fatValue <= 70));
  const done = () => {
    qc.invalidateQueries({ queryKey: ["weight"] });
    onDone();
  };

  const save = useMutation({
    mutationFn: () => api<WeightEntry>("/weight", { method: "POST", json: { date, grams, bodyFat: fatValue } }),
    onSuccess: done,
  });
  const remove = useMutation({ mutationFn: () => api(`/weight/${entry!.id}`, { method: "DELETE" }), onSuccess: done });

  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (valid) save.mutate();
  };

  return (
    <form onSubmit={submit} className="space-y-4">
      <div>
        <label className="label" htmlFor="w-date">Jour</label>
        <input id="w-date" type="date" className="input focus:border-sky" value={date} max={toIso(new Date())} disabled={!!entry} onChange={(e) => setDate(e.target.value)} />
      </div>
      <div>
        <label className="label" htmlFor="w-kg">Poids (kg)</label>
        <input id="w-kg" className="input focus:border-sky" inputMode="decimal" placeholder="72,4" autoFocus value={kg} onChange={(e) => setKg(e.target.value.replace(/[^\d.,]/g, ""))} />
        {kg && !valid && <p className="mt-1 text-sm font-bold text-rose-deep">Entre un poids entre 30 et 300 kg</p>}
      </div>
      <div>
        <label className="label" htmlFor="w-fat">Masse grasse (%, facultatif)</label>
        <input id="w-fat" className="input focus:border-sky" inputMode="decimal" placeholder="18,5" value={fat} onChange={(e) => setFat(e.target.value.replace(/[^\d.,]/g, ""))} />
      </div>
      {entry?.source === "GARMIN" && <p className="text-sm font-semibold text-ink-soft">⌚ Pesée de la balance Garmin : la modifier la garde telle que tu l'as saisie.</p>}
      {(save.error || remove.error) && <p className="text-sm font-bold text-rose-deep">{(save.error ?? remove.error)?.message}</p>}
      <button className="btn-primary w-full" disabled={!valid || save.isPending}>Enregistrer</button>
      {entry && (
        <button type="button" className="w-full text-sm font-bold text-rose-deep" disabled={remove.isPending} onClick={() => remove.mutate()}>
          Supprimer cette pesée
        </button>
      )}
    </form>
  );
}

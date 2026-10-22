import { useState, type FormEvent } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import { api, type ExpenseTracker } from "../lib/api";
import { EMOJIS } from "../lib/expenses";

export function TrackerForm({ tracker, onDone }: { tracker?: ExpenseTracker; onDone: (created?: ExpenseTracker) => void }) {
  const qc = useQueryClient();
  const navigate = useNavigate();
  const [name, setName] = useState(tracker?.name ?? "");
  const [emoji, setEmoji] = useState(tracker?.emoji ?? EMOJIS[0]);
  const [confirmDelete, setConfirmDelete] = useState(false);

  const save = useMutation({
    mutationFn: () => {
      const json = { name, emoji };
      return tracker
        ? api<ExpenseTracker>(`/expense-trackers/${tracker.id}`, { method: "PUT", json })
        : api<ExpenseTracker>("/expense-trackers", { method: "POST", json });
    },
    onSuccess: (t) => {
      qc.invalidateQueries({ queryKey: ["expense-trackers"] });
      onDone(tracker ? undefined : t);
    },
  });

  const remove = useMutation({
    mutationFn: () => api(`/expense-trackers/${tracker!.id}`, { method: "DELETE" }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["expense-trackers"] });
      qc.invalidateQueries({ queryKey: ["expenses"] });
      navigate("/depenses");
    },
  });

  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (name.trim() && emoji.trim()) save.mutate();
  };

  return (
    <form onSubmit={submit} className="space-y-4">
      <div>
        <label className="label" htmlFor="trk-name">Nom</label>
        <input
          id="trk-name"
          className="input focus:border-sky"
          placeholder="Vie quotidienne, Voyage en Norvège…"
          maxLength={100}
          value={name}
          onChange={(e) => setName(e.target.value)}
          autoFocus
          required
        />
      </div>

      <div>
        <span className="label">Icône</span>
        <div className="flex flex-wrap gap-2">
          {EMOJIS.map((em) => (
            <button
              type="button"
              key={em}
              onClick={() => setEmoji(em)}
              className={`h-11 w-11 rounded-2xl text-xl shadow-soft transition ${emoji === em ? "bg-sky" : "bg-white"}`}
            >
              {em}
            </button>
          ))}
        </div>
      </div>

      {save.error && <p className="text-center text-sm font-semibold text-rose-deep">{save.error.message}</p>}
      <button className="btn w-full bg-sky-deep text-white shadow-soft" disabled={!name.trim() || save.isPending}>
        {tracker ? "Enregistrer" : "Créer le carnet"}
      </button>

      {tracker && (
        <div className="text-center">
          {confirmDelete ? (
            <div>
              <p className="mb-2 text-sm font-semibold text-rose-deep">Toutes les dépenses du carnet seront supprimées.</p>
              <div className="flex justify-center gap-2">
                <button type="button" className="btn-ghost" onClick={() => setConfirmDelete(false)}>Annuler</button>
                <button type="button" className="btn bg-rose-deep text-white" onClick={() => remove.mutate()} disabled={remove.isPending}>
                  Supprimer
                </button>
              </div>
            </div>
          ) : (
            <button type="button" className="text-sm font-bold text-ink-soft" onClick={() => setConfirmDelete(true)}>
              Supprimer le carnet
            </button>
          )}
        </div>
      )}
    </form>
  );
}

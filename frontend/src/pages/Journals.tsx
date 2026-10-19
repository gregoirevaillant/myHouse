import { useState, type FormEvent } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link, useNavigate } from "react-router-dom";
import { Modal } from "../components/Modal";
import { api, type JournalSummary } from "../lib/api";
import { shortDate } from "../lib/dates";

const COLORS = ["bg-lemon-soft", "bg-lavender-soft", "bg-rose-soft", "bg-sky-soft", "bg-mint-soft", "bg-peach-soft"];

export function Journals() {
  const [adding, setAdding] = useState(false);
  const { data: journals = [], isLoading } = useQuery({
    queryKey: ["journals"],
    queryFn: () => api<JournalSummary[]>("/journals"),
  });

  return (
    <section>
      <div className="mb-4 flex items-center justify-between">
        <h2 className="flex items-center gap-2 text-lg font-extrabold">
          <span className="rounded-xl bg-lemon px-2 py-1">📔</span> Mes journaux
        </h2>
        <button className="btn bg-lemon px-4 py-2 shadow-soft" onClick={() => setAdding(true)}>
          + Nouveau
        </button>
      </div>

      {isLoading ? (
        <p className="text-center text-ink-soft">Chargement…</p>
      ) : journals.length === 0 ? (
        <div className="rounded-3xl bg-lemon-soft p-8 text-center text-ink-soft">
          <p className="text-3xl">📔</p>
          <p className="mt-2 font-semibold">Aucun journal pour l'instant</p>
        </div>
      ) : (
        <div className="space-y-3">
          {journals.map((j, i) => (
            <Link
              key={j.id}
              to={`/journal/${j.id}`}
              className={`flex items-center justify-between rounded-3xl p-5 shadow-soft transition active:scale-95 ${COLORS[i % COLORS.length]}`}
            >
              <span className="text-lg font-extrabold">{j.title}</span>
              <span className="text-right text-xs font-semibold text-ink-soft">
                {j.entryCount} jour{j.entryCount > 1 ? "s" : ""}
                {j.lastDate && <span className="block">dernier : {shortDate(j.lastDate)}</span>}
              </span>
            </Link>
          ))}
        </div>
      )}

      {adding && (
        <Modal title="Nouveau journal" onClose={() => setAdding(false)}>
          <JournalForm />
        </Modal>
      )}
    </section>
  );
}

function JournalForm() {
  const qc = useQueryClient();
  const navigate = useNavigate();
  const [title, setTitle] = useState("");
  const create = useMutation({
    mutationFn: () => api<JournalSummary>("/journals", { method: "POST", json: { title } }),
    onSuccess: (j) => {
      qc.invalidateQueries({ queryKey: ["journals"] });
      navigate(`/journal/${j.id}`);
    },
  });

  const submit = (e: FormEvent) => {
    e.preventDefault();
    create.mutate();
  };

  return (
    <form onSubmit={submit} className="space-y-3">
      <input
        className="input focus:border-lemon-deep"
        placeholder="Titre du journal"
        maxLength={100}
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        autoFocus
        required
      />
      {create.error && <p className="text-sm font-semibold text-rose-deep">{create.error.message}</p>}
      <button className="btn-primary w-full" disabled={create.isPending}>
        Créer
      </button>
    </form>
  );
}

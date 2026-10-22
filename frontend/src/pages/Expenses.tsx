import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { Modal } from "../components/Modal";
import { TrackerForm } from "../components/TrackerForm";
import { TricountImport } from "../components/TricountImport";
import type { ExpenseTracker } from "../lib/api";
import { useExpenses, useTrackers, computeDebt } from "../lib/expenses";
import { useMembers } from "../lib/members";
import { formatEur } from "../lib/money";

const COLORS = ["bg-sky-soft", "bg-mint-soft", "bg-lavender-soft", "bg-peach-soft", "bg-rose-soft", "bg-lemon-soft"];

export function Expenses() {
  const navigate = useNavigate();
  const [adding, setAdding] = useState(false);
  const [importing, setImporting] = useState(false);
  const { data: trackers = [], isLoading } = useTrackers();
  const { data: expenses = [] } = useExpenses();
  const { data: members = [] } = useMembers();

  // carnets en cours d'abord, terminés ensuite (les plus récemment terminés en tête)
  const active = trackers.filter((t) => !t.finishedAt);
  const finished = trackers.filter((t) => t.finishedAt).sort((a, b) => b.finishedAt!.localeCompare(a.finishedAt!));

  const card = (t: ExpenseTracker, i: number) => {
    const own = expenses.filter((e) => e.trackerId === t.id);
    const total = own.filter((e) => !e.isReimbursement).reduce((s, e) => s + e.amountCents, 0);
    const debt = computeDebt(own, members);
    return (
      <Link
        key={t.id}
        to={`/depenses/${t.id}`}
        className={`flex items-center gap-4 rounded-3xl p-5 shadow-soft transition active:scale-95 ${t.finishedAt ? "bg-white opacity-80" : COLORS[i % COLORS.length]}`}
      >
        <span className={`flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl text-2xl ${t.finishedAt ? "bg-cream" : "bg-white"}`}>{t.emoji}</span>
        <span className="min-w-0 flex-1">
          <span className="block truncate text-lg font-extrabold">{t.name}</span>
          <span className="block text-xs font-semibold text-ink-soft">
            {own.length} dépense{own.length > 1 ? "s" : ""}
            {debt ? ` · ${debt.from.name} doit ${formatEur(debt.cents)}` : own.length ? " · à l'équilibre" : ""}
          </span>
        </span>
        <span className="text-right">
          <span className="block text-xs font-bold text-ink-soft">Total</span>
          <span className="block font-extrabold tabular-nums">{formatEur(total)}</span>
        </span>
      </Link>
    );
  };

  return (
    <section>
      <div className="mb-4 flex items-center justify-between">
        <h2 className="flex items-center gap-2 text-lg font-extrabold">
          <span className="rounded-xl bg-sky px-2 py-1">💶</span> Dépenses
        </h2>
        <button className="btn bg-sky px-4 py-2 shadow-soft" onClick={() => setAdding(true)}>
          + Nouveau carnet
        </button>
      </div>

      {isLoading ? (
        <p className="text-center text-ink-soft">Chargement…</p>
      ) : trackers.length === 0 ? (
        <div className="rounded-3xl bg-sky-soft p-8 text-center text-ink-soft">
          <p className="text-3xl">💸</p>
          <p className="mt-2 font-semibold">Aucun carnet de dépenses</p>
        </div>
      ) : (
        <>
          <div className="space-y-3">{active.map((t, i) => card(t, i))}</div>
          {finished.length > 0 && (
            <>
              <p className="mb-2 mt-6 px-1 text-sm font-extrabold text-ink-soft">✓ Terminés</p>
              <div className="space-y-3">{finished.map((t, i) => card(t, active.length + i))}</div>
            </>
          )}
        </>
      )}

      <button className="btn-ghost mt-4 w-full" onClick={() => setImporting(true)}>
        📥 Importer un ancien Tricount
      </button>

      {importing && (
        <Modal title="Importer un Tricount" onClose={() => setImporting(false)}>
          <TricountImport />
        </Modal>
      )}
      {adding && (
        <Modal title="Nouveau carnet" onClose={() => setAdding(false)}>
          <TrackerForm
            onDone={(t) => {
              setAdding(false);
              if (t) navigate(`/depenses/${t.id}`);
            }}
          />
        </Modal>
      )}
    </section>
  );
}

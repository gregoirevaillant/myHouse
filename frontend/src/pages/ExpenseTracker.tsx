import { useMemo, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { BarChart, type Bar } from "../components/BarChart";
import { ExpenseForm } from "../components/ExpenseForm";
import { TrackerForm } from "../components/TrackerForm";
import { Modal } from "../components/Modal";
import { type Expense, type ExpenseInput } from "../lib/api";
import { useMe } from "../lib/auth";
import { computeDebt, useExpenses, useTrackers } from "../lib/expenses";
import { fromIso, monthKey, monthLabel, shiftMonth, shortDate, toIso } from "../lib/dates";
import { useMembers } from "../lib/members";
import { formatEur, formatEurRound } from "../lib/money";

type Editing = { expense?: Expense; initial?: Partial<ExpenseInput> } | null;

export function ExpenseTracker() {
  const { id = "" } = useParams<{ id: string }>();
  const { data: me } = useMe();
  const { data: members = [] } = useMembers();
  const { data: allExpenses = [], isLoading } = useExpenses();
  const { data: trackers, isLoading: loadingTrackers } = useTrackers();
  const tracker = trackers?.find((t) => t.id === id);
  const expenses = useMemo(() => allExpenses.filter((e) => e.trackerId === id), [allExpenses, id]);
  const currentMonth = monthKey(toIso(new Date()));
  const [month, setMonth] = useState(currentMonth);
  const [editing, setEditing] = useState<Editing>(null);
  const [renaming, setRenaming] = useState(false);

  const name = (id: string) => members.find((m) => m.id === id)?.name ?? "?";

  const debt = useMemo(() => computeDebt(expenses, members), [expenses, members]);

  const spending = expenses.filter((e) => !e.isReimbursement);

  const monthBars: Bar[] = useMemo(() => {
    const last = month > currentMonth ? month : currentMonth;
    const keys = Array.from({ length: 12 }, (_, i) => shiftMonth(last, i - 11));
    return keys.map((key) => ({
      key,
      label: monthLabel(key, "long"),
      tooltip: monthLabel(key, "long"),
      axisLabel: monthLabel(key, "short").charAt(0).toUpperCase(),
      value: spending.filter((e) => monthKey(e.date) === key).reduce((s, e) => s + e.amountCents, 0),
    }));
  }, [spending, month, currentMonth]);

  const dayBars: Bar[] = useMemo(() => {
    const [y, m] = month.split("-").map(Number);
    const days = new Date(y, m, 0).getDate();
    return Array.from({ length: days }, (_, i) => {
      const iso = `${month}-${String(i + 1).padStart(2, "0")}`;
      const day = i + 1;
      return {
        key: iso,
        label: shortDate(iso),
        tooltip: fromIso(iso).toLocaleDateString("fr-FR", { weekday: "short", day: "numeric", month: "short" }),
        axisLabel: day === 1 || day % 5 === 0 ? String(day) : "",
        value: spending.filter((e) => e.date === iso).reduce((s, e) => s + e.amountCents, 0),
      };
    });
  }, [spending, month]);

  const monthExpenses = expenses.filter((e) => monthKey(e.date) === month);
  const monthSpending = monthExpenses.filter((e) => !e.isReimbursement);
  const monthTotal = monthSpending.reduce((s, e) => s + e.amountCents, 0);
  const paidInMonth = (id: string) => monthSpending.filter((e) => e.paidById === id).reduce((s, e) => s + e.amountCents, 0);

  const settle = () =>
    debt &&
    setEditing({
      initial: {
        title: "Remboursement",
        amountCents: debt.cents,
        paidById: debt.from.id,
        isReimbursement: true,
        shares: [
          { userId: debt.to.id, amountCents: debt.cents },
          { userId: debt.from.id, amountCents: 0 },
        ],
      },
    });

  if (loadingTrackers) return <p className="text-center text-ink-soft">Chargement…</p>;
  if (!tracker) return <p className="text-center text-ink-soft">Carnet introuvable</p>;

  return (
    <section>
      <div className="mb-4 flex items-center justify-between gap-2">
        <Link to="/depenses" className="btn-ghost shrink-0 px-4 py-2" aria-label="Retour aux carnets">
          ◀
        </Link>
        <h2 className="flex min-w-0 flex-1 items-center gap-2 text-lg font-extrabold">
          <span className="rounded-xl bg-sky px-2 py-1">{tracker.emoji}</span>
          <span className="truncate">{tracker.name}</span>
        </h2>
        <button className="btn-ghost shrink-0 px-3 py-2" onClick={() => setRenaming(true)} aria-label="Modifier le carnet">
          ✏️
        </button>
        <button className="btn shrink-0 bg-sky px-4 py-2 shadow-soft" onClick={() => setEditing({})} disabled={!members.length}>
          + Ajouter
        </button>
      </div>

      {/* solde */}
      <div className="mb-4 rounded-3xl bg-sky-soft p-5">
        <p className="text-sm font-bold text-ink-soft">Équilibre</p>
        {debt ? (
          <div className="mt-1 flex flex-wrap items-center justify-between gap-3">
            <p className="text-lg font-extrabold">
              {debt.from.name} doit <span className="text-sky-deep">{formatEur(debt.cents)}</span> à {debt.to.name}
            </p>
            <button className="btn bg-white px-4 py-2 text-sm shadow-soft" onClick={settle}>
              Rembourser
            </button>
          </div>
        ) : (
          <p className="mt-1 text-lg font-extrabold">Vous êtes à l'équilibre ✨</p>
        )}
      </div>

      {/* navigation mois */}
      <div className="mb-4 flex items-center justify-between rounded-2xl bg-white p-2 shadow-soft">
        <button className="btn px-4 py-2 hover:bg-sky-soft" onClick={() => setMonth(shiftMonth(month, -1))} aria-label="Mois précédent">
          ◀
        </button>
        <button className="text-center" onClick={() => setMonth(currentMonth)}>
          <p className="font-extrabold capitalize">{monthLabel(month, "long")}</p>
          <p className="text-xs font-semibold text-ink-soft">{month === currentMonth ? "Ce mois-ci" : "Revenir à ce mois"}</p>
        </button>
        <button className="btn px-4 py-2 hover:bg-sky-soft" onClick={() => setMonth(shiftMonth(month, 1))} aria-label="Mois suivant">
          ▶
        </button>
      </div>

      {/* chiffres du mois */}
      <div className="mb-4 rounded-3xl bg-white p-5 shadow-soft">
        <p className="text-sm font-bold text-ink-soft">Total du mois</p>
        <p className="text-4xl font-extrabold">{formatEur(monthTotal)}</p>
        <div className="mt-3 flex flex-wrap gap-x-5 gap-y-1 text-sm font-semibold text-ink-soft">
          {members.map((m) => (
            <span key={m.id}>
              {m.name} a payé <span className="text-ink">{formatEur(paidInMonth(m.id))}</span>
            </span>
          ))}
        </div>
      </div>

      {/* graphiques */}
      <div className="mb-4 space-y-6 rounded-3xl bg-white p-5 shadow-soft">
        <div>
          <p className="mb-4 text-sm font-bold text-ink-soft">Par mois · 12 derniers mois</p>
          <BarChart
            title="Dépenses par mois"
            bars={monthBars}
            selectedKey={month}
            onSelect={setMonth}
            formatTick={formatEurRound}
            formatValue={formatEur}
          />
        </div>
        <div>
          <p className="mb-4 text-sm font-bold text-ink-soft">
            Par jour · <span className="capitalize">{monthLabel(month, "long")}</span>
          </p>
          <BarChart title="Dépenses par jour" bars={dayBars} formatTick={formatEurRound} formatValue={formatEur} />
        </div>
      </div>

      {/* liste */}
      {isLoading ? (
        <p className="text-center text-ink-soft">Chargement…</p>
      ) : monthExpenses.length === 0 ? (
        <div className="rounded-3xl bg-sky-soft p-8 text-center text-ink-soft">
          <p className="text-3xl">💸</p>
          <p className="mt-2 font-semibold">Aucune dépense ce mois-ci</p>
        </div>
      ) : (
        <ul className="space-y-2">
          {monthExpenses.map((e) => {
            const myShare = e.shares.find((s) => s.userId === me?.id)?.amountCents ?? 0;
            return (
              <li key={e.id}>
                <button
                  onClick={() => setEditing({ expense: e })}
                  className="flex w-full items-center gap-3 rounded-2xl bg-white px-4 py-3 text-left shadow-soft transition active:scale-[0.98]"
                >
                  <span className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl ${e.isReimbursement ? "bg-mint" : "bg-sky-soft"}`}>
                    {e.isReimbursement ? "↔︎" : "💶"}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate font-bold">{e.title}</span>
                    <span className="block text-xs font-semibold text-ink-soft">
                      {shortDate(e.date)} · payé par {name(e.paidById)}
                    </span>
                  </span>
                  <span className="text-right">
                    <span className="block font-extrabold tabular-nums">{formatEur(e.amountCents)}</span>
                    {!e.isReimbursement && (
                      <span className="block text-xs font-semibold tabular-nums text-ink-soft">ma part {formatEur(myShare)}</span>
                    )}
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
      )}

      {editing && me && (
        <Modal
          title={editing.expense ? "Modifier la dépense" : editing.initial?.isReimbursement ? "Remboursement" : "Nouvelle dépense"}
          onClose={() => setEditing(null)}
        >
          <ExpenseForm
            trackerId={id}
            members={members}
            meId={me.id}
            expense={editing.expense}
            initial={editing.initial}
            onDone={() => setEditing(null)}
          />
        </Modal>
      )}

      {renaming && (
        <Modal title="Modifier le carnet" onClose={() => setRenaming(false)}>
          <TrackerForm tracker={tracker} onDone={() => setRenaming(false)} />
        </Modal>
      )}
    </section>
  );
}

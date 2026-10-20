import { useState, type FormEvent } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { api, type Expense, type ExpenseInput, type Member } from "../lib/api";
import { toIso } from "../lib/dates";
import { centsToInput, formatEur, parseEur, splitEqually } from "../lib/money";

export function ExpenseForm({
  trackerId,
  members,
  meId,
  expense,
  initial,
  onDone,
}: {
  trackerId: string;
  members: Member[];
  meId: string;
  expense?: Expense;
  initial?: Partial<ExpenseInput>;
  onDone: () => void;
}) {
  const qc = useQueryClient();
  const source = expense ?? initial;
  const [title, setTitle] = useState(source?.title ?? "");
  const [amount, setAmount] = useState(source?.amountCents ? centsToInput(source.amountCents) : "");
  const [paidById, setPaidById] = useState(source?.paidById ?? meId);
  const [date, setDate] = useState(source?.date ?? toIso(new Date()));
  const isReimbursement = source?.isReimbursement ?? false;

  // répartition : "equal" suit le montant, "custom" = montants saisis à la main
  const initialShares = source?.shares;
  const amountCents = parseEur(amount) ?? 0;
  const equalShares = splitEqually(amountCents, members.map((m) => m.id));
  const startsEqual =
    !initialShares ||
    (initialShares.length === members.length &&
      initialShares.every((s) => equalShares.find((e) => e.userId === s.userId)?.amountCents === s.amountCents));
  const [mode, setMode] = useState<"equal" | "custom">(startsEqual ? "equal" : "custom");
  const [custom, setCustom] = useState<Record<string, string>>(() =>
    Object.fromEntries(
      members.map((m) => [m.id, centsToInput(initialShares?.find((s) => s.userId === m.id)?.amountCents ?? 0)]),
    ),
  );

  const shares =
    mode === "equal"
      ? equalShares
      : members.map((m) => ({ userId: m.id, amountCents: parseEur(custom[m.id] ?? "") ?? 0 }));
  const sharesTotal = shares.reduce((sum, s) => sum + s.amountCents, 0);
  const remaining = amountCents - sharesTotal;

  const editShare = (userId: string, value: string) => {
    const next = { ...custom, [userId]: value };
    // à deux, l'autre part se complète automatiquement
    if (members.length === 2) {
      const other = members.find((m) => m.id !== userId)!;
      const cents = parseEur(value);
      if (cents !== null && cents <= amountCents) next[other.id] = centsToInput(amountCents - cents);
    }
    setMode("custom");
    setCustom(next);
  };

  const assignAll = (userId: string) => {
    setMode("custom");
    setCustom(Object.fromEntries(members.map((m) => [m.id, centsToInput(m.id === userId ? amountCents : 0)])));
  };

  const save = useMutation({
    mutationFn: () => {
      const body: ExpenseInput = { trackerId, title, amountCents, paidById, date, isReimbursement, shares };
      return expense
        ? api(`/expenses/${expense.id}`, { method: "PUT", json: body })
        : api("/expenses", { method: "POST", json: body });
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["expenses"] });
      onDone();
    },
  });

  const remove = useMutation({
    mutationFn: () => api(`/expenses/${expense!.id}`, { method: "DELETE" }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["expenses"] });
      onDone();
    },
  });

  const [confirmDelete, setConfirmDelete] = useState(false);
  const canSave = title.trim() && amountCents > 0 && remaining === 0 && date;

  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (canSave) save.mutate();
  };

  return (
    <form onSubmit={submit} className="space-y-4">
      <div>
        <label className="label" htmlFor="exp-title">Titre</label>
        <input id="exp-title" className="input focus:border-sky" placeholder="Courses, resto, loyer…" value={title} onChange={(e) => setTitle(e.target.value)} required />
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="label" htmlFor="exp-amount">Montant</label>
          <div className="relative">
            <input
              id="exp-amount"
              className="input pr-9 text-lg font-bold focus:border-sky"
              inputMode="decimal"
              placeholder="0,00"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              required
            />
            <span className="pointer-events-none absolute right-4 top-1/2 -translate-y-1/2 font-bold text-ink-soft">€</span>
          </div>
        </div>
        <div>
          <label className="label" htmlFor="exp-date">Date</label>
          <input id="exp-date" type="date" className="input focus:border-sky" value={date} onChange={(e) => setDate(e.target.value)} required />
        </div>
      </div>

      <div>
        <span className="label">Payé par</span>
        <div className="grid grid-cols-2 gap-2">
          {members.map((m) => (
            <button
              type="button"
              key={m.id}
              onClick={() => setPaidById(m.id)}
              className={`rounded-2xl px-3 py-3 font-bold shadow-soft transition ${paidById === m.id ? "bg-sky" : "bg-white"}`}
            >
              {m.name}
            </button>
          ))}
        </div>
      </div>

      <div>
        <div className="mb-1.5 flex items-center justify-between">
          <span className="label mb-0">Répartition</span>
          <button
            type="button"
            onClick={() => setMode("equal")}
            className={`rounded-full px-3 py-1 text-xs font-bold ${mode === "equal" ? "bg-sky text-ink" : "bg-white text-ink-soft shadow-soft"}`}
          >
            50 / 50
          </button>
        </div>
        <div className="space-y-2 rounded-2xl bg-white p-3 shadow-soft">
          {members.map((m) => {
            const share = shares.find((s) => s.userId === m.id)?.amountCents ?? 0;
            const pct = amountCents > 0 ? Math.round((share / amountCents) * 100) : 0;
            return (
              <div key={m.id} className="flex items-center gap-3">
                <span className="w-20 shrink-0 truncate font-bold">{m.name}</span>
                <div className="relative flex-1">
                  <input
                    aria-label={`Part de ${m.name}`}
                    className="w-full rounded-xl bg-sky-soft px-3 py-2 pr-8 font-semibold outline-none focus:ring-2 focus:ring-sky"
                    inputMode="decimal"
                    value={mode === "equal" ? centsToInput(share) : custom[m.id]}
                    onChange={(e) => editShare(m.id, e.target.value)}
                  />
                  <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-sm font-bold text-ink-soft">€</span>
                </div>
                <span className="w-10 text-right text-sm font-bold tabular-nums text-ink-soft">{pct} %</span>
                <button type="button" onClick={() => assignAll(m.id)} className="text-xs font-bold text-sky-deep" title={`Tout pour ${m.name}`}>
                  100 %
                </button>
              </div>
            );
          })}
        </div>
        {amountCents > 0 && remaining !== 0 && (
          <p className="mt-2 text-sm font-semibold text-rose-deep">
            {remaining > 0 ? `Reste ${formatEur(remaining)} à répartir` : `${formatEur(-remaining)} de trop`}
          </p>
        )}
      </div>

      {save.error && <p className="text-center text-sm font-semibold text-rose-deep">{save.error.message}</p>}
      <button className="btn w-full bg-sky-deep text-white shadow-soft" disabled={!canSave || save.isPending}>
        {save.isPending ? "Enregistrement…" : expense ? "Enregistrer" : "Ajouter la dépense"}
      </button>

      {expense && (
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
              Supprimer la dépense
            </button>
          )}
        </div>
      )}
    </form>
  );
}

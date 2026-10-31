import { useState, type FormEvent } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { BarChart } from "../components/BarChart";
import { Modal } from "../components/Modal";
import { api, type BudgetItem, type BudgetItemInput, type BudgetKind, type BudgetPeriod } from "../lib/api";
import { budgetSummary, category, categoriesOf, monthlyCents, monthlyOutflows, nextDue, useBudgetItems } from "../lib/budget";
import { monthLabel, shortDate, toIso } from "../lib/dates";
import { centsToInput, formatEur, formatEurRound, parseEur } from "../lib/money";

type Tab = "MONTHLY" | "YEARLY" | "CALENDAR";
const TABS: { id: Tab; label: string }[] = [
  { id: "MONTHLY", label: "Mensuel" },
  { id: "YEARLY", label: "Annuel" },
  { id: "CALENDAR", label: "Calendrier" },
];
const MONTHS = Array.from({ length: 12 }, (_, i) => new Date(2000, i, 1).toLocaleDateString("fr-FR", { month: "long" }));

type Opened = { id?: string } | null;

export function Budget() {
  const { data: items = [], isLoading } = useBudgetItems();
  const [tab, setTab] = useState<Tab>("MONTHLY");
  const [opened, setOpened] = useState<Opened>(null);
  const today = toIso(new Date());
  const summary = budgetSummary(items, today);
  const openedItem = opened?.id ? items.find((i) => i.id === opened.id) : undefined;

  return (
    <section>
      <div className="mb-4 flex items-center justify-between">
        <h2 className="flex items-center gap-2 text-lg font-extrabold">
          <span className="rounded-xl bg-rose px-2 py-1">📊</span> Budget
        </h2>
        <button className="btn bg-rose px-4 py-2 shadow-soft" onClick={() => setOpened({})}>
          + Ajouter
        </button>
      </div>

      {isLoading ? (
        <p className="text-center text-ink-soft">Chargement…</p>
      ) : items.length === 0 ? (
        <div className="rounded-3xl bg-rose-soft p-8 text-center text-ink-soft">
          <p className="text-3xl">📊</p>
          <p className="mt-2 font-semibold">Loyer, assurances, abonnements, impôts… ajoute tes charges mensuelles et annuelles pour voir ce qui te reste chaque mois</p>
        </div>
      ) : (
        <>
          <div className="mb-4 rounded-3xl bg-rose-soft p-4">
            <p className="text-sm font-bold text-ink-soft">Reste par mois</p>
            <p className={`text-3xl font-extrabold ${summary.leftCents < 0 ? "text-rose-deep" : ""}`}>{formatEur(summary.leftCents)}</p>
            <div className="mt-3 grid grid-cols-2 gap-2 text-sm font-bold">
              <div className="rounded-2xl bg-white px-3 py-2 shadow-soft">
                <span className="block text-xs text-ink-soft">Revenus</span>
                {formatEur(summary.incomeCents)}
              </div>
              <div className="rounded-2xl bg-white px-3 py-2 shadow-soft">
                <span className="block text-xs text-ink-soft">Charges</span>
                {formatEur(summary.expenseCents)}
              </div>
            </div>
            {summary.yearlySmoothedCents > 0 && (
              <p className="mt-2 text-xs font-semibold text-ink-soft">dont {formatEur(summary.yearlySmoothedCents)} par mois à mettre de côté pour les charges annuelles</p>
            )}
          </div>

          <div className="mb-4 flex gap-1.5">
            {TABS.map((t) => (
              <button
                key={t.id}
                onClick={() => setTab(t.id)}
                className={`flex-1 rounded-full px-3 py-1.5 text-sm font-bold shadow-soft transition active:scale-95 ${tab === t.id ? "bg-rose" : "bg-white text-ink-soft"}`}
              >
                {t.label}
              </button>
            ))}
          </div>

          {tab === "CALENDAR" ? (
            <Calendar items={items} today={today} />
          ) : (
            <ItemList items={items.filter((i) => i.period === tab)} period={tab} today={today} onEdit={(id) => setOpened({ id })} />
          )}
        </>
      )}

      {opened && (
        <Modal title={openedItem ? "Modifier la ligne" : "Nouvelle ligne"} onClose={() => setOpened(null)}>
          <ItemForm item={openedItem} defaultPeriod={tab === "YEARLY" ? "YEARLY" : "MONTHLY"} onDone={() => setOpened(null)} />
        </Modal>
      )}
    </section>
  );
}

function ItemList({ items, period, today, onEdit }: { items: BudgetItem[]; period: BudgetPeriod; today: string; onEdit: (id: string) => void }) {
  if (items.length === 0) {
    return <p className="rounded-3xl bg-rose-soft p-6 text-center font-semibold text-ink-soft">{period === "MONTHLY" ? "Aucune ligne mensuelle" : "Aucune charge annuelle"}</p>;
  }
  const groups = Object.keys(Object.fromEntries(items.map((i) => [i.category, 1]))).map((id) => ({ id, ...category(id), items: items.filter((i) => i.category === id) }));
  return (
    <div className="space-y-4">
      {groups.map((g) => (
        <div key={g.id} className="rounded-3xl bg-rose-soft p-3">
          <p className="mb-2 flex items-center gap-2 px-1 font-extrabold">
            <span className="text-xl">{g.icon}</span> {g.label}
          </p>
          <ul className="space-y-1.5">
            {g.items.map((i) => (
              <li key={i.id}>
                <button onClick={() => onEdit(i.id)} className={`flex w-full items-center gap-3 rounded-2xl bg-white px-4 py-2.5 text-left shadow-soft ${i.active ? "" : "opacity-50"}`}>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate font-bold">
                      {i.private && "🔒 "}
                      {i.label}
                    </span>
                    <span className="block text-xs font-semibold text-ink-soft">
                      {i.active ? (i.kind === "EXPENSE" ? `prochain : ${shortDate(nextDue(i, today))}` : period === "MONTHLY" ? `le ${i.dueDay} du mois` : `le ${shortDate(nextDue(i, today))}`) : "en pause"}
                      {period === "YEARLY" && ` · ${formatEur(monthlyCents(i))}/mois`}
                    </span>
                  </span>
                  <span className={`shrink-0 text-lg font-extrabold ${i.kind === "INCOME" ? "text-mint-deep" : ""}`}>
                    {i.kind === "INCOME" ? "+" : ""}
                    {formatEur(i.amountCents)}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        </div>
      ))}
    </div>
  );
}

function Calendar({ items, today }: { items: BudgetItem[]; today: string }) {
  const months = monthlyOutflows(items, today);
  const [selected, setSelected] = useState(months[0].key);
  const current = months.find((m) => m.key === selected) ?? months[0];
  const monthNumber = current.date.getMonth() + 1;
  const due = items
    .filter((i) => i.active && i.kind === "EXPENSE" && (i.period === "MONTHLY" || i.dueMonth === monthNumber))
    .sort((a, b) => a.dueDay - b.dueDay);

  return (
    <div className="space-y-4">
      <div className="rounded-3xl bg-rose-soft p-4">
        <BarChart
          title="Charges des 12 prochains mois"
          bars={months.map((m) => ({ key: m.key, label: monthLabel(m.key, "short"), tooltip: `${monthLabel(m.key, "long")} : ${formatEur(m.cents)}`, value: m.cents }))}
          formatTick={formatEurRound}
          formatValue={formatEur}
          selectedKey={selected}
          onSelect={setSelected}
        />
      </div>
      <div className="rounded-3xl bg-rose-soft p-3">
        <p className="mb-2 px-1 font-extrabold">
          {monthLabel(current.key, "long")} · {formatEur(current.cents)}
        </p>
        <ul className="space-y-1.5">
          {due.map((i) => (
            <li key={i.id} className="flex items-center gap-3 rounded-2xl bg-white px-4 py-2.5 shadow-soft">
              <span className="w-8 text-center text-sm font-extrabold text-ink-soft">{i.dueDay}</span>
              <span className="min-w-0 flex-1 truncate font-bold">
                {category(i.category).icon} {i.label}
              </span>
              <span className="font-extrabold">{formatEur(i.amountCents)}</span>
            </li>
          ))}
          {due.length === 0 && <li className="p-3 text-center font-semibold text-ink-soft">Rien à payer ce mois-ci</li>}
        </ul>
      </div>
    </div>
  );
}

function ItemForm({ item, defaultPeriod, onDone }: { item?: BudgetItem; defaultPeriod: BudgetPeriod; onDone: () => void }) {
  const qc = useQueryClient();
  const [kind, setKind] = useState<BudgetKind>(item?.kind ?? "EXPENSE");
  const [period, setPeriod] = useState<BudgetPeriod>(item?.period ?? defaultPeriod);
  const [label, setLabel] = useState(item?.label ?? "");
  const [amount, setAmount] = useState(item ? centsToInput(item.amountCents) : "");
  const [cat, setCat] = useState(item?.category ?? "LOGEMENT");
  const [dueDay, setDueDay] = useState(String(item?.dueDay ?? 1));
  const [dueMonth, setDueMonth] = useState(item?.dueMonth ?? 1);
  const [active, setActive] = useState(item?.active ?? true);
  const [note, setNote] = useState(item?.note ?? "");
  const [isPrivate, setIsPrivate] = useState(item?.private ?? true);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const cents = parseEur(amount);

  const changeKind = (k: BudgetKind) => {
    setKind(k);
    setCat(categoriesOf(k)[0][0]);
  };

  const done = () => {
    qc.invalidateQueries({ queryKey: ["budget"] });
    onDone();
  };

  const save = useMutation({
    mutationFn: () => {
      const body: BudgetItemInput = {
        label,
        kind,
        period,
        amountCents: cents ?? 0,
        category: cat,
        dueDay: Math.min(31, Math.max(1, Number(dueDay) || 1)),
        dueMonth: period === "YEARLY" ? dueMonth : null,
        active,
        note: note.trim() || null,
        private: isPrivate,
      };
      return api<BudgetItem>(item ? `/budget/${item.id}` : "/budget", { method: item ? "PATCH" : "POST", json: body });
    },
    onSuccess: done,
  });

  const remove = useMutation({
    mutationFn: () => api(`/budget/${item!.id}`, { method: "DELETE" }),
    onSuccess: done,
  });

  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (cents) save.mutate();
  };

  const pill = (on: boolean) => `rounded-full px-3 py-1.5 text-sm font-bold shadow-soft transition active:scale-95 ${on ? "bg-rose" : "bg-white text-ink-soft"}`;

  return (
    <form onSubmit={submit} className="space-y-4">
      <div className="flex gap-1.5">
        <button type="button" className={`flex-1 ${pill(kind === "EXPENSE")}`} onClick={() => changeKind("EXPENSE")}>
          Charge
        </button>
        <button type="button" className={`flex-1 ${pill(kind === "INCOME")}`} onClick={() => changeKind("INCOME")}>
          Revenu
        </button>
      </div>
      <div className="flex gap-1.5">
        <button type="button" className={`flex-1 ${pill(period === "MONTHLY")}`} onClick={() => setPeriod("MONTHLY")}>
          Chaque mois
        </button>
        <button type="button" className={`flex-1 ${pill(period === "YEARLY")}`} onClick={() => setPeriod("YEARLY")}>
          Chaque année
        </button>
      </div>

      <div>
        <label className="label" htmlFor="budget-label">Nom</label>
        <input id="budget-label" className="input focus:border-rose" placeholder={kind === "INCOME" ? "Salaire, allocations…" : "Loyer, assurance auto, Netflix…"} value={label} onChange={(e) => setLabel(e.target.value)} required />
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="label" htmlFor="budget-amount">Montant (€)</label>
          <input id="budget-amount" className="input focus:border-rose" inputMode="decimal" placeholder="0,00" value={amount} onChange={(e) => setAmount(e.target.value)} required />
        </div>
        <div>
          <label className="label" htmlFor="budget-day">Jour du mois</label>
          <input id="budget-day" className="input focus:border-rose" inputMode="numeric" value={dueDay} onChange={(e) => setDueDay(e.target.value.replace(/\D/g, "").slice(0, 2))} required />
        </div>
      </div>
      {amount && cents === null && <p className="text-sm font-bold text-rose-deep">Montant invalide</p>}

      {period === "YEARLY" && (
        <div>
          <label className="label" htmlFor="budget-month">Mois</label>
          <select id="budget-month" className="input focus:border-rose" value={dueMonth} onChange={(e) => setDueMonth(Number(e.target.value))}>
            {MONTHS.map((m, i) => (
              <option key={m} value={i + 1}>{m}</option>
            ))}
          </select>
          {cents ? <p className="mt-1 text-xs font-semibold text-ink-soft">soit {formatEur(Math.round(cents / 12))} à mettre de côté chaque mois</p> : null}
        </div>
      )}

      <div className="flex flex-wrap gap-1.5">
        {categoriesOf(kind).map(([id, c]) => (
          <button key={id} type="button" className={pill(cat === id)} onClick={() => setCat(id)}>
            {c.icon} {c.label}
          </button>
        ))}
      </div>

      <div>
        <label className="label" htmlFor="budget-note">Note (facultatif)</label>
        <textarea id="budget-note" className="input focus:border-rose" rows={2} value={note} onChange={(e) => setNote(e.target.value)} />
      </div>

      <label className="flex items-center gap-3 rounded-2xl bg-white px-4 py-3 font-bold shadow-soft">
        <input type="checkbox" className="h-5 w-5 accent-rose-deep" checked={active} onChange={(e) => setActive(e.target.checked)} />
        <span>
          Actif
          <span className="block text-xs font-semibold text-ink-soft">Décoche pour suspendre sans supprimer</span>
        </span>
      </label>
      <label className="flex items-center gap-3 rounded-2xl bg-white px-4 py-3 font-bold shadow-soft">
        <input type="checkbox" className="h-5 w-5 accent-rose-deep" checked={isPrivate} onChange={(e) => setIsPrivate(e.target.checked)} />
        <span>
          🔒 Rien que pour moi
          <span className="block text-xs font-semibold text-ink-soft">Décoche pour la partager avec le foyer</span>
        </span>
      </label>

      {save.error && <p className="text-sm font-bold text-rose-deep">{save.error.message}</p>}
      <button className="btn-primary w-full" disabled={save.isPending || !cents}>
        {item ? "Enregistrer" : "Ajouter"}
      </button>

      {item && (
        <div className="text-center">
          {confirmDelete ? (
            <div className="flex justify-center gap-2">
              <button type="button" className="btn-ghost" onClick={() => setConfirmDelete(false)}>
                Annuler
              </button>
              <button type="button" className="btn bg-rose-deep text-white" onClick={() => remove.mutate()} disabled={remove.isPending}>
                Supprimer
              </button>
            </div>
          ) : (
            <button type="button" className="text-sm font-bold text-ink-soft" onClick={() => setConfirmDelete(true)}>
              Supprimer la ligne
            </button>
          )}
        </div>
      )}
    </form>
  );
}

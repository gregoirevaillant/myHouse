import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { Link } from "react-router-dom";
import { BarChart, type Bar } from "../components/BarChart";
import { BudgetTabs } from "../components/BudgetTabs";
import { CategoryPicker } from "../components/CategoryPicker";
import { Modal } from "../components/Modal";
import type { BudgetTransaction } from "../lib/api";
import {
  category,
  consentWarning,
  signedEur,
  useBudgetMonth,
  useBudgetTrend,
  useSetTransactionCategory,
  useSyncBank,
} from "../lib/budget";
import { monthKey, monthLabel, shiftMonth, shortDate, toIso } from "../lib/dates";
import { formatEur, formatEurRound } from "../lib/money";

const AUTO_SYNC_AFTER = 6 * 60 * 60 * 1000;

export function Budget() {
  const currentMonth = monthKey(toIso(new Date()));
  const [month, setMonth] = useState(currentMonth);
  const [filter, setFilter] = useState<string | null>(null);
  const [editing, setEditing] = useState<BudgetTransaction | null>(null);
  const { data, isLoading } = useBudgetMonth(month);
  const { data: trend = [] } = useBudgetTrend(currentMonth);
  const sync = useSyncBank();

  // à l'ouverture, on rafraîchit si la dernière synchro date un peu
  const autoSynced = useRef(false);
  useEffect(() => {
    if (!data?.bank.enabled || !data.bank.connected || autoSynced.current) return;
    const last = data.bank.lastSyncAt ? new Date(data.bank.lastSyncAt).getTime() : 0;
    autoSynced.current = true;
    if (Date.now() - last > AUTO_SYNC_AFTER) sync.mutate();
  }, [data, sync]);

  const expenseCategories = useMemo(
    () =>
      Object.entries(data?.byCategory ?? {})
        .filter(([id, cents]) => category(id).kind === "EXPENSE" && cents < 0)
        .map(([id, cents]) => ({ id, cents: -cents }))
        .sort((a, b) => b.cents - a.cents),
    [data],
  );
  const maxCategory = Math.max(1, ...expenseCategories.map((c) => c.cents));

  const trendBars: Bar[] = trend.map((t) => ({
    key: t.month,
    label: monthLabel(t.month, "long"),
    tooltip: monthLabel(t.month, "long"),
    axisLabel: monthLabel(t.month, "short").charAt(0).toUpperCase(),
    value: Math.max(0, t.outflow),
  }));

  if (isLoading || !data) {
    return (
      <section>
        <Header />
        <p className="text-center text-ink-soft">Chargement…</p>
      </section>
    );
  }

  const { totals, bank } = data;
  const left = totals.income - totals.outflow - totals.invested;
  const upcoming = data.recurring.filter((r) => r.upcoming.length);
  const upcomingCents = upcoming.reduce((s, r) => s + r.amountCents * r.upcoming.length, 0);
  const warning = consentWarning(bank.consentUntil);
  const transactions = filter ? data.transactions.filter((t) => t.category === filter) : data.transactions;

  return (
    <section>
      <Header
        action={
          bank.connected && (
            <button className="btn bg-rose px-4 py-2 shadow-soft" onClick={() => sync.mutate()} disabled={sync.isPending || !bank.enabled}>
              {sync.isPending ? "Synchro…" : "↻ Synchroniser"}
            </button>
          )
        }
      />
      <BudgetTabs />

      {!bank.connected ? (
        <div className="rounded-3xl bg-rose-soft p-8 text-center">
          <p className="text-3xl">🏦</p>
          <p className="mt-2 font-extrabold">Connecte ta banque</p>
          <p className="mt-1 text-sm font-semibold text-ink-soft">
            Revenus, dépenses, abonnements et épargne seront calculés automatiquement à partir de tes opérations.
          </p>
          <Link to="/budget/banque" className="btn-primary mt-4">
            Connecter une banque
          </Link>
        </div>
      ) : (
        <>
          {warning && (
            <Link to="/budget/banque" className="mb-4 block rounded-2xl bg-peach px-4 py-3 text-sm font-bold shadow-soft">
              ⚠️ {warning}
            </Link>
          )}
          {sync.data?.errors.length ? (
            <p className="mb-4 rounded-2xl bg-rose-soft px-4 py-3 text-sm font-semibold text-rose-deep">{sync.data.errors.join(" · ")}</p>
          ) : null}
          {sync.error && <p className="mb-4 rounded-2xl bg-rose-soft px-4 py-3 text-sm font-semibold text-rose-deep">{sync.error.message}</p>}

          {/* navigation mois */}
          <div className="mb-4 flex items-center justify-between rounded-2xl bg-white p-2 shadow-soft">
            <button className="btn px-4 py-2 hover:bg-rose-soft" onClick={() => setMonth(shiftMonth(month, -1))} aria-label="Mois précédent">
              ◀
            </button>
            <button className="text-center" onClick={() => setMonth(currentMonth)}>
              <p className="font-extrabold capitalize">{monthLabel(month, "long")}</p>
              <p className="text-xs font-semibold text-ink-soft">{month === currentMonth ? "Ce mois-ci" : "Revenir à ce mois"}</p>
            </button>
            <button
              className="btn px-4 py-2 hover:bg-rose-soft"
              onClick={() => setMonth(shiftMonth(month, 1))}
              disabled={month >= currentMonth}
              aria-label="Mois suivant"
            >
              ▶
            </button>
          </div>

          {/* bilan du mois */}
          <div className="mb-4 rounded-3xl bg-white p-5 shadow-soft">
            <p className="text-sm font-bold text-ink-soft">Reste</p>
            <p className={`text-4xl font-extrabold ${left < 0 ? "text-rose-deep" : ""}`}>{formatEur(left)}</p>
            {month === currentMonth && upcomingCents !== 0 && (
              <p className="mt-1 text-sm font-semibold text-ink-soft">
                après les échéances à venir : <span className="text-ink">{formatEur(left + upcomingCents)}</span>
              </p>
            )}
            <div className="mt-4 grid grid-cols-3 gap-2 text-center">
              <Stat label="Revenus" cents={totals.income} className="bg-mint-soft" />
              <Stat label="Dépenses" cents={totals.outflow} className="bg-peach-soft" />
              <Stat label="Épargné" cents={totals.invested} className="bg-lavender-soft" />
            </div>
            {data.householdShareCents > 0 && (
              <p className="mt-3 text-xs font-semibold text-ink-soft">
                Dont ta part des dépenses du foyer : {formatEur(data.householdShareCents)} (déjà comptée dans tes opérations)
              </p>
            )}
          </div>

          {/* répartition des dépenses */}
          {expenseCategories.length > 0 && (
            <div className="mb-4 rounded-3xl bg-white p-5 shadow-soft">
              <p className="mb-3 text-sm font-bold text-ink-soft">Où part l'argent</p>
              <ul className="space-y-2">
                {expenseCategories.map(({ id, cents }) => {
                  const c = category(id);
                  return (
                    <li key={id}>
                      <button
                        className={`w-full rounded-xl px-2 py-1 text-left transition ${filter === id ? "bg-rose-soft" : ""}`}
                        onClick={() => setFilter(filter === id ? null : id)}
                      >
                        <span className="flex justify-between text-sm font-bold">
                          <span>
                            {c.icon} {c.label}
                          </span>
                          <span className="tabular-nums">{formatEur(cents)}</span>
                        </span>
                        <span className="mt-1 block h-2 overflow-hidden rounded-full bg-cream">
                          <span className={`block h-full rounded-full ${c.color}`} style={{ width: `${(cents / maxCategory) * 100}%` }} />
                        </span>
                      </button>
                    </li>
                  );
                })}
              </ul>
            </div>
          )}

          {/* échéances à venir */}
          {month === currentMonth && upcoming.length > 0 && (
            <div className="mb-4 rounded-3xl bg-lavender-soft p-5">
              <p className="mb-3 text-sm font-bold text-ink-soft">À venir ce mois-ci</p>
              <ul className="space-y-2">
                {upcoming.map((r) => (
                  <li key={r.id} className="flex items-center justify-between gap-3 text-sm font-bold">
                    <span className="min-w-0 truncate">
                      {category(r.category).icon} {r.label}
                    </span>
                    <span className="shrink-0 text-right tabular-nums">
                      {signedEur(r.amountCents, formatEur)}
                      <span className="block text-xs font-semibold text-ink-soft">{r.upcoming.map(shortDate).join(", ")}</span>
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {/* tendance */}
          <div className="mb-4 rounded-3xl bg-white p-5 shadow-soft">
            <p className="mb-4 text-sm font-bold text-ink-soft">Dépenses · 12 derniers mois</p>
            <BarChart
              title="Dépenses par mois"
              bars={trendBars}
              selectedKey={month}
              onSelect={setMonth}
              formatTick={formatEurRound}
              formatValue={formatEur}
            />
          </div>

          {/* opérations */}
          <div className="mb-2 flex items-center justify-between">
            <p className="text-sm font-bold text-ink-soft">
              Opérations{filter && ` · ${category(filter).label}`}
            </p>
            {filter && (
              <button className="text-sm font-bold text-rose-deep" onClick={() => setFilter(null)}>
                Tout voir
              </button>
            )}
          </div>
          {transactions.length === 0 ? (
            <div className="rounded-3xl bg-rose-soft p-8 text-center text-ink-soft">
              <p className="text-3xl">🧾</p>
              <p className="mt-2 font-semibold">Aucune opération ce mois-ci</p>
            </div>
          ) : (
            <ul className="space-y-2">
              {transactions.map((t) => {
                const c = category(t.category);
                return (
                  <li key={t.id}>
                    <button
                      onClick={() => setEditing(t)}
                      className={`flex w-full items-center gap-3 rounded-2xl bg-white px-4 py-3 text-left shadow-soft transition active:scale-[0.98] ${
                        c.kind === "TRANSFER" ? "opacity-60" : ""
                      }`}
                    >
                      <span className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl ${c.color}`}>{c.icon}</span>
                      <span className="min-w-0 flex-1">
                        <span className="block truncate font-bold">{t.label}</span>
                        <span className="block truncate text-xs font-semibold text-ink-soft">
                          {shortDate(t.date)} · {c.label}
                          {t.recurringId && " · 🔁"}
                        </span>
                      </span>
                      <span className={`font-extrabold tabular-nums ${t.amountCents > 0 ? "text-mint-deep" : ""}`}>
                        {signedEur(t.amountCents, formatEur)}
                      </span>
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </>
      )}

      {editing && <TransactionModal transaction={editing} onClose={() => setEditing(null)} />}
    </section>
  );
}

function Header({ action }: { action?: ReactNode }) {
  return (
    <div className="mb-4 flex items-center justify-between">
      <h2 className="flex items-center gap-2 text-lg font-extrabold">
        <span className="rounded-xl bg-rose px-2 py-1">📊</span> Budget
      </h2>
      {action}
    </div>
  );
}

function Stat({ label, cents, className }: { label: string; cents: number; className: string }) {
  return (
    <div className={`rounded-2xl px-2 py-3 ${className}`}>
      <p className="text-xs font-bold text-ink-soft">{label}</p>
      <p className="font-extrabold tabular-nums">{formatEurRound(cents)}</p>
    </div>
  );
}

function TransactionModal({ transaction: t, onClose }: { transaction: BudgetTransaction; onClose: () => void }) {
  const save = useSetTransactionCategory();
  return (
    <Modal title={t.label} onClose={onClose}>
      <div className="mb-4 rounded-2xl bg-white p-4 shadow-soft">
        <p className="text-2xl font-extrabold tabular-nums">{signedEur(t.amountCents, formatEur)}</p>
        <p className="text-sm font-semibold text-ink-soft">
          {shortDate(t.date)} · {t.accountName}
        </p>
        {t.detail && <p className="mt-1 break-words text-xs font-semibold text-ink-soft">{t.detail}</p>}
      </div>
      <p className="mb-3 text-sm font-semibold text-ink-soft">
        La catégorie choisie sera retenue pour les prochaines opérations au même libellé.
      </p>
      {save.error && <p className="mb-3 text-sm font-semibold text-rose-deep">{save.error.message}</p>}
      <CategoryPicker
        value={t.category}
        disabled={save.isPending}
        onPick={(id) => save.mutate({ id: t.id, category: id }, { onSuccess: onClose })}
      />
    </Modal>
  );
}

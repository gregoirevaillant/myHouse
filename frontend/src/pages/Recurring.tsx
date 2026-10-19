import { useState } from "react";
import { BudgetTabs } from "../components/BudgetTabs";
import { CategoryPicker } from "../components/CategoryPicker";
import { Modal } from "../components/Modal";
import type { RecurringItem } from "../lib/api";
import { category, PERIOD_LABELS, signedEur, useRecurring, useUpdateRecurring } from "../lib/budget";
import { shortDate } from "../lib/dates";
import { formatEur, formatEurRound } from "../lib/money";

const SECTIONS: { title: string; icon: string; className: string; match: (i: RecurringItem) => boolean }[] = [
  { title: "Revenus", icon: "💼", className: "bg-mint-soft", match: (i) => category(i.category).kind === "INCOME" },
  { title: "Abonnements", icon: "🔁", className: "bg-lavender-soft", match: (i) => i.category === "SUBSCRIPTIONS" },
  {
    title: "Charges fixes",
    icon: "🏠",
    className: "bg-peach-soft",
    match: (i) => category(i.category).kind === "EXPENSE" && i.category !== "SUBSCRIPTIONS",
  },
  { title: "Épargne & investissement", icon: "📈", className: "bg-sky-soft", match: (i) => category(i.category).kind === "INVESTMENT" },
];

export function Recurring() {
  const { data: items = [], isLoading } = useRecurring();
  const [editing, setEditing] = useState<RecurringItem | null>(null);
  const [showOthers, setShowOthers] = useState(false);

  const active = items.filter((i) => i.status === "ACTIVE");
  const others = items.filter((i) => i.status !== "ACTIVE");
  const monthly = (match: (i: RecurringItem) => boolean) => active.filter(match).reduce((s, i) => s + i.monthlyCents, 0);
  const income = monthly(SECTIONS[0].match);
  const fixed = -monthly((i) => category(i.category).kind === "EXPENSE");
  const invested = -monthly(SECTIONS[3].match);
  const subscriptions = -monthly(SECTIONS[1].match);

  return (
    <section>
      <div className="mb-4 flex items-center justify-between">
        <h2 className="flex items-center gap-2 text-lg font-extrabold">
          <span className="rounded-xl bg-rose px-2 py-1">📊</span> Budget
        </h2>
      </div>
      <BudgetTabs />

      {isLoading ? (
        <p className="text-center text-ink-soft">Chargement…</p>
      ) : items.length === 0 ? (
        <div className="rounded-3xl bg-rose-soft p-8 text-center text-ink-soft">
          <p className="text-3xl">🔁</p>
          <p className="mt-2 font-semibold">Rien de récurrent repéré pour l'instant</p>
          <p className="mt-1 text-sm">Les abonnements, salaires et prélèvements apparaissent après quelques mois d'historique.</p>
        </div>
      ) : (
        <>
          <div className="mb-4 rounded-3xl bg-white p-5 shadow-soft">
            <p className="text-sm font-bold text-ink-soft">Chaque mois, hors imprévus</p>
            <p className={`text-4xl font-extrabold ${income - fixed - invested < 0 ? "text-rose-deep" : ""}`}>
              {formatEur(income - fixed - invested)}
            </p>
            <p className="text-sm font-semibold text-ink-soft">de reste après le fixe et l'épargne</p>
            <div className="mt-3 flex flex-wrap gap-x-5 gap-y-1 text-sm font-semibold text-ink-soft">
              <span>
                Revenus <span className="text-ink">{formatEurRound(income)}</span>
              </span>
              <span>
                Fixe <span className="text-ink">{formatEurRound(fixed)}</span>
              </span>
              <span>
                Épargne <span className="text-ink">{formatEurRound(invested)}</span>
              </span>
            </div>
            {subscriptions > 0 && (
              <p className="mt-3 rounded-2xl bg-lavender-soft px-3 py-2 text-sm font-bold">
                🔁 Abonnements : {formatEur(subscriptions)} / mois, soit {formatEurRound(subscriptions * 12)} / an
              </p>
            )}
          </div>

          {SECTIONS.map((s) => {
            const list = active.filter(s.match);
            if (!list.length) return null;
            return (
              <div key={s.title} className={`mb-4 rounded-3xl p-4 ${s.className}`}>
                <p className="mb-3 flex justify-between px-1 text-sm font-extrabold">
                  <span>
                    {s.icon} {s.title}
                  </span>
                  <span className="tabular-nums">{formatEur(Math.abs(list.reduce((sum, i) => sum + i.monthlyCents, 0)))} / mois</span>
                </p>
                <ul className="space-y-2">
                  {list.map((i) => (
                    <ItemRow key={i.id} item={i} onClick={() => setEditing(i)} />
                  ))}
                </ul>
              </div>
            );
          })}

          {others.length > 0 && (
            <div className="mt-6">
              <button className="mb-2 text-sm font-bold text-ink-soft" onClick={() => setShowOthers(!showOthers)}>
                {showOthers ? "▾" : "▸"} Terminés et ignorés ({others.length})
              </button>
              {showOthers && (
                <ul className="space-y-2 opacity-70">
                  {others.map((i) => (
                    <ItemRow key={i.id} item={i} onClick={() => setEditing(i)} />
                  ))}
                </ul>
              )}
            </div>
          )}
        </>
      )}

      {editing && <RecurringModal item={editing} onClose={() => setEditing(null)} />}
    </section>
  );
}

function ItemRow({ item: i, onClick }: { item: RecurringItem; onClick: () => void }) {
  const c = category(i.category);
  const status = i.status === "ENDED" ? `terminé · dernier le ${shortDate(i.lastDate)}` : i.status === "DISMISSED" ? "ignoré" : `prochain le ${shortDate(i.nextDate)}`;
  return (
    <li>
      <button
        onClick={onClick}
        className="flex w-full items-center gap-3 rounded-2xl bg-white px-4 py-3 text-left shadow-soft transition active:scale-[0.98]"
      >
        <span className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl ${c.color}`}>{c.icon}</span>
        <span className="min-w-0 flex-1">
          <span className="block truncate font-bold">{i.label}</span>
          <span className="block truncate text-xs font-semibold text-ink-soft">
            {PERIOD_LABELS[i.period]} · {status}
          </span>
        </span>
        <span className="text-right font-extrabold tabular-nums">
          {signedEur(i.amountCents, formatEur)}
          {i.period !== "MONTHLY" && (
            <span className="block text-xs font-semibold text-ink-soft">≈ {formatEur(Math.abs(i.monthlyCents))} / mois</span>
          )}
        </span>
      </button>
    </li>
  );
}

function RecurringModal({ item, onClose }: { item: RecurringItem; onClose: () => void }) {
  const update = useUpdateRecurring();
  const dismissed = item.status === "DISMISSED";
  return (
    <Modal title={item.label} onClose={onClose}>
      <div className="mb-4 rounded-2xl bg-white p-4 shadow-soft">
        <p className="text-2xl font-extrabold tabular-nums">{signedEur(item.amountCents, formatEur)}</p>
        <p className="text-sm font-semibold text-ink-soft">
          {PERIOD_LABELS[item.period]} · dernier le {shortDate(item.lastDate)}
        </p>
      </div>
      {update.error && <p className="mb-3 text-sm font-semibold text-rose-deep">{update.error.message}</p>}
      <button
        className="btn-ghost mb-5 w-full"
        disabled={update.isPending}
        onClick={() => update.mutate({ id: item.id, status: dismissed ? "ACTIVE" : "DISMISSED" }, { onSuccess: onClose })}
      >
        {dismissed ? "↩︎ C'est bien récurrent" : "🚫 Ce n'est pas récurrent"}
      </button>
      <CategoryPicker
        value={item.category}
        disabled={update.isPending}
        onPick={(id) => update.mutate({ id: item.id, category: id }, { onSuccess: onClose })}
      />
    </Modal>
  );
}

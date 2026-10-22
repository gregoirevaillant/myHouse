import { useMemo, type ReactNode } from "react";
import type { Expense, Member } from "../lib/api";
import { addDays, fromIso, monthKey, monthLabel, shiftMonth, shortDate } from "../lib/dates";
import { formatEur, formatEurRound } from "../lib/money";
import { BarChart, type Bar } from "./BarChart";
import { ExpenseRow } from "./ExpenseRow";

// au-delà de deux mois, le graphique passe de « par jour » à « par mois »
const DAILY_MAX_DAYS = 62;
const MEMBER_COLORS = ["bg-sky-deep", "bg-peach-deep"];
const WEEKDAYS = ["lundi", "mardi", "mercredi", "jeudi", "vendredi", "samedi", "dimanche"];

const longDate = (iso: string) => fromIso(iso).toLocaleDateString("fr-FR", { day: "numeric", month: "long", year: "numeric" });
const daysBetween = (a: string, b: string) => Math.round((fromIso(b).getTime() - fromIso(a).getTime()) / 86_400_000) + 1;
const sum = (list: Expense[]) => list.reduce((s, e) => s + e.amountCents, 0);

function Tile({ label, value, sub, className = "bg-white" }: { label: string; value: ReactNode; sub?: ReactNode; className?: string }) {
  return (
    <div className={`rounded-3xl p-4 shadow-soft ${className}`}>
      <p className="text-xs font-bold text-ink-soft">{label}</p>
      <p className="mt-0.5 text-xl font-extrabold leading-tight">{value}</p>
      {sub && <p className="mt-0.5 text-xs font-semibold text-ink-soft">{sub}</p>}
    </div>
  );
}

// part de chacun sous forme de barre empilée, avec les montants dessous
function Split({ title, members, amounts }: { title: string; members: Member[]; amounts: number[] }) {
  const total = amounts.reduce((s, v) => s + v, 0);
  return (
    <div>
      <p className="mb-2 text-sm font-bold text-ink-soft">{title}</p>
      <div className="flex h-4 overflow-hidden rounded-full bg-ink/10">
        {members.map((m, i) => (
          <span key={m.id} className={MEMBER_COLORS[i % MEMBER_COLORS.length]} style={{ width: `${total ? (amounts[i] / total) * 100 : 0}%` }} />
        ))}
      </div>
      <div className="mt-2 flex flex-wrap justify-between gap-x-4 gap-y-1 text-sm font-semibold">
        {members.map((m, i) => (
          <span key={m.id} className="flex items-center gap-1.5">
            <span className={`h-2.5 w-2.5 rounded-full ${MEMBER_COLORS[i % MEMBER_COLORS.length]}`} />
            {m.name} <span className="tabular-nums">{formatEur(amounts[i])}</span>
            <span className="text-ink-soft">· {total ? Math.round((amounts[i] / total) * 100) : 0} %</span>
          </span>
        ))}
      </div>
    </div>
  );
}

// Bilan d'un carnet sur toute sa durée, sans filtre de date
export function TrackerSummary({
  expenses,
  members,
  meId,
  onOpen,
}: {
  expenses: Expense[];
  members: Member[];
  meId?: string;
  onOpen: (e: Expense) => void;
}) {
  const name = (id: string) => members.find((m) => m.id === id)?.name ?? "?";
  const spending = useMemo(() => expenses.filter((e) => !e.isReimbursement), [expenses]);
  const reimbursements = expenses.filter((e) => e.isReimbursement);
  const total = sum(spending);
  const dates = expenses.map((e) => e.date).sort();
  const [first, last] = [dates[0], dates[dates.length - 1]];
  const days = first ? daysBetween(first, last) : 0;
  const daily = days <= DAILY_MAX_DAYS;

  const timeBars: Bar[] = useMemo(() => {
    if (!first) return [];
    if (daily) {
      return Array.from({ length: days }, (_, i) => {
        const iso = addDays(first, i);
        const step = Math.max(1, Math.ceil(days / 8));
        return {
          key: iso,
          label: shortDate(iso),
          tooltip: fromIso(iso).toLocaleDateString("fr-FR", { weekday: "short", day: "numeric", month: "short" }),
          axisLabel: i % step === 0 ? String(fromIso(iso).getDate()) : "",
          value: sum(spending.filter((e) => e.date === iso)),
        };
      });
    }
    const months: string[] = [];
    for (let k = monthKey(first); k <= monthKey(last); k = shiftMonth(k, 1)) months.push(k);
    const step = Math.max(1, Math.ceil(months.length / 12));
    return months.map((key, i) => ({
      key,
      label: monthLabel(key, "long"),
      tooltip: monthLabel(key, "long"),
      // sur plusieurs années, on repère les janviers par l'année
      axisLabel:
        months.length > 12 ? (key.endsWith("-01") ? key.slice(2, 4) : "") : i % step === 0 ? monthLabel(key, "short").charAt(0).toUpperCase() : "",
      value: sum(spending.filter((e) => monthKey(e.date) === key)),
    }));
  }, [spending, first, last, days, daily]);

  const weekdayBars: Bar[] = useMemo(
    () =>
      WEEKDAYS.map((d, i) => ({
        key: d,
        label: d,
        tooltip: d.charAt(0).toUpperCase() + d.slice(1),
        axisLabel: d.charAt(0).toUpperCase(),
        value: sum(spending.filter((e) => (fromIso(e.date).getDay() + 6) % 7 === i)),
      })),
    [spending],
  );

  if (!expenses.length) {
    return (
      <div className="rounded-3xl bg-sky-soft p-8 text-center text-ink-soft">
        <p className="text-3xl">📊</p>
        <p className="mt-2 font-semibold">Pas encore de dépense à résumer</p>
      </div>
    );
  }

  const biggest = [...spending].sort((a, b) => b.amountCents - a.amountCents);
  const byDay = new Map<string, number>();
  for (const e of spending) byDay.set(e.date, (byDay.get(e.date) ?? 0) + e.amountCents);
  const [topDay] = [...byDay].sort((a, b) => b[1] - a[1]);
  const months = Math.max(1, Math.round(days / 30.44));
  const paid = members.map((m) => sum(spending.filter((e) => e.paidById === m.id)));
  const shares = members.map((m) => spending.reduce((s, e) => s + (e.shares.find((x) => x.userId === m.id)?.amountCents ?? 0), 0));

  // liste complète, groupée par mois, du plus récent au plus ancien
  const groups = new Map<string, Expense[]>();
  for (const e of [...expenses].sort((a, b) => b.date.localeCompare(a.date))) {
    const key = monthKey(e.date);
    groups.set(key, [...(groups.get(key) ?? []), e]);
  }

  return (
    <div className="space-y-4">
      <div className="rounded-3xl bg-white p-5 shadow-soft">
        <p className="text-sm font-bold text-ink-soft">Total dépensé</p>
        <p className="text-4xl font-extrabold tabular-nums">{formatEur(total)}</p>
        <p className="mt-1 text-sm font-semibold text-ink-soft">
          {first === last ? `le ${longDate(first)}` : `du ${longDate(first)} au ${longDate(last)}`} · {days} jour{days > 1 ? "s" : ""}
        </p>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <Tile label="Dépenses" value={spending.length} sub={spending.length ? `${formatEur(Math.round(total / spending.length))} en moyenne` : undefined} className="bg-sky-soft" />
        {daily ? (
          <Tile label="Par jour" value={formatEur(Math.round(total / days))} sub="en moyenne" className="bg-mint-soft" />
        ) : (
          <Tile label="Par mois" value={formatEur(Math.round(total / months))} sub="en moyenne" className="bg-mint-soft" />
        )}
        {biggest[0] && (
          <Tile
            label="Plus grosse dépense"
            value={formatEur(biggest[0].amountCents)}
            sub={<span className="block truncate">{biggest[0].title} · {shortDate(biggest[0].date)}</span>}
            className="bg-peach-soft"
          />
        )}
        {topDay && <Tile label="Journée la plus chère" value={formatEur(topDay[1])} sub={longDate(topDay[0])} className="bg-lavender-soft" />}
        <Tile
          label="Remboursements"
          value={reimbursements.length}
          sub={reimbursements.length ? `${formatEur(sum(reimbursements))} au total` : "aucun"}
          className="bg-lemon-soft"
        />
        <Tile label="Durée" value={`${days} jour${days > 1 ? "s" : ""}`} sub={days > 45 ? `≈ ${months} mois` : undefined} className="bg-rose-soft" />
      </div>

      {members.length > 0 && (
        <div className="space-y-5 rounded-3xl bg-white p-5 shadow-soft">
          <Split title="Qui a payé" members={members} amounts={paid} />
          <Split title="La part de chacun" members={members} amounts={shares} />
        </div>
      )}

      <div className="space-y-6 rounded-3xl bg-white p-5 shadow-soft">
        <div>
          <p className="mb-4 text-sm font-bold text-ink-soft">{daily ? "Par jour" : "Par mois"} · toute la durée</p>
          <BarChart title={daily ? "Dépenses par jour" : "Dépenses par mois"} bars={timeBars} formatTick={formatEurRound} formatValue={formatEur} />
        </div>
        <div>
          <p className="mb-4 text-sm font-bold text-ink-soft">Par jour de la semaine</p>
          <BarChart title="Dépenses par jour de la semaine" bars={weekdayBars} formatTick={formatEurRound} formatValue={formatEur} />
        </div>
      </div>

      {biggest.length > 1 && (
        <div className="rounded-3xl bg-white p-5 shadow-soft">
          <p className="mb-3 text-sm font-bold text-ink-soft">Les plus grosses dépenses</p>
          <ol className="space-y-2">
            {biggest.slice(0, 5).map((e, i) => (
              <li key={e.id} className="flex items-center gap-3">
                <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-sky-soft text-xs font-extrabold">{i + 1}</span>
                <span className="min-w-0 flex-1 truncate font-bold">{e.title}</span>
                <span className="font-extrabold tabular-nums">{formatEur(e.amountCents)}</span>
              </li>
            ))}
          </ol>
        </div>
      )}

      <div className="space-y-4 pt-2">
        <p className="text-sm font-bold text-ink-soft">Toutes les dépenses · {expenses.length}</p>
        {[...groups].map(([key, list]) => (
          <div key={key}>
            <p className="mb-2 flex justify-between px-1 text-sm font-extrabold capitalize">
              <span>{monthLabel(key, "long")}</span>
              <span className="tabular-nums text-ink-soft">{formatEur(sum(list.filter((e) => !e.isReimbursement)))}</span>
            </p>
            <ul className="space-y-2">
              {list.map((e) => (
                <ExpenseRow key={e.id} expense={e} meId={meId} name={name} onOpen={onOpen} />
              ))}
            </ul>
          </div>
        ))}
      </div>
    </div>
  );
}

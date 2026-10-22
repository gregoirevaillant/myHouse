import type { Expense } from "../lib/api";
import { shortDate } from "../lib/dates";
import { formatEur } from "../lib/money";

export function ExpenseRow({
  expense: e,
  meId,
  name,
  onOpen,
}: {
  expense: Expense;
  meId?: string;
  name: (userId: string) => string;
  onOpen: (e: Expense) => void;
}) {
  const myShare = e.shares.find((s) => s.userId === meId)?.amountCents ?? 0;
  return (
    <li>
      <button
        onClick={() => onOpen(e)}
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
          {!e.isReimbursement && <span className="block text-xs font-semibold tabular-nums text-ink-soft">ma part {formatEur(myShare)}</span>}
        </span>
      </button>
    </li>
  );
}

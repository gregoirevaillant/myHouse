import { CATEGORIES, KIND_LABELS, type Kind } from "../lib/budget";

const KINDS: Kind[] = ["EXPENSE", "INCOME", "INVESTMENT", "TRANSFER"];

export function CategoryPicker({ value, onPick, disabled }: { value: string; onPick: (id: string) => void; disabled?: boolean }) {
  return (
    <div className="space-y-4">
      {KINDS.map((kind) => (
        <div key={kind}>
          <p className="label">{KIND_LABELS[kind]}</p>
          <div className="grid grid-cols-2 gap-2">
            {Object.entries(CATEGORIES)
              .filter(([, c]) => c.kind === kind)
              .map(([id, c]) => (
                <button
                  key={id}
                  type="button"
                  disabled={disabled}
                  onClick={() => onPick(id)}
                  className={`flex items-center gap-2 rounded-2xl px-3 py-2 text-left text-sm font-bold shadow-soft transition active:scale-95 disabled:opacity-50 ${
                    id === value ? "bg-ink text-white" : "bg-white"
                  }`}
                >
                  <span>{c.icon}</span>
                  <span className="truncate">{c.label}</span>
                </button>
              ))}
          </div>
        </div>
      ))}
    </div>
  );
}

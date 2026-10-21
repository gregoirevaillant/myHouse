// note de 1 à 5 ; toucher l'étoile déjà choisie retire la note
export function Stars({ value, onChange, size = "text-2xl" }: { value: number | null; onChange?: (v: number | null) => void; size?: string }) {
  if (!onChange) {
    if (!value) return null;
    return (
      <span className="whitespace-nowrap text-sm text-peach-deep" aria-label={`${value} sur 5`}>
        {"★".repeat(value)}
        <span className="text-ink-soft/30">{"★".repeat(5 - value)}</span>
      </span>
    );
  }
  return (
    <div className="flex">
      {[1, 2, 3, 4, 5].map((n) => (
        <button
          key={n}
          type="button"
          onClick={() => onChange(value === n ? null : n)}
          aria-label={`${n} étoile${n > 1 ? "s" : ""}`}
          className={`px-0.5 ${size} leading-none transition active:scale-90 ${value && n <= value ? "text-peach-deep" : "text-ink-soft/30"}`}
        >
          ★
        </button>
      ))}
    </div>
  );
}

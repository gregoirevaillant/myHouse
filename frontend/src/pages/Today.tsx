import { RefreshButton } from "../components/health/RefreshButton";
import { fromIso } from "../lib/dates";
import { fr, n } from "../lib/health";
import { useToday, type Signal, type Tone } from "../lib/today";

const BG: Record<string, string> = { push: "bg-mint", easy: "bg-lemon", rest: "bg-rose", unknown: "bg-lavender" };
const DOT: Record<Tone, string> = { good: "bg-mint-deep", ok: "bg-lemon-deep", bad: "bg-rose-deep", none: "bg-ink/20" };

function Row({ s }: { s: Signal }) {
  return (
    <li className="flex items-center gap-3 py-2.5">
      <span className="text-xl">{s.icon}</span>
      <div className="min-w-0 flex-1">
        <p className="font-bold">{s.label}</p>
        {s.ref && <p className="text-xs font-semibold text-ink-soft">{s.ref}</p>}
      </div>
      <span className="text-right text-sm font-extrabold">{s.value}</span>
      <span className={`h-3 w-3 shrink-0 rounded-full ${DOT[s.tone]}`} aria-hidden />
    </li>
  );
}

export function Today() {
  const { today: t, loading, error, empty } = useToday();
  return (
    <section className="overflow-x-clip">
      <div className="mb-4 flex items-center justify-between">
        <h2 className="flex items-center gap-2 text-lg font-extrabold"><span className="rounded-xl bg-lemon px-2 py-1">🌅</span> Aujourd'hui</h2>
        <RefreshButton />
      </div>
      {loading ? <p className="py-8 text-center text-ink-soft">Chargement…</p>
        : error ? <p className="rounded-3xl bg-rose-soft p-4 text-center text-sm font-bold">{error.message}</p>
        : empty || !t ? (
          <div className="rounded-3xl bg-white p-6 text-center shadow-soft">
            <p className="text-3xl">📭</p>
            <p className="mt-2 font-extrabold">Pas encore de données</p>
            <p className="mt-1 text-sm font-semibold text-ink-soft">Appuie sur « Actualiser » pour récupérer tes données Garmin.</p>
          </div>
        ) : (
          <>
            <div className={`mb-4 rounded-3xl p-5 shadow-soft ${BG[t.verdict.id]}`}>
              <p className="text-xs font-extrabold uppercase tracking-wide text-ink/60">{fromIso(t.date).toLocaleDateString("fr-FR", { weekday: "long", day: "numeric", month: "long" })}</p>
              <div className="mt-2 flex items-center gap-4">
                <span className="text-5xl">{t.verdict.icon}</span>
                <div className="min-w-0 flex-1">
                  <p className="text-2xl font-extrabold leading-tight">{t.verdict.title}</p>
                  {t.score !== null && <p className="text-sm font-bold text-ink/60">Récupération {t.score} / 100</p>}
                </div>
              </div>
              <p className="mt-3 text-sm font-semibold">{t.verdict.text}</p>
              {t.nightDate === null && <p className="mt-2 text-xs font-bold text-ink/60">Aucune nuit mesurée la nuit dernière.</p>}
            </div>

            <div className="mb-4 rounded-3xl bg-white p-4 shadow-soft">
              <p className="text-xs font-extrabold uppercase tracking-wide text-ink-soft">Séance du jour</p>
              <p className="mt-1 flex items-center gap-2 text-xl font-extrabold"><span>{t.session.icon}</span>{t.session.title}</p>
              <p className="mt-1 text-sm font-semibold text-ink-soft">{t.session.text}</p>
              {t.race && <p className="mt-3 rounded-2xl bg-lemon px-3 py-2 text-center text-sm font-bold">{t.race.name} dans <span className="text-lg font-extrabold">{t.race.days}</span> jours</p>}
            </div>

            {t.signals.length > 0 && (
              <div className="mb-4 rounded-3xl bg-white p-4 shadow-soft">
                <h3 className="font-extrabold">Pourquoi ce verdict</h3>
                <p className="mb-1 text-xs font-semibold text-ink-soft">Chaque mesure est comparée à ta normale des 4 dernières semaines.</p>
                <ul className="divide-y divide-ink/10">{t.signals.map((s) => <Row key={s.key} s={s} />)}</ul>
              </div>
            )}

            <div className="mb-4 rounded-3xl bg-white p-4 shadow-soft">
              <h3 className="mb-3 font-extrabold">Cette semaine</h3>
              <div className="grid grid-cols-2 gap-2 text-sm font-bold">
                <div className="rounded-2xl bg-cream p-3"><p className="text-xs text-ink-soft">Courses</p><p className="text-lg font-extrabold">{t.week.runs}/{t.week.goal}</p><p className="text-xs font-semibold text-ink-soft">{t.week.daysLeft} jour{t.week.daysLeft > 1 ? "s" : ""} restant{t.week.daysLeft > 1 ? "s" : ""}</p></div>
                <div className="rounded-2xl bg-cream p-3"><p className="text-xs text-ink-soft">Distance</p><p className="text-lg font-extrabold">{fr(t.week.km)} km</p><p className="text-xs font-semibold text-ink-soft">{t.week.sessions} séance{t.week.sessions > 1 ? "s" : ""}</p></div>
                {t.week.sleepH !== null && <div className="rounded-2xl bg-cream p-3"><p className="text-xs text-ink-soft">Sommeil moyen (7 j)</p><p className="text-lg font-extrabold">{fr(t.week.sleepH)} h</p></div>}
                {t.week.steps !== null && <div className="rounded-2xl bg-cream p-3"><p className="text-xs text-ink-soft">Pas par jour (7 j)</p><p className="text-lg font-extrabold">{n(t.week.steps)}</p></div>}
              </div>
            </div>
            <p className="pb-2 text-center text-xs font-semibold text-ink-soft">Conseil indicatif calculé à partir de tes données Garmin : il ne remplace pas ton ressenti.</p>
          </>
        )}
    </section>
  );
}

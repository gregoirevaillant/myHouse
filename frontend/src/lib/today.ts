import type { HealthSummary, TrainingSummary } from "./api";
import { addDays, fromIso } from "./dates";
import { duration } from "./garmin";
import { hasHealth, useHealth } from "./health";
import { useTraining } from "./training";

// « Aujourd'hui » : verdict de récupération du matin (sommeil, VFC, FC au repos, batterie, charge récente) et séance conseillée.
// Tout est calculé ici à partir de health.json et summary.json ; chaque signal est comparé à TA normale (médiane des 28 jours précédents).

export type Tone = "good" | "ok" | "bad" | "none";
export type Signal = { key: string; icon: string; label: string; value: string; ref: string | null; score: number | null; tone: Tone };
export type VerdictId = "push" | "easy" | "rest" | "unknown";
export type Today = {
  date: string;
  score: number | null;
  verdict: { id: VerdictId; icon: string; title: string; text: string };
  signals: Signal[];
  session: { icon: string; title: string; text: string };
  week: { runs: number; goal: number; km: number; sessions: number; daysLeft: number; sleepH: number | null; steps: number | null };
  race: { name: string; days: number } | null;
  nightDate: string | null; // nuit utilisée (null = pas de nuit mesurée récemment)
};

const clamp = (v: number, lo = 0, hi = 100) => Math.min(hi, Math.max(lo, v));
const median = (xs: number[]) => { const s = [...xs].sort((a, b) => a - b); return s.length ? (s.length % 2 ? s[(s.length - 1) / 2] : (s[s.length / 2 - 1] + s[s.length / 2]) / 2) : null; };
const toneOf = (score: number | null): Tone => (score === null ? "none" : score >= 70 ? "good" : score >= 45 ? "ok" : "bad");
const fr = (v: number, d = 1) => v.toFixed(d).replace(".", ",");
const sign = (v: number, d = 0) => `${v > 0 ? "+" : v < 0 ? "−" : ""}${fr(Math.abs(v), d)}`;
const SHORT: Record<string, string> = { sleep: "sommeil", hrv: "VFC", rhr: "FC au repos", bb: "batterie", load: "charge" };
const MIN_BASE = 5; // en dessous, pas de « normale » fiable

export function computeToday(h: HealthSummary, t: TrainingSummary | null): Today {
  const today = h.today;
  const signals: Signal[] = [];
  const weights: Record<string, number> = { sleep: 1.5, hrv: 1.5, rhr: 1, bb: 1, load: 1 };

  // nuit : la plus récente, si elle date d'hier ou d'aujourd'hui (la nuit porte la date du réveil)
  const night = [...h.nights].reverse().find((n) => n.date <= today) ?? null;
  const fresh = night && night.date >= addDays(today, -1) ? night : null;
  if (fresh) {
    const dur = clamp((fresh.seconds / (8 * 3600)) * 100);
    const score = fresh.score !== null ? (fresh.score + dur) / 2 : dur;
    signals.push({ key: "sleep", icon: "😴", label: "Sommeil", value: `${duration(fresh.seconds)}${fresh.score !== null ? ` · score ${fresh.score}` : ""}`, ref: "objectif 8 h", score, tone: toneOf(score) });
    const base = median(h.nights.filter((n) => n.date < fresh.date && n.date >= addDays(fresh.date, -28) && n.hrv !== null).map((n) => n.hrv!));
    const count = h.nights.filter((n) => n.date < fresh.date && n.date >= addDays(fresh.date, -28) && n.hrv !== null).length;
    if (fresh.hrv !== null) {
      if (base !== null && count >= MIN_BASE) {
        const ratio = fresh.hrv / base;
        const s = clamp(75 + (ratio - 1) * 250);
        signals.push({ key: "hrv", icon: "💓", label: "VFC de la nuit", value: `${fresh.hrv} ms`, ref: `normale ${Math.round(base)} ms (${sign(Math.round((ratio - 1) * 100))} %)`, score: s, tone: toneOf(s) });
      } else signals.push({ key: "hrv", icon: "💓", label: "VFC de la nuit", value: `${fresh.hrv} ms`, ref: `normale en cours de calcul (${count}/${MIN_BASE} nuits)`, score: null, tone: "none" });
    }
  }

  // FC au repos : la plus récente des 2 derniers jours, comparée à la médiane des 28 jours d'avant
  const rDay = [...h.days].reverse().find((d) => d.rhr !== null && d.date >= addDays(today, -1));
  if (rDay) {
    const base = h.days.filter((d) => d.date < rDay.date && d.date >= addDays(rDay.date, -28) && d.rhr !== null).map((d) => d.rhr!);
    const med = median(base);
    if (med !== null && base.length >= MIN_BASE) {
      const diff = rDay.rhr! - med;
      const s = clamp(80 - diff * 12);
      signals.push({ key: "rhr", icon: "❤️", label: "FC au repos", value: `${rDay.rhr} bpm`, ref: `normale ${Math.round(med)} bpm (${sign(Math.round(diff))})`, score: s, tone: toneOf(s) });
    } else signals.push({ key: "rhr", icon: "❤️", label: "FC au repos", value: `${rDay.rhr} bpm`, ref: "normale en cours de calcul", score: null, tone: "none" });
  }

  // batterie corporelle du jour (le matin = ce que la nuit a rechargé)
  const bb = h.days.find((d) => d.date === today)?.bb ?? null;
  if (bb !== null) signals.push({ key: "bb", icon: "🔋", label: "Batterie corporelle", value: `${bb} / 100`, ref: null, score: bb, tone: toneOf(bb) });

  // charge : 7 derniers jours comparés à la semaine habituelle (4 dernières semaines complètes)
  let acwr: number | null = null;
  if (t) {
    const since = addDays(today, -6);
    const acute = t.recent.filter((a) => a.date >= since).reduce((s, a) => s + (a.load ?? 0), 0);
    const prior = t.weeks.slice(-5, -1);
    const chronic = prior.length === 4 ? prior.reduce((s, w) => s + w.load, 0) / 4 : 0;
    if (chronic > 0) {
      acwr = acute / chronic;
      const s = acwr <= 0.8 ? 90 : acwr <= 1.3 ? 80 : acwr <= 1.5 ? 50 : 20;
      signals.push({ key: "load", icon: "📈", label: "Charge des 7 jours", value: `${Math.round(acute)}`, ref: `habituel ${Math.round(chronic)} par semaine (×${fr(acwr, 2)})`, score: s, tone: toneOf(s) });
    }
  }

  const scored = signals.filter((s) => s.score !== null);
  const total = scored.reduce((s, x) => s + weights[x.key], 0);
  let score = scored.length >= 2 ? Math.round(scored.reduce((s, x) => s + x.score! * weights[x.key], 0) / total) : null;
  if (score !== null && acwr !== null && acwr > 1.5) score = Math.min(score, 64); // charge qui monte trop vite : jamais « pousse »

  const worst = scored.filter((s) => s.tone === "bad").map((s) => `${SHORT[s.key]} (${s.value})`);
  const id: VerdictId = score === null ? "unknown" : score >= 70 ? "push" : score >= 45 ? "easy" : "rest";
  const verdict = { id, ...{
    push: { icon: "💪", title: "Tu peux pousser", text: "Ta récupération est au vert : une séance exigeante est possible." },
    easy: { icon: "🙂", title: "Séance modérée", text: worst.length ? `Point faible : ${worst.join(", ")}. Reste sur du facile.` : "Récupération correcte mais pas au top : privilégie une séance facile." },
    rest: { icon: "🛌", title: "Récupère", text: worst.length ? `Ton corps demande du repos : ${worst.join(", ")}.` : "Ton corps demande du repos aujourd'hui." },
    unknown: { icon: "⌚", title: "Pas assez de données", text: "Porte ta montre cette nuit : demain matin, le verdict apparaîtra." },
  }[id] };

  // semaine en cours
  const goal = t?.goal.runsPerWeek ?? 3;
  const wk = t?.weeks[t.weeks.length - 1];
  const runs = wk?.by.run.n ?? 0;
  const weekday = (fromIso(today).getDay() + 6) % 7; // 0 = lundi
  const daysLeft = 7 - weekday;
  const week7 = h.days.filter((d) => d.date >= addDays(today, -6));
  const sleep7 = h.nights.filter((n) => n.date >= addDays(today, -6));
  const runsLeft = Math.max(0, goal - runs);

  const session =
    id === "rest" ? { icon: "🚶", title: "Repos actif", text: "Marche ou mobilité 20-30 min, étirements. Pas de séance intense aujourd'hui." }
    : id === "push" && runsLeft > 0 ? (weekday >= 5
      ? { icon: "🏃", title: "Sortie longue", text: `60-90 min à allure facile, un peu plus longue que d'habitude. Course ${runs + 1} sur ${goal} cette semaine.` }
      : { icon: "⚡", title: "Fractionné", text: `Échauffement 15 min, 6 × 3 min à allure soutenue (récup 2 min), retour au calme. Course ${runs + 1} sur ${goal} cette semaine.` })
    : id === "push" ? { icon: "🚴", title: "Vélo ou natation soutenu", text: "Tes courses de la semaine sont faites : 60 min de vélo avec 3 × 10 min soutenues, ou natation, pour le triathlon." }
    : runsLeft > 0 ? { icon: "🏃", title: "Footing facile", text: `30-40 min en zone 1-2 (tu dois pouvoir parler). Course ${runs + 1} sur ${goal} cette semaine${id === "unknown" ? "" : ", sans forcer"}.` }
    : { icon: "🏊", title: "Natation ou vélo facile", text: "45 min tranquilles : bon pour le triathlon sans fatiguer les jambes." };

  const race = t?.goal.raceDate ? { name: t.goal.raceName ?? "Course", days: Math.ceil((fromIso(t.goal.raceDate).getTime() - fromIso(today).getTime()) / 86400000) } : null;
  const steps = week7.filter((d) => d.steps !== null);
  return {
    date: today, score, verdict, signals, session,
    week: {
      runs, goal, km: wk?.km ?? 0, sessions: wk?.n ?? 0, daysLeft,
      sleepH: sleep7.length ? sleep7.reduce((s, n) => s + n.seconds, 0) / sleep7.length / 3600 : null,
      steps: steps.length ? steps.reduce((s, d) => s + d.steps!, 0) / steps.length : null,
    },
    race: race && race.days >= 0 ? race : null,
    nightDate: fresh?.date ?? null,
  };
}

// nécessite health.json ; summary.json (Sport) enrichit la charge et la séance
export function useToday() {
  const health = useHealth();
  const training = useTraining();
  const h = hasHealth(health.data) ? health.data : null;
  const t = training.data && !("empty" in training.data && training.data.empty) ? (training.data as TrainingSummary) : null;
  return { today: h ? computeToday(h, t) : null, loading: health.isLoading, error: health.error, empty: !!health.data && !h };
}

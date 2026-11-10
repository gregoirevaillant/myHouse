import { readFile } from "node:fs/promises";
import path from "node:path";
import type { FastifyInstance } from "fastify";
import { env } from "../env.js";
import { garminConfigured, garminGet } from "../garmin.js";

// Pages Santé et Sommeil : l'historique vient de health.json (produit sur l'ordinateur par scripts/garmin/refresh.sh, dossier monté en
// lecture seule), et les derniers jours sont relus en direct sur Garmin à chaque appel (cache de 3 min, voir garmin.ts) puis superposés.
// Les deux transformations (ici et scripts/garmin/health.mjs) doivent rester identiques. Rien n'est stocké en base.

const TZ = "Europe/Paris";
const today = () => new Date().toLocaleDateString("sv-SE", { timeZone: TZ });
const shift = (iso: string, days: number) => new Date(Date.parse(`${iso}T12:00:00Z`) + days * 86400000).toISOString().slice(0, 10);
const LIVE_DAYS = 14;

const num = (v: unknown) => (typeof v === "number" && Number.isFinite(v) ? v : null);
const pos = (v: unknown) => (num(v) !== null && (v as number) > 0 ? (v as number) : null);
const r = (v: unknown, d = 0) => (num(v) === null ? null : Math.round((v as number) * 10 ** d) / 10 ** d);
const clock = (ms: unknown) => (num(ms) === null ? null : new Date(ms as number).toISOString().slice(11, 16));

// réponses Garmin, lues champ par champ : at(d, "heartRate.restingValue")
type Raw = Record<string, unknown>;
const at = (o: unknown, p: string) => p.split(".").reduce<unknown>((a, k) => (a as Record<string, unknown> | null | undefined)?.[k], o);

const toDay = (d: Raw) => {
  const rhr = pos(at(d, "heartRate.restingValue"));
  return {
    date: at(d, "calendarDate") as string,
    steps: pos(at(d, "movement.steps.value")), goal: pos(at(d, "movement.steps.goal")),
    km: r((num(at(d, "movement.steps.distanceInMeters")) ?? 0) / 1000, 2) || null,
    floors: pos(at(d, "movement.floorsAscended.value")),
    kcal: pos(at(d, "calories.burnedActive")), kcalTotal: pos(at(d, "calories.burnedTotal")),
    rhr: rhr !== null && rhr <= 100 ? rhr : null, hrMin: pos(at(d, "heartRate.minValue")), hrMax: pos(at(d, "heartRate.maxValue")),
    stress: pos(at(d, "stress.avgLevel")), bb: pos(at(d, "bodyBattery.maxValue")), bbLow: num(at(d, "bodyBattery.minValue")),
    intense: (num(at(d, "intensityMinutes.moderate")) ?? 0) + 2 * (num(at(d, "intensityMinutes.vigorous")) ?? 0) || null,
    resp: pos(at(d, "respiration.avgValue")),
  };
};
const hasData = (d: ReturnType<typeof toDay>) => Object.entries(d).some(([k, v]) => k !== "date" && k !== "goal" && v !== null);

const toNight = (s: Raw, hrv: Map<string, Raw>) => ({
  date: at(s, "calendarDate") as string, seconds: r(at(s, "sleepTimeSeconds")), deep: r(at(s, "deepSleepSeconds")) ?? 0, light: r(at(s, "lightSleepSeconds")) ?? 0, rem: r(at(s, "remSleepSeconds")) ?? 0, awake: r(at(s, "awakeSleepSeconds")) ?? 0,
  start: clock(at(s, "sleepStartTimestampLocal")), end: clock(at(s, "sleepEndTimestampLocal")), score: r(at(s, "sleepScores.overall.value")),
  heartRate: r(at(s, "avgHeartRate")), spo2: r(at(s, "averageSpO2Value")), breath: r(at(s, "averageRespirationValue")), stress: r(at(s, "avgSleepStress")),
  hrv: r(at(hrv.get(at(s, "calendarDate") as string), "lastNightAvg")),
});

type Stored = { generatedAt: string; today: string; range: { from: string; to: string }; days: ReturnType<typeof toDay>[]; nights: ReturnType<typeof toNight>[] };

// remplace dans `old` les entrées de `fresh` (même date)
const overlay = <T extends { date: string }>(old: T[], fresh: T[]) => [...new Map([...old, ...fresh].map((x) => [x.date, x])).values()].sort((a, b) => (a.date < b.date ? -1 : 1));

export async function healthRoutes(app: FastifyInstance) {
  app.get("/", async () => {
    let stored: Stored | null = null;
    try {
      stored = JSON.parse(await readFile(path.join(env.garminDataDir, "health.json"), "utf8")) as Stored;
    } catch {
      /* pas de fichier : on repart du direct seul */
    }
    if (!garminConfigured()) return stored ?? { empty: true };

    const now = today();
    // on reprend quelques jours avant la fin du fichier (les données récentes se complètent), au plus LIVE_DAYS jours de direct
    const from = shift(now, -(LIVE_DAYS - 1));
    try {
      const [daily, sleep, hrv] = await Promise.all([
        garminGet<{ data?: Raw[] }>(`/usersummary-service/v2/dailysummaries?startDate=${from}&endDate=${now}`),
        garminGet<Raw[]>(`/sleep-service/sleep/dailySleepSummariesByDate?startDate=${from}&endDate=${now}`).catch(() => null),
        garminGet<{ hrvSummaries?: Raw[] }>(`/hrv-service/hrv/daily/${from}/${now}`).catch(() => null),
      ]);
      const hrvBy = new Map((hrv?.hrvSummaries ?? []).map((h) => [h.calendarDate as string, h]));
      const days = (daily?.data ?? []).filter((d) => d.calendarDate).map(toDay).filter(hasData);
      const nights = (Array.isArray(sleep) ? sleep : []).filter((s) => s.calendarDate && (num(s.sleepTimeSeconds) ?? 0) > 0).map((s) => toNight(s, hrvBy));
      const all = overlay(stored?.days ?? [], days);
      return {
        generatedAt: new Date().toISOString(), today: now, live: true,
        range: { from: all[0]?.date ?? now, to: all[all.length - 1]?.date ?? now },
        days: all, nights: overlay(stored?.nights ?? [], nights),
      };
    } catch {
      return stored ? { ...stored, live: false } : { empty: true }; // Garmin injoignable ou clé expirée : on garde le fichier
    }
  });
}

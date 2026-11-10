// Transforme l'historique brut en un petit summary.json déjà additionné (km, semaines Lundi→Dimanche).
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { DATA_DIR } from "./api.mjs";

const SPORT = {
  running: "run", trail_running: "run", treadmill_running: "run", track_running: "run", virtual_run: "run",
  cycling: "bike", indoor_cycling: "bike", mountain_biking: "bike", gravel_cycling: "bike", road_biking: "bike", virtual_ride: "bike", e_bike_fitness: "bike",
  lap_swimming: "swim", open_water_swimming: "swim",
  strength_training: "strength",
};
const sportOf = (t) => SPORT[t] ?? "other";
const shift = (iso, n) => new Date(Date.parse(`${iso}T12:00:00Z`) + n * 86400000).toISOString().slice(0, 10);
const monday = (iso) => shift(iso, -((new Date(`${iso}T12:00:00Z`).getUTCDay() + 6) % 7));
const r = (v, d = 1) => (typeof v === "number" && Number.isFinite(v) ? Math.round(v * 10 ** d) / 10 ** d : null);
const num = (v) => (typeof v === "number" && Number.isFinite(v) ? v : null);
const blank = () => ({ km: 0, sec: 0, n: 0, load: 0, elev: 0 });

export function buildSummary({ activities, daily, sleep, hrv, weight, today }) {
  // objectif réglable dans garmin-data/config.json : { "runsPerWeek": 3, "raceDate": "2027-06-20", "raceName": "Triathlon M" }
  let cfg = {};
  const cfgPath = join(DATA_DIR, "config.json");
  if (existsSync(cfgPath)) try { cfg = JSON.parse(readFileSync(cfgPath, "utf8")); } catch { /* ignoré */ }
  const goal = { label: "Triathlon, priorité à la course à pied", runsPerWeek: cfg.runsPerWeek ?? 3, raceDate: cfg.raceDate ?? null, raceName: cfg.raceName ?? null };

  const acts = activities.map((a) => ({
    id: a.activityId, date: String(a.startTimeLocal).slice(0, 10), name: a.activityName ?? "", type: a.activityType?.typeKey ?? "other",
    sport: sportOf(a.activityType?.typeKey), km: (a.distance ?? 0) / 1000, sec: a.duration ?? 0, elev: a.elevationGain ?? 0,
    hr: num(a.averageHR), maxHr: num(a.maxHR), kcal: num(a.calories), load: num(a.activityTrainingLoad), te: num(a.aerobicTrainingEffect),
    zones: [1, 2, 3, 4, 5].map((z) => a[`hrTimeInZone_${z}`] ?? 0),
  }));

  // semaines : 52 dernières, lundi → dimanche
  const thisMon = monday(today);
  const weeks = [];
  for (let i = 51; i >= 0; i--) weeks.push({ start: shift(thisMon, -7 * i), total: blank(), by: { run: blank(), bike: blank(), swim: blank(), strength: blank(), other: blank() }, zones: [0, 0, 0, 0, 0] });
  const idx = new Map(weeks.map((w) => [w.start, w]));
  for (const a of acts) {
    const w = idx.get(monday(a.date));
    if (!w) continue;
    for (const t of [w.total, w.by[a.sport]]) { t.km += a.km; t.sec += a.sec; t.n += 1; t.load += a.load ?? 0; t.elev += a.elev; }
    a.zones.forEach((s, i) => (w.zones[i] += s));
  }
  const tidy = (t) => ({ km: r(t.km), sec: Math.round(t.sec), n: t.n, load: Math.round(t.load), elev: Math.round(t.elev) });
  const weeksOut = weeks.map((w) => ({ start: w.start, ...tidy(w.total), by: Object.fromEntries(Object.entries(w.by).map(([k, v]) => [k, tidy(v)])), zones: w.zones }));

  // séries quotidiennes (365 derniers jours), jours vides ignorés
  const from180 = shift(today, -365);
  const sleepBy = new Map(sleep.map((s) => [s.calendarDate, s]));
  const hrvBy = new Map(hrv.map((h) => [h.calendarDate, h]));
  const days = daily.filter((d) => d.calendarDate >= from180).map((d) => {
    const s = sleepBy.get(d.calendarDate);
    const h = hrvBy.get(d.calendarDate);
    return {
      date: d.calendarDate, steps: num(d.movement?.steps?.value ?? d.movement?.steps), rhr: num(d.heartRate?.restingValue), stress: (num(d.stress?.avgLevel) ?? -1) >= 0 ? num(d.stress?.avgLevel) : null,
      bbMax: num(d.bodyBattery?.maxValue), bbMin: num(d.bodyBattery?.minValue),
      intensity: (num(d.intensityMinutes?.moderate) ?? 0) + 2 * (num(d.intensityMinutes?.vigorous) ?? 0),
      sleepH: s?.sleepTimeSeconds ? r(s.sleepTimeSeconds / 3600) : null, sleepScore: num(s?.sleepScores?.overall?.value),
      deepH: s?.deepSleepSeconds ? r(s.deepSleepSeconds / 3600) : null, remH: s?.remSleepSeconds ? r(s.remSleepSeconds / 3600) : null,
      hrv: num(h?.lastNightAvg), hrvWeekly: num(h?.weeklyAvg), hrvStatus: h?.status ?? null,
    };
  }).filter((d) => Object.entries(d).some(([k, v]) => k !== "date" && v !== null && v !== 0));

  // poids (kg) et composition
  const weights = weight.map((w) => ({
    date: w.summaryDate, kg: r((w.latestWeight?.weight ?? 0) / 1000, 1), fat: r(w.latestWeight?.bodyFat), muscle: r((w.latestWeight?.muscleMass ?? 0) / 1000, 1) || null,
  })).filter((w) => w.kg && w.kg > 0);

  // records et plus grosses journées (sur tout l'historique récupéré)
  const best = (list, f) => list.reduce((m, a) => (m === null || f(a) > f(m) ? a : m), null);
  const pick = (a, extra = {}) => (a ? { date: a.date, name: a.name, km: r(a.km, 2), sec: Math.round(a.sec), elev: Math.round(a.elev), type: a.type, ...extra } : null);
  const runs = acts.filter((a) => a.sport === "run" && a.km > 0);
  const rides = acts.filter((a) => a.sport === "bike" && a.km > 0);
  const swims = acts.filter((a) => a.sport === "swim" && a.km > 0);
  const pace = (a) => a.sec / a.km;
  const fast = (min) => { const c = runs.filter((a) => a.km >= min); return c.length ? c.reduce((m, a) => (pace(a) < pace(m) ? a : m)) : null; };
  const byDay = new Map();
  for (const a of acts) { const d = byDay.get(a.date) ?? { date: a.date, km: 0, sec: 0, load: 0, n: 0 }; d.km += a.km; d.sec += a.sec; d.load += a.load ?? 0; d.n++; byDay.set(a.date, d); }
  const dayList = [...byDay.values()];
  const bestWeek = weeksOut.length ? weeksOut.reduce((m, w) => (w.km > m.km ? w : m)) : null;
  const records = {
    longestRun: pick(best(runs, (a) => a.km)),
    fastest5k: pick(fast(5), { paceSecPerKm: fast(5) ? Math.round(pace(fast(5))) : null }),
    fastest10k: pick(fast(10), { paceSecPerKm: fast(10) ? Math.round(pace(fast(10))) : null }),
    longestRide: pick(best(rides, (a) => a.km)),
    longestSwim: pick(best(swims, (a) => a.km)),
    mostElevation: pick(best(acts, (a) => a.elev)),
    longestSession: pick(best(acts, (a) => a.sec)),
    biggestWeek: bestWeek && bestWeek.km > 0 ? { start: bestWeek.start, km: bestWeek.km, sec: bestWeek.sec, n: bestWeek.n } : null,
  };
  const biggestDays = dayList.sort((a, b) => b.sec - a.sec).slice(0, 5).map((d) => ({ date: d.date, km: r(d.km), sec: Math.round(d.sec), load: Math.round(d.load), n: d.n }));

  // calendrier de régularité : temps de sport et sport principal par jour (52 semaines)
  const calFrom = shift(thisMon, -51 * 7);
  const cal = new Map();
  for (const a of acts) {
    if (a.date < calFrom) continue;
    const c = cal.get(a.date) ?? { date: a.date, sec: 0, sport: a.sport, top: 0 };
    c.sec += a.sec;
    if (a.sec > c.top) { c.top = a.sec; c.sport = a.sport; }
    cal.set(a.date, c);
  }
  const calendar = [...cal.values()].map((c) => ({ date: c.date, sec: Math.round(c.sec), sport: c.sport })).sort((a, b) => (a.date < b.date ? -1 : 1));

  const dates = acts.map((a) => a.date).sort();
  return {
    generatedAt: new Date().toISOString(), today, units: "km", goal,
    range: { from: dates[0] ?? today, to: today },
    counts: { activities: acts.length, days: daily.length, nights: sleep.length, hrv: hrv.length, weighIns: weights.length },
    weeks: weeksOut, days, calendar, weights, records, biggestDays,
    recent: acts.slice(0, 10).map((a) => ({ date: a.date, name: a.name, sport: a.sport, type: a.type, km: r(a.km, 2), sec: Math.round(a.sec), elev: Math.round(a.elev), hr: a.hr, load: a.load })),
    strength: { total: acts.filter((a) => a.sport === "strength").length, last: acts.find((a) => a.sport === "strength")?.date ?? null },
  };
}

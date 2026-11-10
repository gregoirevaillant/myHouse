// Santé au jour le jour (pas, FC au repos, stress, batterie, respiration, sommeil, VFC) sur TOUT l'historique récupéré.
// Écrit dans health.json, lu par GET /api/health (pages Santé et Sommeil).
const num = (v) => (typeof v === "number" && Number.isFinite(v) ? v : null);
const pos = (v) => (num(v) !== null && v > 0 ? v : null); // 0 ou -1 = non mesuré
const r = (v, d = 0) => (num(v) === null ? null : Math.round(v * 10 ** d) / 10 ** d);
const clock = (ms) => (num(ms) === null ? null : new Date(ms).toISOString().slice(11, 16)); // heure « locale » de Garmin : déjà l'heure du mur

export function buildHealth({ daily, sleep, hrv, today }) {
  const days = daily.map((d) => ({
    date: d.calendarDate,
    steps: pos(d.movement?.steps?.value), goal: pos(d.movement?.steps?.goal),
    km: r((d.movement?.steps?.distanceInMeters ?? 0) / 1000, 2) || null,
    floors: pos(d.movement?.floorsAscended?.value),
    kcal: pos(d.calories?.burnedActive), kcalTotal: pos(d.calories?.burnedTotal),
    rhr: (({ v }) => (v !== null && v <= 100 ? v : null))({ v: pos(d.heartRate?.restingValue) }), // au-dessus de 100 : montre portée seulement pour le sport, valeur fausse hrMin: pos(d.heartRate?.minValue), hrMax: pos(d.heartRate?.maxValue),
    stress: pos(d.stress?.avgLevel), bb: pos(d.bodyBattery?.maxValue), bbLow: num(d.bodyBattery?.minValue) === null ? null : d.bodyBattery.minValue,
    intense: (num(d.intensityMinutes?.moderate) ?? 0) + 2 * (num(d.intensityMinutes?.vigorous) ?? 0) || null,
    resp: pos(d.respiration?.avgValue),
  })).filter((d) => d.date && Object.entries(d).some(([k, v]) => k !== "date" && k !== "goal" && v !== null));

  const hrvBy = new Map(hrv.map((h) => [h.calendarDate, h]));
  const nights = sleep.filter((s) => s.calendarDate && (s.sleepTimeSeconds ?? 0) > 0).map((s) => ({
    date: s.calendarDate, seconds: r(s.sleepTimeSeconds), deep: r(s.deepSleepSeconds) ?? 0, light: r(s.lightSleepSeconds) ?? 0, rem: r(s.remSleepSeconds) ?? 0, awake: r(s.awakeSleepSeconds) ?? 0,
    start: clock(s.sleepStartTimestampLocal), end: clock(s.sleepEndTimestampLocal), score: r(s.sleepScores?.overall?.value),
    heartRate: r(s.avgHeartRate), spo2: r(s.averageSpO2Value), breath: r(s.averageRespirationValue), stress: r(s.avgSleepStress),
    hrv: r(hrvBy.get(s.calendarDate)?.lastNightAvg),
  }));

  const dates = days.map((d) => d.date).sort();
  return { generatedAt: new Date().toISOString(), today, range: { from: dates[0] ?? today, to: dates.at(-1) ?? today }, days, nights };
}

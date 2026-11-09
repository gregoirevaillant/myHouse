// Récupère l'historique Garmin dans garmin-data/ (JSON), puis reconstruit summary.json.
// Relancer ne récupère que le nouveau. Options : --full (tout l'historique), --days=N (par défaut 365).
import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { DATA_DIR, garminGet, keyIsSet } from "./api.mjs";
import { buildSummary } from "./summarize.mjs";

const args = process.argv.slice(2);
const FULL = args.includes("--full");
const DAYS = Number(args.find((a) => a.startsWith("--days="))?.split("=")[1] ?? 365);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const say = (m) => console.log(m);

const day = (d) => d.toISOString().slice(0, 10);
const shift = (iso, n) => day(new Date(Date.parse(`${iso}T12:00:00Z`) + n * 86400000));
const today = new Date().toLocaleDateString("sv-SE", { timeZone: "Europe/Paris" });

mkdirSync(DATA_DIR, { recursive: true });
const file = (n) => join(DATA_DIR, n);
const load = (n, fallback) => (existsSync(file(n)) ? JSON.parse(readFileSync(file(n), "utf8")) : fallback);
// écriture atomique : la page ne lit jamais un fichier à moitié écrit
const save = (n, v) => { writeFileSync(file(n) + ".tmp", JSON.stringify(v)); renameSync(file(n) + ".tmp", file(n)); };

// appel qui coupe la plage en deux sur une erreur 500 (réponse trop grosse pour Garmin, ~256 Ko)
async function ranged(from, to, build, pick) {
  try {
    await sleep(300);
    return pick(await garminGet(build(from, to))) ?? [];
  } catch (e) {
    if (e.status === 500 && from < to) {
      const mid = shift(from, Math.floor((Date.parse(to) - Date.parse(from)) / 86400000 / 2));
      return [...(await ranged(from, mid, build, pick)), ...(await ranged(shift(mid, 1), to, build, pick))];
    }
    if (e.status === 500 || e.status === 404 || e.status === 400) return []; // jour sans données
    throw e;
  }
}

async function chunks(from, to, size, build, pick, label) {
  const out = [];
  let n = 0;
  const total = Math.ceil((Date.parse(to) - Date.parse(from)) / 86400000 / size) + 1;
  for (let s = from; s <= to; s = shift(s, size)) {
    const e = shift(s, size - 1) > to ? to : shift(s, size - 1);
    out.push(...(await ranged(s, e, build, pick)));
    process.stdout.write(`\r  ${label} : ${++n}/${total}   `);
  }
  process.stdout.write("\n");
  return out;
}

async function main() {
  if (!keyIsSet()) throw new Error("Clé Garmin absente : renseigne GARMIN_API_KEY dans .env");
  const first = FULL ? "2015-01-01" : shift(today, -DAYS);

  // 1. sorties : on pagine du plus récent au plus ancien jusqu'à retrouver une sortie déjà connue
  say("Sorties…");
  const acts = new Map(load("activities.json", []).map((a) => [a.activityId, a]));
  const known = new Set(acts.keys());
  for (let start = 0; ; start += 20) {
    await sleep(300);
    const page = (await garminGet(`/activitylist-service/activities/search/activities?start=${start}&limit=20`)) ?? [];
    let seen = 0;
    for (const a of page) {
      if (known.has(a.activityId)) seen++;
      acts.set(a.activityId, a);
    }
    process.stdout.write(`\r  ${acts.size} sorties   `);
    if (page.length < 20 || seen === page.length && start > 0) break;
    if ((page.at(-1)?.startTimeLocal ?? "9") < first) break;
  }
  process.stdout.write("\n");
  save("activities.json", [...acts.values()].sort((a, b) => (a.startTimeLocal < b.startTimeLocal ? 1 : -1)));

  // 2. jours, nuits, VFC, poids : on reprend 10 jours avant la dernière date connue (les données récentes se complètent)
  const later = (a, b) => (a > b ? a : b);
  const since = (list, key) => (list.length ? shift(list.map((x) => x[key]).sort().at(-1), -10) : first);
  const merge = (old, fresh, key) => [...new Map([...old, ...fresh].filter((x) => x[key]).map((x) => [x[key], x])).values()].sort((a, b) => (a[key] < b[key] ? -1 : 1));

  say("Jours (pas, FC, stress, batterie)…");
  const daily0 = load("daily.json", []);
  const daily = merge(daily0, await chunks(later(since(daily0, "calendarDate"), first), today, 60,
    (a, b) => `/usersummary-service/v2/dailysummaries?startDate=${a}&endDate=${b}`, (r) => r?.data, "jours"), "calendarDate");
  save("daily.json", daily);

  say("Nuits…");
  const sleep0 = load("sleep.json", []);
  const nights = merge(sleep0, await chunks(later(since(sleep0, "calendarDate"), first), today, 30,
    (a, b) => `/sleep-service/sleep/dailySleepSummariesByDate?startDate=${a}&endDate=${b}`, (r) => (Array.isArray(r) ? r : r?.dailySleepDTOs), "nuits"), "calendarDate");
  save("sleep.json", nights);

  say("VFC…");
  const hrv0 = load("hrv.json", []);
  const hrv = merge(hrv0, await chunks(later(since(hrv0, "calendarDate"), first), today, 180,
    (a, b) => `/hrv-service/hrv/daily/${a}/${b}`, (r) => r?.hrvSummaries, "VFC"), "calendarDate");
  save("hrv.json", hrv);

  say("Poids…");
  const w0 = load("weight.json", []);
  const weight = merge(w0, await chunks(later(since(w0, "summaryDate"), first), today, 90,
    (a, b) => `/weight-service/weight/range/${a}/${b}`, (r) => r?.dailyWeightSummaries, "poids"), "summaryDate");
  save("weight.json", weight);

  // 3. données annexes (facultatives)
  for (const [name, path] of [["fitness-age.json", `/fitnessage-service/fitnessage/v2/${today}`], ["hr-zones.json", "/biometric-service/heartRateZones/v2"]]) {
    try { save(name, await garminGet(path)); } catch { /* absent sur certaines montres */ }
  }

  const summary = buildSummary({ activities: load("activities.json", []), daily, sleep: nights, hrv, weight, today });
  save("summary.json", summary);
  const c = summary.counts;
  say(`\nTerminé : ${c.activities} sorties, ${c.days} jours, ${c.nights} nuits, ${c.hrv} mesures VFC, ${c.weighIns} pesées.`);
  say(`Période : ${summary.range.from} → ${summary.range.to}`);
}

main().catch((e) => { console.error("\nErreur :", e.message); process.exit(1); });

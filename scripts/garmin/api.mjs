// API personnelle Garmin Connect, lecture seule, côté serveur uniquement (jamais dans le navigateur).
// Node 18+ : fetch intégré, aucune dépendance. La clé est lue dans l'environnement ou dans .env.local / .env
// et n'est jamais affichée.
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
export const DATA_DIR = process.env.GARMIN_DATA_DIR || join(ROOT, "garmin-data");
const BASE = "https://personal.connectapi.garmin.com";
const TOKEN_FILE = join(DATA_DIR, "token.json");
const MAX_AGE = 20 * 3600 * 1000; // le jeton dure 24 h : on le renouvelle après 20 h

function readKey() {
  if (process.env.GARMIN_PERSONAL_API_KEY) return process.env.GARMIN_PERSONAL_API_KEY.trim();
  if (process.env.GARMIN_API_KEY) return process.env.GARMIN_API_KEY.trim();
  for (const f of [".env.local", ".env"]) {
    const p = join(ROOT, f);
    if (!existsSync(p)) continue;
    for (const line of readFileSync(p, "utf8").split("\n")) {
      const m = line.match(/^\s*(GARMIN_PERSONAL_API_KEY|GARMIN_API_KEY)\s*=\s*(.*)\s*$/);
      if (m && m[2].trim()) return m[2].trim().replace(/^["']|["']$/g, "");
    }
  }
  return "";
}

export const keyIsSet = () => !!readKey();
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function newToken() {
  const key = readKey();
  if (!key) throw new Error("Clé Garmin absente (GARMIN_API_KEY dans .env)");
  const res = await fetch(`${BASE}/personalapitoken-service/personal-api/personal-api-key/token`, {
    method: "POST",
    headers: { Authorization: `ApiKey ${key}` },
  });
  if (res.status === 401 || res.status === 403) throw new Error("Clé Garmin refusée ou expirée");
  if (!res.ok) throw new Error(`Garmin a répondu ${res.status} pour le jeton`);
  let text = (await res.text()).trim();
  try {
    const j = JSON.parse(text);
    text = typeof j === "string" ? j : (j.access_token ?? j.accessToken ?? j.token ?? "");
  } catch { /* texte brut */ }
  if (!text) throw new Error("Garmin n'a pas renvoyé de jeton");
  mkdirSync(DATA_DIR, { recursive: true });
  writeFileSync(TOKEN_FILE, JSON.stringify({ token: text, at: Date.now() }), { mode: 0o600 });
  return text;
}

async function token(fresh = false) {
  if (!fresh && existsSync(TOKEN_FILE)) {
    try {
      const t = JSON.parse(readFileSync(TOKEN_FILE, "utf8"));
      if (t.token && Date.now() - t.at < MAX_AGE) return t.token;
    } catch { /* on en redemande un */ }
  }
  return newToken();
}

// GET avec nouvel essai sur 401 (jeton), 429/502/503 (attendre). Un 500 est remonté tel quel (réponse trop grosse).
export async function garminGet(path, { retries = 3 } = {}) {
  let tk = await token();
  for (let i = 0; ; i++) {
    const res = await fetch(BASE + path, { headers: { Authorization: `Bearer ${tk}` } });
    if (res.status === 401 && i < retries) { tk = await token(true); continue; }
    if ([429, 502, 503].includes(res.status) && i < retries) { await sleep(3000 * (i + 1)); continue; }
    if (res.status === 204) return null;
    const err = (status) => Object.assign(new Error(`Garmin ${status} sur ${path.split("?")[0]}`), { status });
    if (!res.ok) throw err(res.status);
    const text = await res.text();
    return text ? JSON.parse(text) : null;
  }
}

export const activities = (start = 0, limit = 20) =>
  garminGet(`/activitylist-service/activities/search/activities?start=${start}&limit=${limit}`);

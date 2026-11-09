import { env } from "./env.js";

// API personnelle Garmin Connect (https://developer.garmin.com/gc-developer-program/personal/personal-api/) :
// la clé d'API sert à obtenir un jeton d'accès, puis on lit (lecture seule) les données du compte.
const BASE = "https://personal.connectapi.garmin.com";

export const garminConfigured = () => !!env.garminKey;

export class GarminError extends Error {
  statusCode = 502;
  expose = true; // le gestionnaire d'erreurs masque les 5xx : ce message-ci doit arriver à l'écran
}

const refused = () => new GarminError("Clé Garmin refusée ou expirée : crées-en une nouvelle sur Garmin Connect");

// le format exact de la réponse n'est pas documenté : jeton en JSON (access_token / accessToken / token) ou texte brut
async function requestToken() {
  const res = await fetch(`${BASE}/personalapitoken-service/personal-api/personal-api-key/token`, {
    method: "POST",
    headers: { Authorization: `ApiKey ${env.garminKey}` },
    signal: AbortSignal.timeout(15000),
  }).catch(() => null);
  if (!res) throw new GarminError("Garmin est injoignable");
  if (res.status === 401 || res.status === 403) throw refused();
  if (!res.ok) throw new GarminError(`Garmin a répondu ${res.status}`);
  const text = (await res.text()).trim();
  try {
    const json = JSON.parse(text) as unknown;
    if (typeof json === "string") return json;
    const o = json as Record<string, unknown>;
    const found = o.access_token ?? o.accessToken ?? o.token;
    if (typeof found === "string" && found) return found;
  } catch {
    if (text && !text.startsWith("{")) return text;
  }
  throw new GarminError("Garmin n'a pas renvoyé de jeton d'accès");
}

// le jeton est gardé en mémoire jusqu'à son expiration (champ exp s'il s'agit d'un JWT), 5 minutes à défaut
let cachedToken: { value: string; until: number } | null = null;

function expiry(token: string) {
  try {
    const payload = JSON.parse(Buffer.from(token.split(".")[1] ?? "", "base64url").toString()) as { exp?: number };
    if (typeof payload.exp === "number") return Math.min(payload.exp * 1000 - 60_000, Date.now() + 30 * 60_000);
  } catch {
    // pas un JWT lisible : durée par défaut
  }
  return Date.now() + 5 * 60_000;
}

async function accessToken(fresh: boolean) {
  if (!fresh && cachedToken && cachedToken.until > Date.now()) return cachedToken.value;
  const value = await requestToken();
  cachedToken = { value, until: expiry(value) };
  return value;
}

// réponses gardées 3 minutes : ouvrir plusieurs onglets de la page ne multiplie pas les appels à Garmin
const cache = new Map<string, { until: number; data: unknown }>();

// GET d'une ressource Garmin ; null si Garmin répond « pas de contenu » (204)
export async function garminGet<T>(path: string, ttl = 180_000): Promise<T | null> {
  const hit = cache.get(path);
  if (hit && hit.until > Date.now()) return hit.data as T | null;

  for (let attempt = 0; attempt < 2; attempt++) {
    const token = await accessToken(attempt > 0);
    const res = await fetch(`${BASE}${path}`, { headers: { Authorization: `Bearer ${token}` }, signal: AbortSignal.timeout(15000) }).catch(() => null);
    if (!res) throw new GarminError("Garmin est injoignable");
    if (res.status === 401 || res.status === 403) {
      cachedToken = null; // jeton périmé : un seul nouvel essai avec un jeton neuf
      if (attempt === 0) continue;
      throw refused();
    }
    if (!res.ok && res.status !== 204) throw new GarminError(`Garmin a répondu ${res.status}`);
    const data = res.status === 204 ? null : ((await res.json().catch(() => null)) as T | null);
    if (ttl > 0) {
      if (cache.size > 200) for (const [k, v] of cache) if (v.until < Date.now()) cache.delete(k);
      cache.set(path, { until: Date.now() + ttl, data });
    }
    return data;
  }
  throw refused();
}

// ── Pesées ─────────────────────────────────────────────────────────────

export type GarminWeight = { date: string; grams: number; bodyFat: number | null; muscleGrams: number | null };

type Latest = { calendarDate?: string; weight?: number; bodyFat?: number; muscleMass?: number };
type RangeResponse = { dailyWeightSummaries?: { summaryDate?: string; latestWeight?: Latest }[] };

// Garmin envoie des grammes (la doc dit kilos) ; au-delà de 400 on suppose des grammes (aucun humain ne pèse 400 kg)
const toGrams = (w: number) => Math.round(w > 400 ? w : w * 1000);

// dernière pesée de chaque jour entre deux dates (YYYY-MM-DD, incluses), par tranches pour ne pas dépasser les limites de Garmin
export async function fetchWeights(from: string, to: string): Promise<GarminWeight[]> {
  const out: GarminWeight[] = [];
  const day = 86400000;
  for (let start = Date.parse(from); start <= Date.parse(to); start += 60 * day) {
    const end = Math.min(start + 59 * day, Date.parse(to));
    const iso = (t: number) => new Date(t).toISOString().slice(0, 10);
    const data = await garminGet<RangeResponse>(`/weight-service/weight/range/${iso(start)}/${iso(end)}`, 0);
    for (const d of data?.dailyWeightSummaries ?? []) {
      const date = d.latestWeight?.calendarDate ?? d.summaryDate;
      const w = d.latestWeight?.weight;
      if (!date || !/^\d{4}-\d{2}-\d{2}$/.test(date) || typeof w !== "number" || w <= 0) continue;
      const fat = d.latestWeight?.bodyFat;
      const muscle = d.latestWeight?.muscleMass;
      out.push({
        date,
        grams: toGrams(w),
        bodyFat: typeof fat === "number" && fat > 0 ? Math.round(fat * 10) / 10 : null,
        muscleGrams: typeof muscle === "number" && muscle > 0 ? toGrams(muscle) : null,
      });
    }
  }
  return out;
}

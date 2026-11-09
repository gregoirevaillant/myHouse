import { env } from "./env.js";

// API personnelle Garmin Connect (https://developer.garmin.com/gc-developer-program/personal/personal-api/) :
// la clé d'API sert à obtenir un jeton d'accès, puis on lit les pesées de la balance.
const BASE = "https://personal.connectapi.garmin.com";

export const garminConfigured = () => !!env.garminKey;

export type GarminWeight = { date: string; grams: number; bodyFat: number | null };

class GarminError extends Error {
  statusCode = 502;
}

async function call(path: string, init: RequestInit) {
  const res = await fetch(`${BASE}${path}`, { ...init, signal: AbortSignal.timeout(15000) }).catch(() => null);
  if (!res) throw new GarminError("Garmin est injoignable");
  if (res.status === 401 || res.status === 403) throw new GarminError("Clé Garmin refusée ou expirée : crées-en une nouvelle sur Garmin Connect");
  if (!res.ok) throw new GarminError(`Garmin a répondu ${res.status}`);
  return res;
}

// le format exact de la réponse n'est pas documenté : jeton en JSON (access_token / accessToken / token) ou texte brut
async function accessToken() {
  const res = await call("/personalapitoken-service/personal-api/personal-api-key/token", {
    method: "POST",
    headers: { Authorization: `ApiKey ${env.garminKey}` },
  });
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

type Latest = { calendarDate?: string; weight?: number; bodyFat?: number };
type RangeResponse = { dailyWeightSummaries?: { summaryDate?: string; latestWeight?: Latest }[] };

// Garmin annonce des kilos ; au-delà de 400 on suppose des grammes (aucun humain ne pèse 400 kg)
const toGrams = (w: number) => Math.round(w > 400 ? w : w * 1000);

// dernière pesée de chaque jour entre deux dates (YYYY-MM-DD, incluses), par tranches pour ne pas dépasser les limites de Garmin
export async function fetchWeights(from: string, to: string): Promise<GarminWeight[]> {
  const token = await accessToken();
  const out: GarminWeight[] = [];
  const day = 86400000;
  for (let start = Date.parse(from); start <= Date.parse(to); start += 60 * day) {
    const end = Math.min(start + 59 * day, Date.parse(to));
    const iso = (t: number) => new Date(t).toISOString().slice(0, 10);
    const res = await call(`/weight-service/weight/range/${iso(start)}/${iso(end)}`, { headers: { Authorization: `Bearer ${token}` } });
    const data = (await res.json().catch(() => null)) as RangeResponse | null;
    for (const d of data?.dailyWeightSummaries ?? []) {
      const date = d.latestWeight?.calendarDate ?? d.summaryDate;
      const w = d.latestWeight?.weight;
      if (!date || !/^\d{4}-\d{2}-\d{2}$/.test(date) || typeof w !== "number" || w <= 0) continue;
      const fat = d.latestWeight?.bodyFat;
      out.push({ date, grams: toGrams(w), bodyFat: typeof fat === "number" && fat > 0 ? Math.round(fat * 10) / 10 : null });
    }
  }
  return out;
}

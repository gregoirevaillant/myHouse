import { z } from "zod";
import { env } from "./env.js";

// Bases de données interrogées côté serveur (le navigateur ne contacte rien d'externe) :
// TMDB (films, séries), Open Library (livres, sans clé), IGDB (jeux). Un type par entrée de SOURCES.

export type Hit = { source: string; sourceId: string; title: string; year: number | null; subtitle: string | null; creator: string | null; imageUrl: string | null };
export type Details = { overview: string | null; creator: string | null; imageUrl: string | null };

const UA = "Maison/1.0 (application familiale privee)";
// seuls hébergeurs d'images que le serveur télécharge
const IMAGE_HOSTS = new Set(["image.tmdb.org", "covers.openlibrary.org", "images.igdb.com"]);

const unavailable = () => Object.assign(new Error("La base de données ne répond pas (panne de leur côté), réessaie plus tard"), { statusCode: 502, expose: true });
const missingKey = (name: string) => Object.assign(new Error(`${name} n'est pas configuré sur le serveur (clé d'API manquante)`), { statusCode: 503, expose: true });

async function getJson(url: string, headers: Record<string, string> = {}): Promise<unknown> {
  const res = await fetch(url, { headers: { "user-agent": UA, accept: "application/json", ...headers }, signal: AbortSignal.timeout(8000) });
  if (!res.ok) throw unavailable();
  return res.json();
}

// télécharge l'affiche d'une fiche (hébergeurs connus uniquement) ; null si elle est introuvable ou trop lourde
export async function downloadImage(url: string | null) {
  if (!url) return null;
  try {
    const u = new URL(url);
    if (u.protocol !== "https:" || !IMAGE_HOSTS.has(u.hostname)) return null;
    const res = await fetch(u, { headers: { "user-agent": UA }, signal: AbortSignal.timeout(10_000) });
    const mimetype = res.headers.get("content-type")?.split(";")[0] ?? "";
    if (!res.ok || !["image/jpeg", "image/png", "image/webp"].includes(mimetype)) return null;
    const buffer = Buffer.from(await res.arrayBuffer());
    return buffer.length <= 5_000_000 ? { buffer, mimetype } : null;
  } catch (err) {
    console.warn("Affiche non téléchargée", err); // une fiche sans affiche reste valide
    return null;
  }
}

const yearOf = (date?: string | null) => (date && /^\d{4}/.test(date) ? Number(date.slice(0, 4)) : null);
const clip = (s?: string | null, max = 3000) => s?.trim().slice(0, max) || null;

// ---------- TMDB (films, séries) ----------

const TMDB = "https://api.themoviedb.org/3";
const TMDB_IMG = "https://image.tmdb.org/t/p/w500";
const TMDB_IMG_SMALL = "https://image.tmdb.org/t/p/w154";

// clé v3 (32 caractères, dans l'adresse) ou jeton d'accès v4 (long, en en-tête)
function tmdb(path: string, params: Record<string, string> = {}) {
  if (!env.tmdbKey) throw missingKey("TMDB");
  const query = new URLSearchParams({ language: "fr-FR", ...params });
  const bearer = env.tmdbKey.length > 40;
  if (!bearer) query.set("api_key", env.tmdbKey);
  return getJson(`${TMDB}${path}?${query}`, bearer ? { authorization: `Bearer ${env.tmdbKey}` } : {});
}

const tmdbPage = z.object({
  results: z.array(
    z.object({
      id: z.number(),
      title: z.string().nullish(),
      name: z.string().nullish(),
      release_date: z.string().nullish(),
      first_air_date: z.string().nullish(),
      overview: z.string().nullish(),
      poster_path: z.string().nullish(),
    }),
  ),
});

const tmdbSearch = (type: "movie" | "tv") => async (q: string): Promise<Hit[]> => {
  const page = tmdbPage.parse(await tmdb(`/search/${type}`, { query: q, include_adult: "false" }));
  return page.results.slice(0, 10).flatMap((r) => {
    const title = r.title ?? r.name;
    return title ? [{ source: "tmdb", sourceId: String(r.id), title, year: yearOf(r.release_date ?? r.first_air_date), subtitle: clip(r.overview, 120), creator: null, imageUrl: r.poster_path ? `${TMDB_IMG_SMALL}${r.poster_path}` : null }] : [];
  });
}

const tmdbDetails = (type: "movie" | "tv") => async (id: string): Promise<Details> => {
  if (!/^\d+$/.test(id)) return { overview: null, creator: null, imageUrl: null };
  const d = z
    .object({
      overview: z.string().nullish(),
      poster_path: z.string().nullish(),
      credits: z.object({ crew: z.array(z.object({ job: z.string(), name: z.string() })) }).optional(),
      created_by: z.array(z.object({ name: z.string() })).optional(),
      networks: z.array(z.object({ name: z.string() })).optional(),
    })
    .parse(await tmdb(`/${type}/${id}`, type === "movie" ? { append_to_response: "credits" } : {}));
  const creator =
    type === "movie"
      ? d.credits?.crew.filter((c) => c.job === "Director").map((c) => c.name).slice(0, 2).join(", ")
      : (d.created_by?.map((c) => c.name).slice(0, 2).join(", ") || d.networks?.[0]?.name);
  return { overview: clip(d.overview), creator: creator || null, imageUrl: d.poster_path ? `${TMDB_IMG}${d.poster_path}` : null };
}

// ---------- Open Library (livres) ----------

const OL = "https://openlibrary.org";

async function searchBooks(q: string): Promise<Hit[]> {
  const res = z
    .object({
      docs: z.array(z.object({ key: z.string(), title: z.string(), author_name: z.array(z.string()).optional(), first_publish_year: z.number().optional(), cover_i: z.number().optional() })),
    })
    .parse(await getJson(`${OL}/search.json?limit=10&fields=key,title,author_name,first_publish_year,cover_i&q=${encodeURIComponent(q)}`));
  return res.docs.flatMap((b) => {
    const id = b.key.replace("/works/", "");
    const author = b.author_name?.slice(0, 2).join(", ") ?? null;
    return /^OL\d+W$/.test(id) ? [{ source: "openlibrary", sourceId: id, title: b.title, year: b.first_publish_year ?? null, subtitle: author, creator: author, imageUrl: b.cover_i ? `https://covers.openlibrary.org/b/id/${b.cover_i}-M.jpg` : null }] : [];
  });
}

async function bookDetails(id: string): Promise<Details> {
  if (!/^OL\d+W$/.test(id)) return { overview: null, creator: null, imageUrl: null };
  const w = z
    .object({ description: z.union([z.string(), z.object({ value: z.string() })]).optional(), covers: z.array(z.number()).optional() })
    .parse(await getJson(`${OL}/works/${id}.json`));
  const cover = w.covers?.find((c) => c > 0);
  return {
    overview: clip(typeof w.description === "string" ? w.description : w.description?.value),
    creator: null,
    imageUrl: cover ? `https://covers.openlibrary.org/b/id/${cover}-L.jpg` : null,
  };
}

// ---------- IGDB (jeux vidéo, via un compte développeur Twitch) ----------

let igdbToken: { value: string; expires: number } | null = null;

async function igdbAuth() {
  if (!env.igdbId || !env.igdbSecret) throw missingKey("IGDB");
  if (igdbToken && igdbToken.expires > Date.now() + 60_000) return igdbToken.value;
  const url = `https://id.twitch.tv/oauth2/token?${new URLSearchParams({ client_id: env.igdbId, client_secret: env.igdbSecret, grant_type: "client_credentials" })}`;
  const res = await fetch(url, { method: "POST", headers: { "user-agent": UA }, signal: AbortSignal.timeout(8000) });
  if (!res.ok) throw Object.assign(new Error("IGDB refuse l'identifiant ou le secret Twitch configurés"), { statusCode: 502, expose: true });
  const t = z.object({ access_token: z.string(), expires_in: z.number() }).parse(await res.json());
  igdbToken = { value: t.access_token, expires: Date.now() + t.expires_in * 1000 };
  return igdbToken.value;
}

async function igdb(endpoint: string, body: string): Promise<unknown> {
  const res = await fetch(`https://api.igdb.com/v4/${endpoint}`, {
    method: "POST",
    headers: { "user-agent": UA, "client-id": env.igdbId, authorization: `Bearer ${await igdbAuth()}`, accept: "application/json" },
    body,
    signal: AbortSignal.timeout(8000),
  });
  if (res.status === 401) igdbToken = null; // jeton révoqué : le prochain appel en demande un autre
  if (!res.ok) throw unavailable();
  return res.json();
}

const igdbCover = (imageId?: string, size = "t_cover_big") => (imageId && /^\w+$/.test(imageId) ? `https://images.igdb.com/igdb/image/upload/${size}/${imageId}.jpg` : null);

async function searchGames(q: string): Promise<Hit[]> {
  const list = z
    .array(z.object({ id: z.number(), name: z.string(), first_release_date: z.number().optional(), platforms: z.array(z.object({ abbreviation: z.string().optional() })).optional(), cover: z.object({ image_id: z.string() }).optional() }))
    .parse(await igdb("games", `search "${q.replace(/["\\]/g, " ")}"; fields name,first_release_date,platforms.abbreviation,cover.image_id; limit 10;`));
  return list.map((g) => ({
    source: "igdb",
    sourceId: String(g.id),
    title: g.name,
    year: g.first_release_date ? new Date(g.first_release_date * 1000).getUTCFullYear() : null,
    subtitle: g.platforms?.flatMap((p) => (p.abbreviation ? [p.abbreviation] : [])).slice(0, 4).join(", ") || null,
    creator: null,
    imageUrl: igdbCover(g.cover?.image_id, "t_cover_small"),
  }));
}

async function gameDetails(id: string): Promise<Details> {
  if (!/^\d+$/.test(id)) return { overview: null, creator: null, imageUrl: null };
  const [g] = z
    .array(
      z.object({
        summary: z.string().optional(),
        cover: z.object({ image_id: z.string() }).optional(),
        involved_companies: z.array(z.object({ developer: z.boolean().optional(), company: z.object({ name: z.string() }).optional() })).optional(),
      }),
    )
    .parse(await igdb("games", `fields summary,cover.image_id,involved_companies.developer,involved_companies.company.name; where id = ${id};`));
  const devs = g?.involved_companies?.flatMap((c) => (c.developer && c.company ? [c.company.name] : [])).slice(0, 2).join(", ");
  return { overview: clip(g?.summary), creator: devs || null, imageUrl: igdbCover(g?.cover?.image_id) };
}

// ---------- registre ----------

type Source = { id: string; search: (q: string) => Promise<Hit[]>; details: (sourceId: string) => Promise<Details> };
// type de média → base interrogée (ajouter un type = une entrée ici + searchable dans lib/media.ts du front)
export const SOURCES: Record<string, Source> = {
  MOVIE: { id: "tmdb", search: tmdbSearch("movie"), details: tmdbDetails("movie") },
  SERIES: { id: "tmdb", search: tmdbSearch("tv"), details: tmdbDetails("tv") },
  BOOK: { id: "openlibrary", search: searchBooks, details: bookDetails },
  GAME: { id: "igdb", search: searchGames, details: gameDetails },
};
// détails d'une fiche déjà choisie ; null si la base enregistrée n'est pas celle du type
export const detailsFor = (kind: string, source: string, sourceId: string) => (SOURCES[kind]?.id === source ? SOURCES[kind].details(sourceId) : Promise.resolve(null));

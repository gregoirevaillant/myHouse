import { z } from "zod";
import { env } from "./env.js";

// Bases de données interrogées côté serveur (le navigateur ne contacte rien d'externe) :
// TMDB (films, séries), Open Library (livres, sans clé), RAWG (jeux). Un type par entrée de SOURCES.

export type Hit = { source: string; sourceId: string; title: string; year: number | null; subtitle: string | null; creator: string | null };
export type Details = { overview: string | null; creator: string | null; imageUrl: string | null };

const UA = "Maison/1.0 (application familiale privee)";
// seuls hébergeurs d'images que le serveur télécharge
const IMAGE_HOSTS = new Set(["image.tmdb.org", "covers.openlibrary.org", "media.rawg.io"]);

const unavailable = () => Object.assign(new Error("La base de données est indisponible, réessaie plus tard"), { statusCode: 502 });
const missingKey = (name: string) => Object.assign(new Error(`${name} n'est pas configuré sur le serveur (clé d'API manquante)`), { statusCode: 503 });

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
    }),
  ),
});

const tmdbSearch = (type: "movie" | "tv") => async (q: string): Promise<Hit[]> => {
  const page = tmdbPage.parse(await tmdb(`/search/${type}`, { query: q, include_adult: "false" }));
  return page.results.slice(0, 10).flatMap((r) => {
    const title = r.title ?? r.name;
    return title ? [{ source: "tmdb", sourceId: String(r.id), title, year: yearOf(r.release_date ?? r.first_air_date), subtitle: clip(r.overview, 120), creator: null }] : [];
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
      docs: z.array(z.object({ key: z.string(), title: z.string(), author_name: z.array(z.string()).optional(), first_publish_year: z.number().optional() })),
    })
    .parse(await getJson(`${OL}/search.json?limit=10&fields=key,title,author_name,first_publish_year&q=${encodeURIComponent(q)}`));
  return res.docs.flatMap((b) => {
    const id = b.key.replace("/works/", "");
    const author = b.author_name?.slice(0, 2).join(", ") ?? null;
    return /^OL\d+W$/.test(id) ? [{ source: "openlibrary", sourceId: id, title: b.title, year: b.first_publish_year ?? null, subtitle: author, creator: author }] : [];
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

// ---------- RAWG (jeux vidéo) ----------

function rawg(path: string, params: Record<string, string> = {}) {
  if (!env.rawgKey) throw missingKey("RAWG");
  return getJson(`https://api.rawg.io/api${path}?${new URLSearchParams({ key: env.rawgKey, ...params })}`);
}

async function searchGames(q: string): Promise<Hit[]> {
  const res = z
    .object({
      results: z.array(z.object({ id: z.number(), name: z.string(), released: z.string().nullish(), platforms: z.array(z.object({ platform: z.object({ name: z.string() }) })).nullish() })),
    })
    .parse(await rawg("/games", { search: q, page_size: "10" }));
  return res.results.map((g) => ({
    source: "rawg",
    sourceId: String(g.id),
    title: g.name,
    year: yearOf(g.released),
    subtitle: g.platforms?.slice(0, 3).map((p) => p.platform.name).join(", ") || null,
    creator: null,
  }));
}

async function gameDetails(id: string): Promise<Details> {
  if (!/^\d+$/.test(id)) return { overview: null, creator: null, imageUrl: null };
  const g = z
    .object({ description_raw: z.string().nullish(), background_image: z.string().nullish(), developers: z.array(z.object({ name: z.string() })).optional() })
    .parse(await rawg(`/games/${id}`));
  return { overview: clip(g.description_raw), creator: g.developers?.slice(0, 2).map((d) => d.name).join(", ") || null, imageUrl: g.background_image ?? null };
}

// ---------- registre ----------

type Source = { id: string; search: (q: string) => Promise<Hit[]>; details: (sourceId: string) => Promise<Details> };
// type de média → base interrogée (ajouter un type = une entrée ici + searchable dans lib/media.ts du front)
export const SOURCES: Record<string, Source> = {
  MOVIE: { id: "tmdb", search: tmdbSearch("movie"), details: tmdbDetails("movie") },
  SERIES: { id: "tmdb", search: tmdbSearch("tv"), details: tmdbDetails("tv") },
  BOOK: { id: "openlibrary", search: searchBooks, details: bookDetails },
  GAME: { id: "rawg", search: searchGames, details: gameDetails },
};
// détails d'une fiche déjà choisie ; null si la base enregistrée n'est pas celle du type
export const detailsFor = (kind: string, source: string, sourceId: string) => (SOURCES[kind]?.id === source ? SOURCES[kind].details(sourceId) : Promise.resolve(null));

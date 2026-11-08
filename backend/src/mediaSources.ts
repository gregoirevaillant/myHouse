import { z } from "zod";

// Bases ouvertes interrogées côté serveur (aucune clé, aucune ressource externe côté navigateur) :
// - TVmaze (séries, CC BY-SA 4.0) ; - Wikidata (CC0) + Wikipédia pour les films.
// Pour ajouter un type (jeux, livres…) : une entrée dans SOURCES, et le type dans KINDS de routes/media.ts.

export type Hit = { source: string; sourceId: string; title: string; year: number | null; subtitle: string | null };
export type Details = { overview: string | null; creator: string | null; imageUrl: string | null };

const UA = "Maison/1.0 (application familiale privee)";
// seuls hébergeurs d'images que le serveur télécharge
const IMAGE_HOSTS = new Set(["static.tvmaze.com", "upload.wikimedia.org"]);

async function getJson(url: string): Promise<unknown> {
  const res = await fetch(url, { headers: { "user-agent": UA, accept: "application/json" }, signal: AbortSignal.timeout(8000) });
  if (!res.ok) throw Object.assign(new Error("La base de données est indisponible, réessaie plus tard"), { statusCode: 502 });
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

const stripHtml = (html: string) =>
  html
    .replace(/<[^>]+>/g, "")
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&rsquo;/g, "'")
    .replace(/&nbsp;/g, " ")
    .trim();

// ---------- TVmaze (séries) ----------

const tvShow = z.object({
  id: z.number(),
  name: z.string(),
  premiered: z.string().nullish(),
  genres: z.array(z.string()).default([]),
  summary: z.string().nullish(),
  network: z.object({ name: z.string() }).nullish(),
  webChannel: z.object({ name: z.string() }).nullish(),
  image: z.object({ medium: z.string().nullish(), original: z.string().nullish() }).nullish(),
});
const yearOf = (date?: string | null) => (date && /^\d{4}/.test(date) ? Number(date.slice(0, 4)) : null);

async function searchSeries(q: string): Promise<Hit[]> {
  const list = z.array(z.object({ show: tvShow })).parse(await getJson(`https://api.tvmaze.com/search/shows?q=${encodeURIComponent(q)}`));
  return list.slice(0, 10).map(({ show }) => ({
    source: "tvmaze",
    sourceId: String(show.id),
    title: show.name,
    year: yearOf(show.premiered),
    subtitle: [show.network?.name ?? show.webChannel?.name, show.genres.slice(0, 2).join(", ")].filter(Boolean).join(" · ") || null,
  }));
}

async function seriesDetails(id: string): Promise<Details> {
  const show = tvShow.parse(await getJson(`https://api.tvmaze.com/shows/${encodeURIComponent(id)}`));
  return {
    overview: show.summary ? stripHtml(show.summary) : null,
    creator: show.network?.name ?? show.webChannel?.name ?? null,
    imageUrl: show.image?.original ?? show.image?.medium ?? null,
  };
}

// ---------- Wikidata (films) ----------

const WIKIDATA = "https://www.wikidata.org/w/api.php";
// film, long métrage, film d'animation, court métrage, téléfilm, film documentaire
const FILM_CLASSES = ["Q11424", "Q24862", "Q202866", "Q24869", "Q506240", "Q93204"].join("|");
const entityId = /^Q\d+$/;

const labelOf = (e: { labels?: Record<string, { value: string }> }) => e.labels?.fr?.value ?? e.labels?.en?.value ?? e.labels?.mul?.value ?? null;
const entities = z.object({
  entities: z.record(
    z.string(),
    z.object({
      labels: z.record(z.string(), z.object({ value: z.string() })).optional(),
      descriptions: z.record(z.string(), z.object({ value: z.string() })).optional(),
      claims: z.record(z.string(), z.array(z.object({ mainsnak: z.object({ datavalue: z.object({ value: z.unknown() }).optional() }) }))).optional(),
      sitelinks: z.record(z.string(), z.object({ title: z.string() })).optional(),
    }),
  ),
});

const wikiPage = z.object({ extract: z.string().nullish(), thumbnail: z.object({ source: z.string() }).nullish() });

async function getEntities(ids: string[], props: string) {
  const url = `${WIKIDATA}?action=wbgetentities&format=json&ids=${ids.join("|")}&props=${props}&languages=fr|en|mul&sitefilter=frwiki|enwiki`;
  return entities.parse(await getJson(url)).entities;
}

async function searchMovies(q: string): Promise<Hit[]> {
  const search = z
    .object({ query: z.object({ search: z.array(z.object({ title: z.string() })) }) })
    .parse(await getJson(`${WIKIDATA}?action=query&list=search&format=json&srlimit=10&srsearch=${encodeURIComponent(`haswbstatement:P31=${FILM_CLASSES} ${q}`)}`));
  const ids = search.query.search.map((r) => r.title).filter((t) => entityId.test(t));
  if (!ids.length) return [];
  const found = await getEntities(ids, "labels|descriptions|claims");
  return ids.flatMap((id) => {
    const e = found[id];
    const title = e && labelOf(e);
    if (!e || !title) return [];
    const years = (e.claims?.P577 ?? [])
      .map((c) => z.object({ time: z.string() }).safeParse(c.mainsnak.datavalue?.value))
      .flatMap((r) => (r.success ? [Number(r.data.time.slice(1, 5))] : []));
    return [{ source: "wikidata", sourceId: id, title, year: years.length ? Math.min(...years) : null, subtitle: e.descriptions?.fr?.value ?? e.descriptions?.en?.value ?? null }];
  });
}

// résumé et affiche (image de l'infobox) tirés de l'article Wikipédia du film
async function movieDetails(id: string): Promise<Details> {
  if (!entityId.test(id)) return { overview: null, creator: null, imageUrl: null };
  const e = (await getEntities([id], "sitelinks|claims"))[id];
  const directors = (e?.claims?.P57 ?? []).flatMap((c) => {
    const v = z.object({ id: z.string() }).safeParse(c.mainsnak.datavalue?.value);
    return v.success && entityId.test(v.data.id) ? [v.data.id] : [];
  });
  const wikiSummary = (lang: string, title?: string) =>
    title
      ? getJson(`https://${lang}.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(title.replace(/ /g, "_"))}`)
          .then((j) => wikiPage.parse(j))
          .catch(() => null) // article absent ou Wikipédia indisponible : on garde ce que l'autre langue donne
      : Promise.resolve(null);
  const [names, fr, en] = await Promise.all([
    directors.length ? getEntities(directors.slice(0, 2), "labels") : Promise.resolve({}),
    wikiSummary("fr", e?.sitelinks?.frwiki?.title),
    wikiSummary("en", e?.sitelinks?.enwiki?.title),
  ]);
  // résumé en français si possible ; l'affiche de l'infobox n'apparaît parfois que sur la version anglaise
  return {
    overview: fr?.extract ?? en?.extract ?? null,
    creator:
      Object.values(names as z.infer<typeof entities>["entities"])
        .map(labelOf)
        .filter(Boolean)
        .join(", ") || null,
    imageUrl: fr?.thumbnail?.source ?? en?.thumbnail?.source ?? null,
  };
}

// ---------- registre ----------

type Source = { search: (q: string) => Promise<Hit[]>; details: (sourceId: string) => Promise<Details> };
export const SOURCES: Record<string, Source> = {
  SERIES: { search: searchSeries, details: seriesDetails },
  MOVIE: { search: searchMovies, details: movieDetails },
};
// source enregistrée sur la fiche → type de média (pour retrouver les détails)
export const detailsFor = (kind: string, source: string, sourceId: string) =>
  (kind === "SERIES" && source === "tvmaze") || (kind === "MOVIE" && source === "wikidata") ? SOURCES[kind].details(sourceId) : Promise.resolve(null);

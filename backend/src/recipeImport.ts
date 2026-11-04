import { lookup } from "node:dns/promises";
import { isIP } from "node:net";

export type ImportedRecipe = {
  name: string;
  category: "PLAT" | "ENTREE" | "DESSERT" | "APERO" | "PETIT_DEJ" | "AUTRE";
  servings: number | null;
  calories: number | null;
  minutes: number | null;
  ingredients: string;
  steps: string;
  url: string;
  // photo de la recette, en data URL (le navigateur ne peut pas la télécharger lui-même : CORS)
  image: string | null;
};

const fail = (message: string, statusCode = 400) => Object.assign(new Error(message), { statusCode });

const MAX_HTML = 3_000_000;
const MAX_IMAGE = 5_000_000;
const UA = "Mozilla/5.0 (compatible; Maison/1.0)";

// --- sécurité : on ne suit que des adresses publiques (pas de réseau interne) ---

function isPrivateIp(ip: string) {
  if (ip.startsWith("::ffff:")) ip = ip.slice(7);
  if (isIP(ip) === 4) {
    const [a, b] = ip.split(".").map(Number);
    return (
      a === 0 || a === 10 || a === 127 || (a === 100 && b >= 64 && b <= 127) || (a === 169 && b === 254) ||
      (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168) || a >= 224
    );
  }
  const v = ip.toLowerCase();
  return v === "::" || v === "::1" || v.startsWith("fc") || v.startsWith("fd") || v.startsWith("fe80");
}

async function assertPublic(url: URL) {
  if (url.protocol !== "http:" && url.protocol !== "https:") throw fail("Lien invalide (http…)");
  const host = url.hostname.replace(/^\[|\]$/g, "");
  const addresses = isIP(host) ? [{ address: host }] : await lookup(host, { all: true }).catch(() => []);
  if (!addresses.length) throw fail("Site introuvable");
  if (addresses.some((a) => isPrivateIp(a.address))) throw fail("Adresse non autorisée");
}

// fetch avec redirections suivies à la main (chaque étape est revérifiée) et taille limitée
async function download(start: string, accept: string, maxBytes: number) {
  let url = new URL(start);
  for (let i = 0; i < 5; i++) {
    await assertPublic(url);
    const res = await fetch(url, {
      redirect: "manual",
      headers: { "User-Agent": UA, Accept: accept, "Accept-Language": "fr,en;q=0.8" },
      signal: AbortSignal.timeout(10_000),
    }).catch(() => {
      throw fail("Impossible de joindre le site", 502);
    });
    if (res.status >= 300 && res.status < 400 && res.headers.get("location")) {
      url = new URL(res.headers.get("location")!, url);
      continue;
    }
    if (!res.ok) throw fail(`Le site a répondu ${res.status}`, 502);
    const chunks: Buffer[] = [];
    let size = 0;
    for await (const chunk of res.body as unknown as AsyncIterable<Uint8Array>) {
      size += chunk.length;
      if (size > maxBytes) throw fail("Page trop volumineuse");
      chunks.push(Buffer.from(chunk));
    }
    return { buffer: Buffer.concat(chunks), type: res.headers.get("content-type") ?? "", url };
  }
  throw fail("Trop de redirections", 502);
}

// --- extraction ---

const ENTITIES: Record<string, string> = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " ", rsquo: "’", lsquo: "‘", hellip: "…", deg: "°" };
const decode = (s: string) =>
  s
    .replace(/&#x([0-9a-f]+);/gi, (_, h) => String.fromCodePoint(parseInt(h, 16)))
    .replace(/&#(\d+);/g, (_, d) => String.fromCodePoint(Number(d)))
    .replace(/&([a-z]+);/gi, (m, n) => ENTITIES[n.toLowerCase()] ?? m);
const clean = (s: string) => decode(s.replace(/<br\s*\/?>/gi, "\n").replace(/<[^>]+>/g, "")).replace(/[ \t ]+/g, " ").trim();

type Json = any; // JSON-LD : structure libre

function findRecipe(node: Json): Json | null {
  if (!node || typeof node !== "object") return null;
  if (Array.isArray(node)) {
    for (const n of node) {
      const r = findRecipe(n);
      if (r) return r;
    }
    return null;
  }
  const type = node["@type"];
  if (type === "Recipe" || (Array.isArray(type) && type.includes("Recipe"))) return node;
  return findRecipe(node["@graph"]) ?? findRecipe(node.mainEntity) ?? findRecipe(node.mainEntityOfPage);
}

const first = (v: Json): Json => (Array.isArray(v) ? v[0] : v);
const text = (v: Json): string => (typeof v === "string" ? clean(v) : typeof v === "number" ? String(v) : "");

// PT1H30M → 90
function duration(v: Json): number {
  const m = /^P(?:(\d+)D)?T?(?:(\d+)H)?(?:(\d+)M)?/i.exec(text(v));
  return m ? Number(m[1] ?? 0) * 1440 + Number(m[2] ?? 0) * 60 + Number(m[3] ?? 0) : 0;
}

function stepsOf(v: Json): string[] {
  if (!v) return [];
  if (typeof v === "string") return clean(v).split(/\n+/).filter(Boolean);
  if (Array.isArray(v)) return v.flatMap(stepsOf);
  if (v.itemListElement) return stepsOf(v.itemListElement);
  return stepsOf(v.text ?? v.name);
}

function categoryOf(r: Json): ImportedRecipe["category"] {
  const c = [r.recipeCategory, r.keywords].flat().map(text).join(" ").toLowerCase();
  if (/dessert|gâteau|gateau|sucré|sucre|pâtisserie|patisserie/.test(c)) return "DESSERT";
  if (/entrée|entree|starter|appetizer|salade/.test(c)) return "ENTREE";
  if (/apéro|apero|snack|cocktail/.test(c)) return "APERO";
  if (/petit[- ]?d[ée]j|breakfast|brunch/.test(c)) return "PETIT_DEJ";
  if (/plat|main|dinner|lunch|d[ée]jeuner|dîner|diner/.test(c)) return "PLAT";
  return "PLAT";
}

function imageUrlOf(r: Json): string | null {
  const v = first(r.image);
  const u = typeof v === "string" ? v : v?.url;
  return typeof u === "string" ? u : null;
}

async function fetchImage(src: string, base: URL): Promise<string | null> {
  try {
    const { buffer, type } = await download(new URL(src, base).href, "image/*", MAX_IMAGE);
    const mime = type.split(";")[0].trim();
    if (!/^image\/(jpeg|png|webp|gif|avif)$/.test(mime)) return null;
    return `data:${mime};base64,${buffer.toString("base64")}`;
  } catch {
    return null; // la photo est facultative
  }
}

export async function importRecipe(rawUrl: string): Promise<ImportedRecipe> {
  let start: URL;
  try {
    start = new URL(rawUrl);
  } catch {
    throw fail("Lien invalide (http…)");
  }
  const page = await download(start.href, "text/html,application/xhtml+xml", MAX_HTML);
  if (!/html|xml/.test(page.type)) throw fail("Ce lien n'est pas une page web");
  const html = page.buffer.toString("utf8");

  let recipe: Json = null;
  for (const m of html.matchAll(/<script[^>]+type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi)) {
    try {
      recipe = findRecipe(JSON.parse(m[1].trim()));
    } catch {
      // bloc JSON-LD invalide : on passe au suivant
    }
    if (recipe) break;
  }
  if (!recipe) throw fail("Aucune recette trouvée sur cette page");

  const name = text(recipe.name);
  const ingredients = [recipe.recipeIngredient].flat().map(text).filter(Boolean);
  if (!name || !ingredients.length) throw fail("Recette incomplète sur cette page");

  const total = duration(recipe.totalTime) || duration(recipe.prepTime) + duration(recipe.cookTime);
  const servings = Number(/\d+/.exec([recipe.recipeYield].flat().map(text).join(" "))?.[0]);
  // nutrition.calories : « 350 kcal » (par portion)
  const kcal = Number(/\d+/.exec(text((recipe.nutrition as Json)?.calories))?.[0]);
  const imageUrl = imageUrlOf(recipe);

  return {
    name: name.slice(0, 150),
    category: categoryOf(recipe),
    servings: servings >= 1 && servings <= 100 ? servings : null,
    calories: kcal >= 1 && kcal <= 10000 ? kcal : null,
    minutes: total >= 1 && total <= 10000 ? total : null,
    ingredients: ingredients.join("\n").slice(0, 10000),
    steps: stepsOf(recipe.recipeInstructions).join("\n").slice(0, 20000),
    url: page.url.href,
    image: imageUrl ? await fetchImage(imageUrl, page.url) : null,
  };
}

import { env } from "./env.js";
import Fastify from "fastify";
import cookie from "@fastify/cookie";
import jwt from "@fastify/jwt";
import multipart from "@fastify/multipart";
import rateLimit from "@fastify/rate-limit";
import fastifyStatic from "@fastify/static";
import { existsSync } from "node:fs";
import path from "node:path";
import { ZodError } from "zod";
import { COOKIE_NAME, authRoutes, requireAuth } from "./auth.js";
import { invalidateOnWrite, liveRoutes } from "./live.js";
import { requireModule, type Access } from "./modules.js";
import { adminRoutes } from "./routes/admin.js";
import { budgetRoutes } from "./routes/budget.js";
import { mediaRoutes } from "./routes/media.js";
import { calorieRoutes } from "./routes/calories.js";
import { cardRoutes } from "./routes/cards.js";
import { expenseRoutes } from "./routes/expenses.js";
import { expenseTrackerRoutes } from "./routes/expenseTrackers.js";
import { infoRoutes } from "./routes/infos.js";
import { journalRoutes } from "./routes/journals.js";
import { mealRoutes } from "./routes/meals.js";
import { productRoutes } from "./routes/products.js";
import { pushRoutes } from "./routes/push.js";
import { recipeRoutes } from "./routes/recipes.js";
import { restaurantRoutes } from "./routes/restaurants.js";
import { shoppingRoutes } from "./routes/shopping.js";
import { userRoutes } from "./routes/users.js";

const app = Fastify({ logger: true, trustProxy: true });

// droits de la personne connectée, remplis par requireAuth
app.decorateRequest("access", null as unknown as Access); // valeur par défaut seulement : requireAuth la remplace

// En-têtes de sécurité sur toutes les réponses. Les seules ressources externes de l'app : polices Google et tuiles OpenStreetMap.
const CSP = [
  "default-src 'self'",
  "script-src 'self'",
  "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
  "font-src 'self' https://fonts.gstatic.com",
  "img-src 'self' data: blob: https://*.tile.openstreetmap.org",
  "media-src 'self' blob:",
  // les polices passent par le service worker, dont les requêtes relèvent de connect-src
  "connect-src 'self' https://fonts.googleapis.com https://fonts.gstatic.com",
  "worker-src 'self'",
  "manifest-src 'self'",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "frame-ancestors 'none'",
].join("; ");

app.addHook("onSend", async (req, reply) => {
  reply.header("Content-Security-Policy", CSP);
  reply.header("X-Content-Type-Options", "nosniff");
  reply.header("X-Frame-Options", "DENY");
  reply.header("Referrer-Policy", "strict-origin-when-cross-origin"); // OpenStreetMap exige au moins l'origine
  reply.header("Permissions-Policy", "camera=(self), geolocation=(self), microphone=(), payment=(), usb=()");
  if (req.protocol === "https") reply.header("Strict-Transport-Security", "max-age=15552000");
  // données privées : jamais gardées par un cache partagé ni par le navigateur (les images fixent leur propre durée)
  if (req.url.startsWith("/api") && !reply.hasHeader("Cache-Control")) reply.header("Cache-Control", "no-store");
});

// Défense en plus du cookie SameSite : une écriture qui vient d'un autre site est refusée
app.addHook("onRequest", async (req, reply) => {
  if (req.method !== "GET" && req.method !== "HEAD" && req.headers["sec-fetch-site"] === "cross-site") {
    return reply.code(403).send({ error: "Origine refusée" });
  }
});

await app.register(cookie);
await app.register(jwt, { secret: env.jwtSecret, cookie: { cookieName: COOKIE_NAME, signed: false } });
await app.register(multipart, { limits: { fileSize: 5 * 1024 * 1024, files: 1 } });
await app.register(rateLimit, { global: false });

app.setErrorHandler((err, _req, reply) => {
  if (err instanceof ZodError) return reply.code(400).send({ error: "Données invalides", issues: err.issues });
  if ((err as { code?: string }).code === "FST_REQ_FILE_TOO_LARGE") {
    return reply.code(413).send({ error: "Image trop lourde (5 Mo max)" });
  }
  app.log.error(err);
  const status = (err as { statusCode?: number }).statusCode ?? 500;
  return reply.code(status).send({ error: status < 500 ? (err as Error).message : "Erreur serveur" });
});

// pour le HEALTHCHECK Docker : sans authentification, ne révèle rien
app.get("/api/health", async () => ({ ok: true }));

await app.register(
  async (api) => {
    // temps réel : chaque écriture réussie fait rafraîchir les appareils concernés
    api.addHook("onResponse", invalidateOnWrite);
    await api.register(authRoutes, { prefix: "/auth" });
    await api.register(async (priv) => {
      priv.addHook("preHandler", requireAuth);
      priv.addHook("preHandler", requireModule); // pages activées pour la famille, changement de mot de passe imposé, zone admin
      await priv.register(cardRoutes, { prefix: "/cards" });
      await priv.register(mealRoutes, { prefix: "/meals" });
      await priv.register(shoppingRoutes, { prefix: "/shopping" });
      await priv.register(productRoutes, { prefix: "/products" });
      await priv.register(expenseRoutes, { prefix: "/expenses" });
      await priv.register(expenseTrackerRoutes, { prefix: "/expense-trackers" });
      await priv.register(restaurantRoutes, { prefix: "/restaurants" });
      await priv.register(journalRoutes, { prefix: "/journals" });
      await priv.register(infoRoutes, { prefix: "/infos" });
      await priv.register(recipeRoutes, { prefix: "/recipes" });
      await priv.register(userRoutes, { prefix: "/users" });
      await priv.register(budgetRoutes, { prefix: "/budget" });
      await priv.register(mediaRoutes, { prefix: "/media" });
      await priv.register(calorieRoutes, { prefix: "/calories" });
      await priv.register(pushRoutes, { prefix: "/push" });
      await priv.register(liveRoutes, { prefix: "/events" });
      await priv.register(adminRoutes, { prefix: "/admin" });
    });
  },
  { prefix: "/api" },
);

// En production, le build du front est servi par le même serveur
const publicDir = path.resolve(process.env.PUBLIC_DIR ?? "public");
if (existsSync(publicDir)) {
  await app.register(fastifyStatic, { root: publicDir });
  app.setNotFoundHandler((req, reply) => {
    if (req.url.startsWith("/api")) return reply.code(404).send({ error: "Introuvable" });
    return reply.sendFile("index.html");
  });
}

await app.listen({ port: env.port, host: "0.0.0.0" });

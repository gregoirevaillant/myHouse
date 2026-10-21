import { bankEnabled, env } from "./env.js";
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
import { syncEveryone } from "./budget/sync.js";
import { runJobs } from "./jobs.js";
import { invalidateOnWrite, liveRoutes } from "./live.js";
import { bankRoutes } from "./routes/bank.js";
import { budgetRoutes } from "./routes/budget.js";
import { cardRoutes } from "./routes/cards.js";
import { expenseRoutes } from "./routes/expenses.js";
import { expenseTrackerRoutes } from "./routes/expenseTrackers.js";
import { journalRoutes } from "./routes/journals.js";
import { mealRoutes } from "./routes/meals.js";
import { productRoutes } from "./routes/products.js";
import { pushRoutes } from "./routes/push.js";
import { shoppingRoutes } from "./routes/shopping.js";
import { userRoutes } from "./routes/users.js";

const app = Fastify({ logger: true, trustProxy: true });

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

await app.register(
  async (api) => {
    // temps réel : chaque écriture réussie fait rafraîchir les appareils concernés
    api.addHook("onResponse", invalidateOnWrite);
    await api.register(authRoutes, { prefix: "/auth" });
    await api.register(async (priv) => {
      priv.addHook("preHandler", requireAuth);
      await priv.register(cardRoutes, { prefix: "/cards" });
      await priv.register(mealRoutes, { prefix: "/meals" });
      await priv.register(shoppingRoutes, { prefix: "/shopping" });
      await priv.register(productRoutes, { prefix: "/products" });
      await priv.register(expenseRoutes, { prefix: "/expenses" });
      await priv.register(expenseTrackerRoutes, { prefix: "/expense-trackers" });
      await priv.register(journalRoutes, { prefix: "/journals" });
      await priv.register(userRoutes, { prefix: "/users" });
      await priv.register(budgetRoutes, { prefix: "/budget" });
      await priv.register(bankRoutes, { prefix: "/bank" });
      await priv.register(pushRoutes, { prefix: "/push" });
      await priv.register(liveRoutes, { prefix: "/events" });
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

// Synchro bancaire automatique : au démarrage puis toutes les 6 h
if (bankEnabled) {
  const syncAll = () => syncEveryone((msg) => app.log.warn(msg)).catch((err) => app.log.error(err));
  setTimeout(syncAll, 30_000);
  setInterval(syncAll, 6 * 60 * 60 * 1000);
}

// Notifications planifiées (rappels budget, résumé du dimanche) : vérifiées toutes les 10 min
const jobs = () => runJobs().catch((err) => app.log.error(err));
setTimeout(jobs, 60_000);
setInterval(jobs, 10 * 60 * 1000);

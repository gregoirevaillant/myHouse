import { readFile } from "node:fs/promises";
import path from "node:path";
import type { FastifyInstance } from "fastify";
import { env } from "../env.js";

// Pages Santé et Sommeil : lit health.json produit sur l'ordinateur par `scripts/garmin/refresh.sh` (tout l'historique, jour par jour).
// Le dossier garmin-data/ est monté en lecture seule dans le conteneur ; rien n'est stocké en base ni copié dans le build.
export async function healthRoutes(app: FastifyInstance) {
  app.get("/", async () => {
    try {
      return JSON.parse(await readFile(path.join(env.garminDataDir, "health.json"), "utf8")) as unknown;
    } catch {
      return { empty: true }; // pas encore de données : l'écran explique comment les récupérer
    }
  });
}

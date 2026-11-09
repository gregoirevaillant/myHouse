import { readFile } from "node:fs/promises";
import path from "node:path";
import type { FastifyInstance } from "fastify";
import { env } from "../env.js";

// Page Entraînement : lit le résumé produit sur l'ordinateur par `npm run garmin:refresh` (scripts/garmin).
// Le dossier garmin-data/ est monté en lecture seule dans le conteneur ; rien n'est stocké en base ni copié dans le build.
export async function trainingRoutes(app: FastifyInstance) {
  app.get("/", async () => {
    try {
      return JSON.parse(await readFile(path.join(env.garminDataDir, "summary.json"), "utf8")) as unknown;
    } catch {
      return { empty: true }; // pas encore de données : l'écran explique comment les récupérer
    }
  });
}

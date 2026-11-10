import { spawn } from "node:child_process";
import { readFile } from "node:fs/promises";
import path from "node:path";
import type { FastifyInstance } from "fastify";
import { env } from "../env.js";
import { garminConfigured } from "../garmin.js";

// Actualise garmin-data/ (Sport, Santé, Sommeil) en lançant le même script que `scripts/garmin/refresh.sh`, côté serveur.
// Le script lit la clé Garmin dans l'environnement du serveur ; rien n'est renvoyé au navigateur. Une seule actualisation à la fois.
const SCRIPT = path.resolve("scripts/garmin/pull.mjs");
const AUTO_EVERY = 30 * 60_000; // au lancement de l'appli : pas plus d'une actualisation toutes les 30 minutes

const state = { running: false, startedAt: 0, finishedAt: 0, error: null as string | null };

function start() {
  state.running = true;
  state.startedAt = Date.now();
  state.error = null;
  let tail = "";
  const child = spawn(process.execPath, [SCRIPT], { env: process.env, stdio: ["ignore", "pipe", "pipe"] });
  const keep = (b: Buffer) => { tail = (tail + b.toString()).slice(-600); };
  child.stdout.on("data", keep);
  child.stderr.on("data", keep);
  const done = (error: string | null) => { state.running = false; state.finishedAt = Date.now(); state.error = error; };
  child.on("error", (e) => done(e.message));
  child.on("close", (code) => done(code === 0 ? null : (tail.split("\n").filter(Boolean).pop() ?? `Échec (code ${code})`).replace(/\r/g, "")));
  setTimeout(() => child.kill(), 10 * 60_000).unref(); // garde-fou : jamais bloqué indéfiniment
}

export async function syncRoutes(app: FastifyInstance) {
  const status = async () => {
    let updatedAt: string | null = null;
    try {
      updatedAt = (JSON.parse(await readFile(path.join(env.garminDataDir, "health.json"), "utf8")) as { generatedAt?: string }).generatedAt ?? null;
    } catch {
      /* pas encore de données */
    }
    return { running: state.running, error: state.error, updatedAt, configured: garminConfigured() };
  };

  app.get("/", status);

  // ?auto=1 : au lancement de l'appli, ne fait rien si les données sont récentes ; sans, le bouton force l'actualisation
  app.post("/", async (req, reply) => {
    if (!garminConfigured()) return reply.code(503).send({ error: "Garmin n'est pas configuré (GARMIN_API_KEY)" });
    const auto = (req.query as { auto?: string }).auto === "1";
    const last = Math.max(state.finishedAt, Date.parse((await status()).updatedAt ?? "") || 0);
    if (!state.running && !(auto && Date.now() - last < AUTO_EVERY)) start();
    return status();
  });
}

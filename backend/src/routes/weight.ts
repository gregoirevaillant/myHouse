import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { prisma } from "../db.js";
import { fetchWeights, garminConfigured } from "../garmin.js";

const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);

const entryBody = z.object({
  date: isoDate,
  grams: z.number().int().min(30000).max(300000),
  bodyFat: z.number().min(1).max(70).nullish(),
});

const select = { id: true, date: true, grams: true, bodyFat: true, source: true } as const;

// suivi strictement personnel : jamais visible de l'autre personne du foyer
const mine = (req: { user: { id: string; householdId: string } }) => ({ householdId: req.user.householdId, ownerId: req.user.id });

const todayIso = () => new Date().toISOString().slice(0, 10);
const daysAgo = (iso: string, n: number) => new Date(Date.parse(iso) - n * 86400000).toISOString().slice(0, 10);

export async function weightRoutes(app: FastifyInstance) {
  app.get("/status", async () => ({ garmin: garminConfigured() }));

  // ?from=YYYY-MM-DD&to=YYYY-MM-DD (inclus)
  app.get("/", async (req) => {
    const { from, to } = z.object({ from: isoDate, to: isoDate }).parse(req.query);
    return prisma.weightEntry.findMany({ where: { ...mine(req), date: { gte: from, lte: to } }, select, orderBy: { date: "asc" } });
  });

  // une pesée par jour : saisir une date déjà pesée la remplace
  app.post("/", async (req) => {
    const body = entryBody.parse(req.body);
    const data = { grams: body.grams, bodyFat: body.bodyFat ?? null, source: "MANUAL" };
    return prisma.weightEntry.upsert({
      where: { ownerId_date: { ownerId: req.user.id, date: body.date } },
      update: data,
      create: { ...data, date: body.date, ...mine(req), createdById: req.user.id },
      select,
    });
  });

  app.delete<{ Params: { id: string } }>("/:id", async (req, reply) => {
    const found = await prisma.weightEntry.findFirst({ where: { id: req.params.id, ...mine(req) } });
    if (!found) return reply.code(404).send({ error: "Introuvable" });
    await prisma.weightEntry.delete({ where: { id: found.id } });
    return { ok: true };
  });

  // récupère les pesées de la balance Garmin : un an au premier passage, ensuite depuis la dernière synchronisée (moins une semaine)
  app.post("/sync", { config: { rateLimit: { max: 6, timeWindow: "1 minute" } } }, async (req, reply) => {
    if (!garminConfigured()) return reply.code(503).send({ error: "Garmin n'est pas configuré (GARMIN_API_KEY)" });
    const last = await prisma.weightEntry.findFirst({ where: { ...mine(req), source: "GARMIN" }, orderBy: { date: "desc" }, select: { date: true } });
    const to = todayIso();
    const from = last ? daysAgo(last.date, 7) : daysAgo(to, 365);
    const weights = await fetchWeights(from, to);

    // la saisie manuelle prime : on n'écrase que les pesées venues de Garmin
    const manual = new Set(
      (await prisma.weightEntry.findMany({ where: { ...mine(req), source: "MANUAL", date: { gte: from, lte: to } }, select: { date: true } })).map((e) => e.date),
    );
    const kept = weights.filter((w) => !manual.has(w.date));
    await prisma.$transaction(
      kept.map((w) =>
        prisma.weightEntry.upsert({
          where: { ownerId_date: { ownerId: req.user.id, date: w.date } },
          update: { grams: w.grams, bodyFat: w.bodyFat, source: "GARMIN" },
          create: { ...w, source: "GARMIN", ...mine(req), createdById: req.user.id },
        }),
      ),
    );
    return { imported: kept.length };
  });
}

import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { prisma } from "../db.js";

const MEALS = ["BREAKFAST", "LUNCH", "DINNER", "SNACK"] as const;
const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);

const entryBody = z.object({
  date: isoDate,
  meal: z.enum(MEALS),
  label: z.string().trim().min(1).max(100),
  kcal: z.number().int().min(1).max(20000),
});

const select = { id: true, date: true, meal: true, label: true, kcal: true } as const;

// suivi strictement personnel : jamais visible de l'autre personne du foyer
const mine = (req: { user: { id: string; householdId: string } }) => ({ householdId: req.user.householdId, ownerId: req.user.id });

export async function calorieRoutes(app: FastifyInstance) {
  // ?from=YYYY-MM-DD&to=YYYY-MM-DD (inclus)
  app.get("/", async (req) => {
    const { from, to } = z.object({ from: isoDate, to: isoDate }).parse(req.query);
    return prisma.calorieEntry.findMany({
      where: { ...mine(req), date: { gte: from, lte: to } },
      select,
      orderBy: [{ date: "asc" }, { createdAt: "asc" }],
    });
  });

  app.post("/", async (req) => {
    const data = entryBody.parse(req.body);
    return prisma.calorieEntry.create({ data: { ...data, ...mine(req), createdById: req.user.id }, select });
  });

  app.patch<{ Params: { id: string } }>("/:id", async (req, reply) => {
    const found = await prisma.calorieEntry.findFirst({ where: { id: req.params.id, ...mine(req) } });
    if (!found) return reply.code(404).send({ error: "Introuvable" });
    return prisma.calorieEntry.update({ where: { id: found.id }, data: entryBody.parse(req.body), select });
  });

  app.delete<{ Params: { id: string } }>("/:id", async (req, reply) => {
    const found = await prisma.calorieEntry.findFirst({ where: { id: req.params.id, ...mine(req) } });
    if (!found) return reply.code(404).send({ error: "Introuvable" });
    await prisma.calorieEntry.delete({ where: { id: found.id } });
    return { ok: true };
  });
}

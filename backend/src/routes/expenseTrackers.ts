import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { prisma } from "../db.js";

const trackerBody = z.object({
  name: z.string().trim().min(1).max(100),
  emoji: z.string().trim().min(1).max(8),
});

export async function expenseTrackerRoutes(app: FastifyInstance) {
  app.get("/", async (req) =>
    prisma.expenseTracker.findMany({
      where: { householdId: req.user.householdId, ownerId: null },
      select: { id: true, name: true, emoji: true },
      orderBy: { createdAt: "asc" },
    }),
  );

  app.post("/", async (req) => {
    const body = trackerBody.parse(req.body);
    return prisma.expenseTracker.create({
      data: { ...body, householdId: req.user.householdId, createdById: req.user.id },
      select: { id: true, name: true, emoji: true },
    });
  });

  app.put<{ Params: { id: string } }>("/:id", async (req, reply) => {
    const body = trackerBody.parse(req.body);
    const existing = await prisma.expenseTracker.findFirst({
      where: { id: req.params.id, householdId: req.user.householdId },
    });
    if (!existing) return reply.code(404).send({ error: "Introuvable" });
    return prisma.expenseTracker.update({
      where: { id: existing.id },
      data: body,
      select: { id: true, name: true, emoji: true },
    });
  });

  // supprime aussi toutes les dépenses du carnet (cascade)
  app.delete<{ Params: { id: string } }>("/:id", async (req, reply) => {
    const { count } = await prisma.expenseTracker.deleteMany({
      where: { id: req.params.id, householdId: req.user.householdId },
    });
    if (!count) return reply.code(404).send({ error: "Introuvable" });
    return { ok: true };
  });
}

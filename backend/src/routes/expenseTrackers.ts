import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { prisma } from "../db.js";

const trackerBody = z.object({
  name: z.string().trim().min(1).max(100),
  emoji: z.string().trim().min(1).max(8),
});

// import d'un ancien Tricount : le carnet et toutes ses dépenses d'un coup
const importBody = trackerBody.extend({
  expenses: z
    .array(
      z.object({
        title: z.string().trim().min(1).max(200),
        amountCents: z.number().int().positive().max(100_000_000),
        paidById: z.string(),
        date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
        isReimbursement: z.boolean(),
        shares: z.array(z.object({ userId: z.string(), amountCents: z.number().int().positive() })).min(1),
      }),
    )
    .min(1)
    .max(5000),
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

  app.post("/import", { bodyLimit: 10 * 1024 * 1024 }, async (req, reply) => {
    const body = importBody.parse(req.body);
    const members = await prisma.user.findMany({ where: { householdId: req.user.householdId }, select: { id: true } });
    const ids = new Set(members.map((m) => m.id));
    for (const e of body.expenses) {
      const people = e.shares.map((s) => s.userId);
      if (!ids.has(e.paidById) || people.some((id) => !ids.has(id)) || new Set(people).size !== people.length) {
        return reply.code(400).send({ error: "Personne inconnue dans l'import" });
      }
      if (e.shares.reduce((sum, s) => sum + s.amountCents, 0) !== e.amountCents) {
        return reply.code(400).send({ error: `Répartition incorrecte : ${e.title}` });
      }
    }
    const { expenses, ...tracker } = body;
    const base = { householdId: req.user.householdId, createdById: req.user.id };
    return prisma.$transaction(async (tx) => {
      const created = await tx.expenseTracker.create({ data: { ...tracker, ...base }, select: { id: true, name: true, emoji: true } });
      for (const { shares, ...e } of expenses) {
        await tx.expense.create({ data: { ...e, ...base, trackerId: created.id, shares: { create: shares } } });
      }
      return created;
    }, { timeout: 60_000 });
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

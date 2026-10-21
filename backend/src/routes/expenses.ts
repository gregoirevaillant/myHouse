import type { FastifyInstance, FastifyRequest } from "fastify";
import { z } from "zod";
import { prisma } from "../db.js";
import { eur, notifyOthers } from "../push.js";

const expenseBody = z.object({
  trackerId: z.string(),
  title: z.string().trim().min(1).max(200),
  amountCents: z.number().int().positive().max(100_000_000),
  paidById: z.string(),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  isReimbursement: z.boolean().default(false),
  shares: z.array(z.object({ userId: z.string(), amountCents: z.number().int().min(0) })).min(1),
});

type ExpenseBody = z.infer<typeof expenseBody>;

const include = { shares: { select: { userId: true, amountCents: true } } } as const;

function httpError(statusCode: number, message: string) {
  return Object.assign(new Error(message), { statusCode });
}

// Vérifie que payeur et participants sont du foyer et que la répartition tombe juste
async function validate(req: FastifyRequest, body: ExpenseBody) {
  const members = await prisma.user.findMany({ where: { householdId: req.user.householdId }, select: { id: true } });
  const ids = new Set(members.map((m) => m.id));
  const tracker = await prisma.expenseTracker.findFirst({
    where: { id: body.trackerId, householdId: req.user.householdId },
    select: { id: true },
  });
  if (!tracker) throw httpError(400, "Carnet inconnu");
  if (!ids.has(body.paidById) || body.shares.some((s) => !ids.has(s.userId))) {
    throw httpError(400, "Personne inconnue");
  }
  if (new Set(body.shares.map((s) => s.userId)).size !== body.shares.length) throw httpError(400, "Répartition invalide");
  const total = body.shares.reduce((sum, s) => sum + s.amountCents, 0);
  if (total !== body.amountCents) throw httpError(400, "La répartition ne correspond pas au montant");
}

export async function expenseRoutes(app: FastifyInstance) {
  app.get("/", async (req) =>
    prisma.expense.findMany({
      where: { householdId: req.user.householdId, ownerId: null },
      include,
      orderBy: [{ date: "desc" }, { createdAt: "desc" }],
    }),
  );

  app.post("/", async (req) => {
    const body = expenseBody.parse(req.body);
    await validate(req, body);
    const { shares, ...data } = body;
    const expense = await prisma.expense.create({
      data: {
        ...data,
        householdId: req.user.householdId,
        createdById: req.user.id,
        shares: { create: shares.filter((s) => s.amountCents > 0) },
      },
      include: { ...include, tracker: { select: { name: true, emoji: true } } },
    });
    const { tracker, ...result } = expense;
    notifyOthers(req.user, "EXPENSES", (name, recipientId) => {
      const share = expense.shares.find((s) => s.userId === recipientId)?.amountCents;
      return {
        title: `${tracker.emoji} ${tracker.name}`,
        body: `${name} a ajouté ${expense.title} · ${eur(expense.amountCents)}${share ? ` (ta part : ${eur(share)})` : ""}`,
        url: `/depenses/${expense.trackerId}`,
      };
    }).catch((err) => req.log.error(err));
    return result;
  });

  app.put<{ Params: { id: string } }>("/:id", async (req, reply) => {
    const body = expenseBody.parse(req.body);
    const existing = await prisma.expense.findFirst({ where: { id: req.params.id, householdId: req.user.householdId } });
    if (!existing) return reply.code(404).send({ error: "Introuvable" });
    await validate(req, body);
    const { shares, ...data } = body;
    return prisma.expense.update({
      where: { id: existing.id },
      data: { ...data, shares: { deleteMany: {}, create: shares.filter((s) => s.amountCents > 0) } },
      include,
    });
  });

  app.delete<{ Params: { id: string } }>("/:id", async (req, reply) => {
    const { count } = await prisma.expense.deleteMany({
      where: { id: req.params.id, householdId: req.user.householdId },
    });
    if (!count) return reply.code(404).send({ error: "Introuvable" });
    return { ok: true };
  });
}

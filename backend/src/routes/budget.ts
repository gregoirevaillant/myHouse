import type { FastifyInstance, FastifyRequest } from "fastify";
import { z } from "zod";
import { prisma } from "../db.js";

const CATEGORIES = [
  "LOGEMENT",
  "ABONNEMENTS",
  "ASSURANCES",
  "TRANSPORT",
  "IMPOTS",
  "SANTE",
  "ENFANTS",
  "EPARGNE",
  "AUTRE",
  "SALAIRE",
  "AUTRE_REVENU",
] as const;

const itemBody = z
  .object({
    label: z.string().trim().min(1).max(100),
    kind: z.enum(["EXPENSE", "INCOME"]),
    period: z.enum(["MONTHLY", "YEARLY"]),
    amountCents: z.number().int().min(1).max(100_000_000),
    category: z.enum(CATEGORIES),
    dueDay: z.number().int().min(1).max(31),
    dueMonth: z.number().int().min(1).max(12).nullish(),
    active: z.boolean().default(true),
    note: z
      .string()
      .trim()
      .max(500)
      .nullish()
      .transform((n) => n || null),
    // true = visible par moi seulement
    private: z.boolean().default(true),
  })
  .transform((b) => ({ ...b, dueMonth: b.period === "YEARLY" ? (b.dueMonth ?? 1) : null }));

const select = {
  id: true,
  label: true,
  kind: true,
  period: true,
  amountCents: true,
  category: true,
  dueDay: true,
  dueMonth: true,
  active: true,
  note: true,
  ownerId: true,
} as const;
const publicItem = <T extends { ownerId: string | null }>({ ownerId, ...i }: T) => ({ ...i, private: ownerId !== null });

// les lignes partagées du foyer et mes lignes privées
const visibleTo = (req: FastifyRequest) => ({
  householdId: req.user.householdId,
  OR: [{ ownerId: null }, { ownerId: req.user.id }],
});

export async function budgetRoutes(app: FastifyInstance) {
  const find = (req: FastifyRequest<{ Params: { id: string } }>) => prisma.budgetItem.findFirst({ where: { id: req.params.id, ...visibleTo(req) } });

  app.get("/", async (req) => {
    const list = await prisma.budgetItem.findMany({ where: visibleTo(req), select, orderBy: [{ dueDay: "asc" }, { label: "asc" }] });
    return list.map(publicItem);
  });

  app.post("/", async (req) => {
    const { private: isPrivate, ...data } = itemBody.parse(req.body);
    const item = await prisma.budgetItem.create({
      data: { ...data, householdId: req.user.householdId, createdById: req.user.id, ownerId: isPrivate ? req.user.id : null },
      select,
    });
    return publicItem(item);
  });

  app.patch<{ Params: { id: string } }>("/:id", async (req, reply) => {
    if (!(await find(req))) return reply.code(404).send({ error: "Introuvable" });
    const { private: isPrivate, ...data } = itemBody.parse(req.body);
    const item = await prisma.budgetItem.update({
      where: { id: req.params.id },
      data: { ...data, ownerId: isPrivate ? req.user.id : null },
      select,
    });
    return publicItem(item);
  });

  app.delete<{ Params: { id: string } }>("/:id", async (req, reply) => {
    if (!(await find(req))) return reply.code(404).send({ error: "Introuvable" });
    await prisma.budgetItem.delete({ where: { id: req.params.id } });
    return { ok: true };
  });
}

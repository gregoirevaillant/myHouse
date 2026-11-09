import type { FastifyInstance, FastifyRequest } from "fastify";
import { z } from "zod";
import { prisma } from "../db.js";
import { syncBudgetExpenses } from "../budgetSync.js";

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
    // charge commune : qui paie (elle est reportée dans le carnet « Vie quotidienne »)
    paidById: z.string().nullish(),
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
  paidById: true,
} as const;
const publicItem = <T extends { ownerId: string | null }>({ ownerId, ...i }: T) => ({ ...i, private: ownerId !== null });

const yesterday = () => new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Paris" }).format(new Date(Date.now() - 864e5));

// Champs du report automatique : seule une charge commune avec payeur est reportée. Le report démarre à l'enregistrement
// (échéance du jour et suivantes, sans rattraper le passé) ; une charge déjà suivie garde sa date de dernier report.
async function billing(req: FastifyRequest, b: { private: boolean; kind: string; paidById?: string | null }, previous: string | null) {
  if (b.private || b.kind !== "EXPENSE") return { paidById: null, lastBilledOn: null };
  const payer = await prisma.user.findFirst({ where: { id: b.paidById ?? "", householdId: req.user.householdId }, select: { id: true } });
  if (!payer) throw Object.assign(new Error("Choisis qui paie"), { statusCode: 400 });
  return { paidById: payer.id, lastBilledOn: previous ?? yesterday() };
}

// les lignes partagées du foyer et mes lignes privées
const visibleTo = (req: FastifyRequest) => ({
  householdId: req.user.householdId,
  OR: [{ ownerId: null }, { ownerId: req.user.id }],
});

export async function budgetRoutes(app: FastifyInstance) {
  const find = (req: FastifyRequest<{ Params: { id: string } }>) => prisma.budgetItem.findFirst({ where: { id: req.params.id, ...visibleTo(req) } });

  app.get("/", async (req) => {
    await syncBudgetExpenses(req.user.householdId);
    const list = await prisma.budgetItem.findMany({ where: visibleTo(req), select, orderBy: [{ dueDay: "asc" }, { label: "asc" }] });
    return list.map(publicItem);
  });

  app.post("/", async (req) => {
    const body = itemBody.parse(req.body);
    const { private: isPrivate, paidById: _payer, ...data } = body;
    const bill = await billing(req, body, null);
    const item = await prisma.budgetItem.create({
      data: { ...data, ...bill, householdId: req.user.householdId, createdById: req.user.id, ownerId: isPrivate ? req.user.id : null },
      select,
    });
    return publicItem(item);
  });

  app.patch<{ Params: { id: string } }>("/:id", async (req, reply) => {
    const existing = await find(req);
    if (!existing) return reply.code(404).send({ error: "Introuvable" });
    const body = itemBody.parse(req.body);
    const { private: isPrivate, paidById: _payer, ...data } = body;
    const bill = await billing(req, body, existing.ownerId === null ? existing.lastBilledOn : null);
    const item = await prisma.budgetItem.update({
      where: { id: req.params.id },
      data: { ...data, ...bill, ownerId: isPrivate ? req.user.id : null },
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

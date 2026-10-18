import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { prisma } from "../db.js";

export async function shoppingRoutes(app: FastifyInstance) {
  app.get("/", async (req) =>
    prisma.shoppingItem.findMany({
      where: { householdId: req.user.householdId, ownerId: null },
      orderBy: [{ checked: "asc" }, { createdAt: "desc" }],
    }),
  );

  app.post("/", async (req) => {
    const { label } = z.object({ label: z.string().trim().min(1).max(200) }).parse(req.body);
    return prisma.shoppingItem.create({
      data: { label, householdId: req.user.householdId, createdById: req.user.id },
    });
  });

  // déclarée avant /:id pour ne pas être capturée par le paramètre
  app.delete("/checked", async (req) => {
    const { count } = await prisma.shoppingItem.deleteMany({
      where: { householdId: req.user.householdId, ownerId: null, checked: true },
    });
    return { count };
  });

  app.patch<{ Params: { id: string } }>("/:id", async (req, reply) => {
    const body = z
      .object({ label: z.string().trim().min(1).max(200).optional(), checked: z.boolean().optional() })
      .parse(req.body);
    const { count } = await prisma.shoppingItem.updateMany({
      where: { id: req.params.id, householdId: req.user.householdId },
      data: {
        ...body,
        ...(body.checked !== undefined && { checkedAt: body.checked ? new Date() : null }),
      },
    });
    if (!count) return reply.code(404).send({ error: "Introuvable" });
    return prisma.shoppingItem.findUnique({ where: { id: req.params.id } });
  });

  app.delete<{ Params: { id: string } }>("/:id", async (req, reply) => {
    const { count } = await prisma.shoppingItem.deleteMany({
      where: { id: req.params.id, householdId: req.user.householdId },
    });
    if (!count) return reply.code(404).send({ error: "Introuvable" });
    return { ok: true };
  });
}

import type { FastifyInstance, FastifyRequest } from "fastify";
import { z } from "zod";
import { prisma } from "../db.js";

const infoBody = z.object({
  category: z.enum(["CODE", "WIFI", "CONTACT", "MAISON", "AUTRE"]),
  label: z.string().trim().min(1).max(100),
  value: z.string().trim().min(1).max(2000),
  note: z
    .string()
    .trim()
    .max(2000)
    .nullish()
    .transform((n) => n || null),
  // true = visible par moi seulement
  private: z.boolean().default(false),
});

const select = { id: true, category: true, label: true, value: true, note: true, ownerId: true } as const;
const publicInfo = <T extends { ownerId: string | null }>({ ownerId, ...i }: T) => ({ ...i, private: ownerId !== null });

// les infos partagées du foyer et mes infos privées
const visibleTo = (req: FastifyRequest) => ({
  householdId: req.user.householdId,
  OR: [{ ownerId: null }, { ownerId: req.user.id }],
});

export async function infoRoutes(app: FastifyInstance) {
  const find = (req: FastifyRequest<{ Params: { id: string } }>) => prisma.houseInfo.findFirst({ where: { id: req.params.id, ...visibleTo(req) } });

  app.get("/", async (req) => {
    const list = await prisma.houseInfo.findMany({ where: visibleTo(req), select, orderBy: { label: "asc" } });
    return list.map(publicInfo);
  });

  app.post("/", async (req) => {
    const { private: isPrivate, ...data } = infoBody.parse(req.body);
    const info = await prisma.houseInfo.create({
      data: { ...data, householdId: req.user.householdId, createdById: req.user.id, ownerId: isPrivate ? req.user.id : null },
      select,
    });
    return publicInfo(info);
  });

  app.patch<{ Params: { id: string } }>("/:id", async (req, reply) => {
    if (!(await find(req))) return reply.code(404).send({ error: "Introuvable" });
    const { private: isPrivate, ...data } = infoBody.parse(req.body);
    const info = await prisma.houseInfo.update({
      where: { id: req.params.id },
      data: { ...data, ownerId: isPrivate ? req.user.id : null },
      select,
    });
    return publicInfo(info);
  });

  app.delete<{ Params: { id: string } }>("/:id", async (req, reply) => {
    if (!(await find(req))) return reply.code(404).send({ error: "Introuvable" });
    await prisma.houseInfo.delete({ where: { id: req.params.id } });
    return { ok: true };
  });
}

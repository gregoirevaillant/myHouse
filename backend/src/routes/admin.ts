import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { MIN_PASSWORD } from "../auth.js";
import { prisma } from "../db.js";
import { broadcast } from "../live.js";
import { MODULES, parseFeatures } from "../modules.js";
import { hashPassword } from "../password.js";

// Réservé à l'administrateur (contrôlé par requireModule). Ne renvoie jamais de données d'une famille, seulement ses membres et ses pages.
const features = z.array(z.enum(MODULES)).max(MODULES.length);
const name = z.string().trim().min(1).max(100);
const password = z.string().min(MIN_PASSWORD, `${MIN_PASSWORD} caractères minimum`).max(200);

const toCsv = (list: readonly string[]) => MODULES.filter((m) => list.includes(m)).join(",");

const publicHousehold = (h: { id: string; name: string; features: string; users: { id: string; name: string; email: string; isAdmin: boolean; mustChangePassword: boolean }[] }) => ({
  id: h.id,
  name: h.name,
  features: parseFeatures(h.features),
  users: h.users,
});

const select = {
  id: true,
  name: true,
  features: true,
  users: { select: { id: true, name: true, email: true, isAdmin: true, mustChangePassword: true }, orderBy: { email: "asc" as const } },
};

export async function adminRoutes(app: FastifyInstance) {
  app.get("/households", async () => (await prisma.household.findMany({ select, orderBy: { name: "asc" } })).map(publicHousehold));

  app.post("/households", async (req) => {
    const body = z.object({ name, features }).parse(req.body);
    return publicHousehold(await prisma.household.create({ data: { name: body.name, features: toCsv(body.features) }, select }));
  });

  app.patch<{ Params: { id: string } }>("/households/:id", async (req, reply) => {
    const body = z.object({ name, features }).partial().parse(req.body);
    const { count } = await prisma.household.updateMany({
      where: { id: req.params.id },
      data: { name: body.name, features: body.features && toCsv(body.features) },
    });
    if (!count) return reply.code(404).send({ error: "Introuvable" });
    // les appareils ouverts de cette famille rechargent leurs droits tout de suite
    broadcast(req.params.id, [["me"]]);
    return publicHousehold(await prisma.household.findUniqueOrThrow({ where: { id: req.params.id }, select }));
  });

  // mot de passe provisoire : la personne doit le changer à sa première connexion
  app.post<{ Params: { id: string } }>("/households/:id/users", async (req, reply) => {
    const body = z.object({ name, email: z.string().trim().toLowerCase().email().max(200), password }).parse(req.body);
    if (!(await prisma.household.findUnique({ where: { id: req.params.id }, select: { id: true } }))) {
      return reply.code(404).send({ error: "Introuvable" });
    }
    if (await prisma.user.findUnique({ where: { email: body.email }, select: { id: true } })) {
      return reply.code(409).send({ error: "Cet email a déjà un compte" });
    }
    await prisma.user.create({
      data: { name: body.name, email: body.email, passwordHash: await hashPassword(body.password), householdId: req.params.id, mustChangePassword: true },
    });
    return publicHousehold(await prisma.household.findUniqueOrThrow({ where: { id: req.params.id }, select }));
  });

  // réinitialisation : coupe toutes les sessions de la personne et lui impose un nouveau mot de passe
  app.post<{ Params: { id: string } }>("/users/:id/password", async (req, reply) => {
    const body = z.object({ password }).parse(req.body);
    const { count } = await prisma.user.updateMany({
      where: { id: req.params.id },
      data: { passwordHash: await hashPassword(body.password), sessionVersion: { increment: 1 }, mustChangePassword: true },
    });
    if (!count) return reply.code(404).send({ error: "Introuvable" });
    return { ok: true };
  });
}

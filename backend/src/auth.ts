import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { z } from "zod";
import { prisma } from "./db.js";
import { hashPassword, verifyPassword } from "./password.js";

export type SessionUser = { id: string; householdId: string };

declare module "@fastify/jwt" {
  interface FastifyJWT {
    payload: SessionUser;
    user: SessionUser;
  }
}

const COOKIE = "session";
const MAX_AGE = 60 * 60 * 24 * 30;

export async function requireAuth(req: FastifyRequest, reply: FastifyReply) {
  try {
    await req.jwtVerify({ onlyCookie: true });
  } catch {
    return reply.code(401).send({ error: "Non connecté" });
  }
}

const publicUser = (u: { id: string; email: string; name: string }) => ({ id: u.id, email: u.email, name: u.name });

export async function authRoutes(app: FastifyInstance) {
  app.post(
    "/login",
    { config: { rateLimit: { max: 10, timeWindow: "1 minute" } } },
    async (req, reply) => {
      const body = z.object({ email: z.string(), password: z.string() }).parse(req.body);
      const user = await prisma.user.findUnique({ where: { email: body.email.toLowerCase().trim() } });
      if (!user || !(await verifyPassword(body.password, user.passwordHash))) {
        return reply.code(401).send({ error: "Email ou mot de passe incorrect" });
      }
      const token = await reply.jwtSign({ id: user.id, householdId: user.householdId }, { expiresIn: "30d" });
      reply.setCookie(COOKIE, token, {
        path: "/",
        httpOnly: true,
        sameSite: "lax",
        secure: req.protocol === "https",
        maxAge: MAX_AGE,
      });
      return publicUser(user);
    },
  );

  app.post("/logout", async (_req, reply) => {
    reply.clearCookie(COOKIE, { path: "/" });
    return { ok: true };
  });

  app.get("/me", { preHandler: requireAuth }, async (req, reply) => {
    const user = await prisma.user.findUnique({ where: { id: req.user.id } });
    if (!user) return reply.code(401).send({ error: "Non connecté" });
    return publicUser(user);
  });

  app.post("/password", { preHandler: requireAuth }, async (req, reply) => {
    const body = z.object({ current: z.string(), next: z.string().min(6) }).parse(req.body);
    const user = await prisma.user.findUniqueOrThrow({ where: { id: req.user.id } });
    if (!(await verifyPassword(body.current, user.passwordHash))) {
      return reply.code(400).send({ error: "Mot de passe actuel incorrect" });
    }
    await prisma.user.update({ where: { id: user.id }, data: { passwordHash: await hashPassword(body.next) } });
    return { ok: true };
  });
}

export const COOKIE_NAME = COOKIE;

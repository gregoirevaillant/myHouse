import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { randomBytes } from "node:crypto";
import { z } from "zod";
import { prisma } from "./db.js";
import { parseFeatures } from "./modules.js";
import { hashPassword, verifyPassword } from "./password.js";
import { NOTIFICATION_TYPES, type NotificationType } from "./push.js";

// sv = version de session de la personne : un changement de mot de passe invalide les anciens cookies
export type SessionUser = { id: string; householdId: string; sv?: number };

declare module "@fastify/jwt" {
  interface FastifyJWT {
    payload: SessionUser;
    user: SessionUser;
  }
}

const COOKIE = "session";
const MAX_AGE = 60 * 60 * 24 * 30;
export const MIN_PASSWORD = 10;

// Vérifie le cookie ET que la personne existe encore avec la même version de session ; charge ses droits (req.access)
export async function requireAuth(req: FastifyRequest, reply: FastifyReply) {
  try {
    await req.jwtVerify({ onlyCookie: true });
  } catch {
    return reply.code(401).send({ error: "Non connecté" });
  }
  const user = await prisma.user.findUnique({
    where: { id: req.user.id },
    select: { householdId: true, sessionVersion: true, isAdmin: true, mustChangePassword: true, household: { select: { features: true } } },
  });
  // ?? 0 : les cookies émis avant l'ajout de la version restent valables
  if (!user || user.sessionVersion !== (req.user.sv ?? 0)) return reply.code(401).send({ error: "Non connecté" });
  req.user.householdId = user.householdId;
  req.access = {
    isAdmin: user.isAdmin,
    mustChangePassword: user.mustChangePassword,
    features: new Set(parseFeatures(user.household.features)),
  };
}

type UserRow = {
  id: string;
  email: string;
  name: string;
  isAdmin: boolean;
  mustChangePassword: boolean;
  calorieGoal: number | null;
  hiddenTabs: string;
  hiddenHome: string;
  menuOrder: string;
  homeWide: string;
  showNavBar: boolean;
  mutedNotifications: string;
  household: { features: string };
};

const withHousehold = { household: { select: { features: true } } } as const;

const publicUser = (u: UserRow) => ({
  id: u.id,
  email: u.email,
  name: u.name,
  isAdmin: u.isAdmin,
  mustChangePassword: u.mustChangePassword,
  features: parseFeatures(u.household.features),
  calorieGoal: u.calorieGoal,
  menuOrder: u.menuOrder ? u.menuOrder.split(",") : [],
  homeWide: u.homeWide ? u.homeWide.split(",") : [],
  hiddenHome: u.hiddenHome ? u.hiddenHome.split(",") : [],
  hiddenTabs: u.hiddenTabs ? u.hiddenTabs.split(",") : [],
  showNavBar: u.showNavBar,
  // ignore les types de notification supprimés depuis
  mutedNotifications: u.mutedNotifications.split(",").filter((t): t is NotificationType => (NOTIFICATION_TYPES as readonly string[]).includes(t)),
});

async function startSession(req: FastifyRequest, reply: FastifyReply, user: { id: string; householdId: string; sessionVersion: number }) {
  const token = await reply.jwtSign({ id: user.id, householdId: user.householdId, sv: user.sessionVersion }, { expiresIn: "30d" });
  reply.setCookie(COOKIE, token, {
    path: "/",
    httpOnly: true,
    sameSite: "lax",
    secure: req.protocol === "https",
    maxAge: MAX_AGE,
  });
}

// Échecs de connexion par (adresse + email) : au-delà de 10 en 15 minutes, on refuse même le bon mot de passe pendant 15 minutes.
// shortcut: en mémoire, remis à zéro au redémarrage ; suffisant pour un seul conteneur.
const MAX_FAILS = 10;
const LOCK_MS = 15 * 60 * 1000;
const fails = new Map<string, { count: number; since: number }>();
const failKey = (req: FastifyRequest, email: string) => `${req.ip}|${email}`;
const isLocked = (key: string) => {
  const f = fails.get(key);
  if (f && Date.now() - f.since > LOCK_MS) fails.delete(key);
  return (fails.get(key)?.count ?? 0) >= MAX_FAILS;
};
const addFail = (key: string) => {
  const f = fails.get(key);
  fails.set(key, f ? { ...f, count: f.count + 1 } : { count: 1, since: Date.now() });
};

// hash factice : un email inconnu coûte le même temps de calcul qu'un mot de passe faux (pas de déduction des comptes par le délai)
const DUMMY_HASH = await hashPassword(randomBytes(16).toString("hex"));

export async function authRoutes(app: FastifyInstance) {
  app.post(
    "/login",
    { config: { rateLimit: { max: 10, timeWindow: "1 minute" } } },
    async (req, reply) => {
      const body = z.object({ email: z.string().max(200), password: z.string().max(200) }).parse(req.body);
      const email = body.email.toLowerCase().trim();
      const key = failKey(req, email);
      if (isLocked(key)) return reply.code(429).send({ error: "Trop d'essais, réessaie dans quelques minutes" });
      const user = await prisma.user.findUnique({ where: { email }, include: withHousehold });
      const ok = await verifyPassword(body.password, user?.passwordHash ?? DUMMY_HASH);
      if (!user || !ok) {
        addFail(key);
        req.log.warn({ email, ip: req.ip }, "connexion refusée");
        return reply.code(401).send({ error: "Email ou mot de passe incorrect" });
      }
      fails.delete(key);
      req.log.info({ userId: user.id, ip: req.ip }, "connexion");
      await startSession(req, reply, user);
      return publicUser(user);
    },
  );

  app.post("/logout", async (_req, reply) => {
    reply.clearCookie(COOKIE, { path: "/" });
    return { ok: true };
  });

  app.get("/me", { preHandler: requireAuth }, async (req, reply) => {
    const user = await prisma.user.findUnique({ where: { id: req.user.id }, include: withHousehold });
    if (!user) return reply.code(401).send({ error: "Non connecté" });
    return publicUser(user);
  });

  app.patch("/preferences", { preHandler: requireAuth }, async (req) => {
    const body = z
      .object({
        hiddenTabs: z.array(z.string().regex(/^\/[a-z-]+$/)).max(20),
        hiddenHome: z.array(z.string().regex(/^\/[a-z-]+$/)).max(20),
        menuOrder: z.array(z.string().regex(/^\/[a-z-]+$/)).max(20),
        homeWide: z.array(z.string().regex(/^\/[a-z-]+$/)).max(20),
        showNavBar: z.boolean(),
        mutedNotifications: z.array(z.enum(NOTIFICATION_TYPES)),
        calorieGoal: z.number().int().min(500).max(10000).nullable(),
      })
      .partial()
      .parse(req.body);
    const user = await prisma.user.update({
      where: { id: req.user.id },
      data: {
        hiddenTabs: body.hiddenTabs?.join(","),
        hiddenHome: body.hiddenHome?.join(","),
        menuOrder: body.menuOrder?.join(","),
        homeWide: body.homeWide?.join(","),
        showNavBar: body.showNavBar,
        calorieGoal: body.calorieGoal,
        mutedNotifications: body.mutedNotifications?.join(","),
      },
      include: withHousehold,
    });
    return publicUser(user);
  });

  // limitation de débit : sans elle, un cookie volé permettrait de deviner le mot de passe actuel
  app.post("/password", { preHandler: requireAuth, config: { rateLimit: { max: 10, timeWindow: "1 minute" } } }, async (req, reply) => {
    const body = z.object({ current: z.string().max(200), next: z.string().min(MIN_PASSWORD, `${MIN_PASSWORD} caractères minimum`).max(200) }).parse(req.body);
    const user = await prisma.user.findUniqueOrThrow({ where: { id: req.user.id } });
    if (!(await verifyPassword(body.current, user.passwordHash))) {
      return reply.code(400).send({ error: "Mot de passe actuel incorrect" });
    }
    if (body.next === body.current) return reply.code(400).send({ error: "Choisis un mot de passe différent" });
    // sessionVersion + 1 : les autres appareils (et un éventuel cookie volé) sont déconnectés ; celui-ci reçoit un nouveau cookie
    const updated = await prisma.user.update({
      where: { id: user.id },
      data: { passwordHash: await hashPassword(body.next), sessionVersion: { increment: 1 }, mustChangePassword: false },
    });
    await startSession(req, reply, updated);
    return { ok: true };
  });
}

export const COOKIE_NAME = COOKIE;

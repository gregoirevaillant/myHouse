import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { prisma } from "../db.js";
import { bankEnabled, env } from "../env.js";
import { createSession, deleteSession, listAspsps, startAuth, type Aspsp } from "../enableBanking.js";
import { detectRecurring } from "../budget/recurring.js";
import { syncOwner } from "../budget/sync.js";

const COUNTRY = "FR";
const MAX_CONSENT_DAYS = 180;

function httpError(statusCode: number, message: string) {
  return Object.assign(new Error(message), { statusCode });
}

// la liste des banques change rarement : gardée une journée en mémoire
let aspspCache: { at: number; list: Aspsp[] } | null = null;
async function aspsps() {
  if (!aspspCache || Date.now() - aspspCache.at > 86_400_000) aspspCache = { at: Date.now(), list: await listAspsps(COUNTRY) };
  return aspspCache.list;
}

export async function bankRoutes(app: FastifyInstance) {
  app.addHook("preHandler", async (_req, reply) => {
    if (!bankEnabled) return reply.code(503).send({ error: "Connexion bancaire non configurée" });
  });

  app.get("/aspsps", async () => (await aspsps()).map(({ name, logo }) => ({ name, logo: logo ?? null })));

  app.post("/connect", async (req) => {
    const { aspspName } = z.object({ aspspName: z.string().min(1) }).parse(req.body);
    const aspsp = (await aspsps()).find((a) => a.name === aspspName);
    if (!aspsp) throw httpError(400, "Banque inconnue");
    const maxDays = aspsp.maximum_consent_validity ? aspsp.maximum_consent_validity / 86_400 : MAX_CONSENT_DAYS;
    const validUntil = new Date(Date.now() + Math.min(MAX_CONSENT_DAYS, maxDays) * 86_400_000);
    // state signé : au retour de la banque, on vérifie que c'est bien la même personne qui termine la connexion
    const state = app.jwt.sign({ id: req.user.id, householdId: req.user.householdId }, { expiresIn: "15m" });
    const { url } = await startAuth({
      aspsp: { name: aspsp.name, country: COUNTRY },
      validUntil,
      state,
      redirectUrl: `${env.publicUrl}/budget/banque`,
    });
    return { url };
  });

  app.post("/sessions", async (req) => {
    const body = z.object({ code: z.string().min(1), state: z.string().min(1) }).parse(req.body);
    let state: { id: string };
    try {
      state = app.jwt.verify(body.state);
    } catch {
      throw httpError(400, "Lien de connexion expiré, recommence");
    }
    if (state.id !== req.user.id) throw httpError(403, "Connexion lancée par une autre personne");

    const session = await createSession(body.code);
    const ownerId = req.user.id;
    const connection = await prisma.bankConnection.create({
      data: {
        householdId: req.user.householdId,
        ownerId,
        aspspName: session.aspsp?.name ?? "Banque",
        aspspCountry: COUNTRY,
        sessionId: session.session_id,
        validUntil: new Date(session.access.valid_until),
      },
    });

    for (const a of session.accounts) {
      if (!a.uid) continue;
      const iban = a.account_id?.iban ?? null;
      const data = {
        connectionId: connection.id,
        uid: a.uid,
        name: a.name || a.details || a.product || "Compte",
        iban,
        accountType: a.cash_account_type ?? null,
        currency: a.currency,
      };
      // reconnexion d'un compte déjà connu : on garde son historique et ses corrections
      const known = iban ? await prisma.bankAccount.findFirst({ where: { ownerId, iban } }) : null;
      if (known) await prisma.bankAccount.update({ where: { id: known.id }, data: { ...data, lastSyncAt: null } });
      else await prisma.bankAccount.create({ data: { ...data, ownerId } });
    }
    // anciennes connexions vidées par la reconnexion
    await prisma.bankConnection.deleteMany({ where: { ownerId, id: { not: connection.id }, accounts: { none: {} } } });

    const errors = await syncOwner(ownerId, req.user.householdId, { force: true });
    return { ok: true, errors };
  });

  app.post("/sync", async (req) => {
    const errors = await syncOwner(req.user.id, req.user.householdId);
    return { ok: true, errors };
  });

  app.delete<{ Params: { id: string } }>("/connections/:id", async (req, reply) => {
    const connection = await prisma.bankConnection.findFirst({ where: { id: req.params.id, ownerId: req.user.id } });
    if (!connection) return reply.code(404).send({ error: "Introuvable" });
    await deleteSession(connection.sessionId).catch(() => {});
    await prisma.bankConnection.delete({ where: { id: connection.id } });
    await detectRecurring(req.user.id, req.user.householdId);
    return { ok: true };
  });
}

import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { prisma } from "../db.js";
import { sendPush, vapidPublicKey } from "../push.js";

export async function pushRoutes(app: FastifyInstance) {
  app.get("/key", async () => ({ publicKey: vapidPublicKey }));

  // un appareil s'abonne (ou renouvelle son abonnement) : l'endpoint identifie le navigateur
  app.post("/subscriptions", async (req) => {
    const body = z
      .object({ endpoint: z.string().url().max(2000), keys: z.object({ p256dh: z.string().max(200), auth: z.string().max(200) }) })
      .parse(req.body);
    const data = { userId: req.user.id, householdId: req.user.householdId, p256dh: body.keys.p256dh, auth: body.keys.auth };
    await prisma.pushSubscription.upsert({ where: { endpoint: body.endpoint }, create: { endpoint: body.endpoint, ...data }, update: data });
    return { ok: true };
  });

  app.delete("/subscriptions", async (req) => {
    const { endpoint } = z.object({ endpoint: z.string() }).parse(req.body);
    await prisma.pushSubscription.deleteMany({ where: { endpoint, userId: req.user.id } });
    return { ok: true };
  });

  app.post("/test", async (req, reply) => {
    const count = await prisma.pushSubscription.count({ where: { userId: req.user.id } });
    if (!count) return reply.code(400).send({ error: "Aucun appareil abonné aux notifications" });
    await sendPush(req.user.id, null, { title: "🏠 Maison", body: "Les notifications fonctionnent !", url: "/profil", tag: "test" }, true);
    return { ok: true };
  });
}

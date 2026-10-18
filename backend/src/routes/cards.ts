import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { prisma } from "../db.js";
import { readMultipart, removeImage, saveImage, sendImage } from "../uploads.js";

const cardFields = z.object({
  name: z.string().trim().min(1).max(100),
  type: z.enum(["BARCODE", "QR", "NUMBER"]),
  value: z.string().trim().max(500).optional(),
  barcodeFormat: z.string().max(20).optional(),
  description: z.string().max(2000).optional(),
  color: z.string().max(20),
});

// les champs multipart arrivent en texte : "" = non renseigné
const clean = (f: Record<string, string>) =>
  Object.fromEntries(Object.entries(f).filter(([, v]) => v !== ""));

const publicCard = <T extends { imagePath: string | null }>({ imagePath, ...c }: T) => ({
  ...c,
  hasImage: !!imagePath,
});

export async function cardRoutes(app: FastifyInstance) {
  app.get("/", async (req) => {
    const cards = await prisma.loyaltyCard.findMany({
      where: { householdId: req.user.householdId, ownerId: null },
      orderBy: { name: "asc" },
    });
    return cards.map(publicCard);
  });

  app.get<{ Params: { id: string } }>("/:id", async (req, reply) => {
    const card = await prisma.loyaltyCard.findFirst({
      where: { id: req.params.id, householdId: req.user.householdId },
    });
    if (!card) return reply.code(404).send({ error: "Introuvable" });
    return publicCard(card);
  });

  app.get<{ Params: { id: string } }>("/:id/image", async (req, reply) => {
    const card = await prisma.loyaltyCard.findFirst({
      where: { id: req.params.id, householdId: req.user.householdId },
    });
    if (!card?.imagePath) return reply.code(404).send({ error: "Introuvable" });
    return sendImage(reply, card.imagePath);
  });

  app.post("/", async (req, reply) => {
    const { fields, image } = await readMultipart(req);
    const data = cardFields.parse(clean(fields));
    if (data.type !== "QR" && !data.value) return reply.code(400).send({ error: "Code requis" });
    if (data.type === "QR" && !data.value && !image) return reply.code(400).send({ error: "Photo ou code requis" });
    const imagePath = image ? await saveImage(image) : null;
    const card = await prisma.loyaltyCard.create({
      data: { ...data, imagePath, householdId: req.user.householdId, createdById: req.user.id },
    });
    return publicCard(card);
  });

  app.patch<{ Params: { id: string } }>("/:id", async (req, reply) => {
    const card = await prisma.loyaltyCard.findFirst({
      where: { id: req.params.id, householdId: req.user.householdId },
    });
    if (!card) return reply.code(404).send({ error: "Introuvable" });
    const { fields, image } = await readMultipart(req);
    const removeImg = fields.removeImage === "true";
    delete fields.removeImage;
    const data = cardFields.partial().parse(fields);
    // une chaîne vide efface la valeur optionnelle
    const nullable = Object.fromEntries(Object.entries(data).map(([k, v]) => [k, v === "" ? null : v]));
    let imagePath = card.imagePath;
    if (image || removeImg) {
      await removeImage(card.imagePath);
      imagePath = image ? await saveImage(image) : null;
    }
    const updated = await prisma.loyaltyCard.update({
      where: { id: card.id },
      data: { ...nullable, imagePath },
    });
    return publicCard(updated);
  });

  app.delete<{ Params: { id: string } }>("/:id", async (req, reply) => {
    const card = await prisma.loyaltyCard.findFirst({
      where: { id: req.params.id, householdId: req.user.householdId },
    });
    if (!card) return reply.code(404).send({ error: "Introuvable" });
    await prisma.loyaltyCard.delete({ where: { id: card.id } });
    await removeImage(card.imagePath);
    return { ok: true };
  });
}

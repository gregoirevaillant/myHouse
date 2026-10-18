import type { FastifyInstance } from "fastify";
import { createReadStream } from "node:fs";
import { mkdir, unlink, writeFile } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import path from "node:path";
import { z } from "zod";
import { prisma } from "../db.js";
import { env } from "../env.js";

const uploadDir = path.resolve(env.dataDir, "uploads");

const IMAGE_EXT: Record<string, string> = {
  "image/jpeg": ".jpg",
  "image/png": ".png",
  "image/webp": ".webp",
  "image/heic": ".heic",
  "image/heif": ".heif",
};

const cardFields = z.object({
  name: z.string().trim().min(1).max(100),
  type: z.enum(["BARCODE", "QR", "NUMBER"]),
  value: z.string().trim().max(500).optional(),
  barcodeFormat: z.string().max(20).optional(),
  description: z.string().max(2000).optional(),
  color: z.string().max(20),
});

type Parsed = { fields: Record<string, string>; image?: { buffer: Buffer; mimetype: string } };

async function readMultipart(req: import("fastify").FastifyRequest): Promise<Parsed> {
  const fields: Record<string, string> = {};
  let image: Parsed["image"];
  for await (const part of req.parts()) {
    if (part.type === "file") {
      if (part.fieldname === "image" && IMAGE_EXT[part.mimetype]) {
        image = { buffer: await part.toBuffer(), mimetype: part.mimetype };
      } else {
        await part.toBuffer();
      }
    } else {
      fields[part.fieldname] = String(part.value);
    }
  }
  return { fields, image };
}

async function saveImage(image: NonNullable<Parsed["image"]>) {
  await mkdir(uploadDir, { recursive: true });
  const name = randomUUID() + IMAGE_EXT[image.mimetype];
  await writeFile(path.join(uploadDir, name), image.buffer);
  return name;
}

async function removeImage(name: string | null) {
  if (name) await unlink(path.join(uploadDir, name)).catch(() => {});
}

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
    const ext = path.extname(card.imagePath);
    const mime = Object.entries(IMAGE_EXT).find(([, e]) => e === ext)?.[0] ?? "application/octet-stream";
    return reply.type(mime).header("Cache-Control", "private, max-age=86400").send(
      createReadStream(path.join(uploadDir, card.imagePath)),
    );
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

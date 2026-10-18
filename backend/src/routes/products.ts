import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { prisma } from "../db.js";
import { readMultipart, removeImage, saveImage, sendImage } from "../uploads.js";

// "  Mouchoirs Lotus " et "mouchoirs lotus" désignent le même produit
export const nameKey = (name: string) =>
  name.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().trim().replace(/\s+/g, " ");

export const publicProduct = <T extends { imagePath: string | null; nameKey: string }>({ imagePath, nameKey: _key, ...p }: T) => ({
  ...p,
  hasImage: !!imagePath,
});

const productFields = z.object({
  name: z.string().trim().min(1).max(100),
  note: z.string().trim().max(500),
});

export async function productRoutes(app: FastifyInstance) {
  const find = (id: string, householdId: string) => prisma.product.findFirst({ where: { id, householdId } });

  async function ensureUniqueName(householdId: string, key: string, exceptId?: string) {
    const existing = await prisma.product.findUnique({ where: { householdId_nameKey: { householdId, nameKey: key } } });
    if (existing && existing.id !== exceptId) {
      throw Object.assign(new Error("Un produit porte déjà ce nom"), { statusCode: 409 });
    }
  }

  // rattache les articles de la liste qui portent ce nom
  async function linkItems(householdId: string, productId: string, key: string) {
    const items = await prisma.shoppingItem.findMany({ where: { householdId, productId: null }, select: { id: true, label: true } });
    const ids = items.filter((i) => nameKey(i.label) === key).map((i) => i.id);
    if (ids.length) await prisma.shoppingItem.updateMany({ where: { id: { in: ids } }, data: { productId } });
  }

  app.get("/", async (req) => {
    const products = await prisma.product.findMany({
      where: { householdId: req.user.householdId, ownerId: null },
      orderBy: { nameKey: "asc" },
    });
    return products.map(publicProduct);
  });

  app.get<{ Params: { id: string } }>("/:id/image", async (req, reply) => {
    const product = await find(req.params.id, req.user.householdId);
    if (!product?.imagePath) return reply.code(404).send({ error: "Introuvable" });
    return sendImage(reply, product.imagePath);
  });

  app.post("/", async (req) => {
    const { fields, image } = await readMultipart(req);
    const data = productFields.parse({ note: "", ...fields });
    const householdId = req.user.householdId;
    const key = nameKey(data.name);
    await ensureUniqueName(householdId, key);
    const imagePath = image ? await saveImage(image) : null;
    const product = await prisma.product.create({
      data: { name: data.name, note: data.note || null, nameKey: key, imagePath, householdId, createdById: req.user.id },
    });
    await linkItems(householdId, product.id, key);
    return publicProduct(product);
  });

  app.patch<{ Params: { id: string } }>("/:id", async (req, reply) => {
    const product = await find(req.params.id, req.user.householdId);
    if (!product) return reply.code(404).send({ error: "Introuvable" });
    const { fields, image } = await readMultipart(req);
    const removeImg = fields.removeImage === "true";
    const data = productFields.partial().parse({ name: fields.name, note: fields.note });
    const key = data.name ? nameKey(data.name) : product.nameKey;
    if (key !== product.nameKey) await ensureUniqueName(product.householdId, key, product.id);
    let imagePath = product.imagePath;
    if (image || removeImg) {
      await removeImage(product.imagePath);
      imagePath = image ? await saveImage(image) : null;
    }
    const updated = await prisma.product.update({
      where: { id: product.id },
      data: {
        ...(data.name !== undefined && { name: data.name, nameKey: key }),
        ...(data.note !== undefined && { note: data.note || null }),
        imagePath,
      },
    });
    if (key !== product.nameKey) await linkItems(product.householdId, product.id, key);
    return publicProduct(updated);
  });

  app.delete<{ Params: { id: string } }>("/:id", async (req, reply) => {
    const product = await find(req.params.id, req.user.householdId);
    if (!product) return reply.code(404).send({ error: "Introuvable" });
    await prisma.product.delete({ where: { id: product.id } });
    await removeImage(product.imagePath);
    return { ok: true };
  });
}

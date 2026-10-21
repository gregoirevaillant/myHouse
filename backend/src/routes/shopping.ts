import type { FastifyInstance } from "fastify";
import type { Prisma } from "@prisma/client";
import { z } from "zod";
import { prisma } from "../db.js";
import { notifyShoppingAdded } from "../push.js";
import { nameKey, publicProduct } from "./products.js";

type ItemWithProduct = Prisma.ShoppingItemGetPayload<{ include: { product: true } }>;

const withProduct = ({ product, ...item }: ItemWithProduct) => ({
  ...item,
  product: product ? publicProduct(product) : null,
});

export async function shoppingRoutes(app: FastifyInstance) {
  app.get("/", async (req) => {
    const items = await prisma.shoppingItem.findMany({
      where: { householdId: req.user.householdId, ownerId: null },
      include: { product: true },
      orderBy: [{ checked: "asc" }, { createdAt: "desc" }],
    });
    return items.map(withProduct);
  });

  app.post("/", async (req) => {
    const body = z
      .object({ label: z.string().trim().min(1).max(200), productId: z.string().optional() })
      .parse(req.body);
    const householdId = req.user.householdId;
    // produit choisi explicitement, sinon rapprochement par le nom
    const product = body.productId
      ? await prisma.product.findFirst({ where: { id: body.productId, householdId } })
      : await prisma.product.findUnique({ where: { householdId_nameKey: { householdId, nameKey: nameKey(body.label) } } });
    const item = await prisma.shoppingItem.create({
      data: { label: body.label, productId: product?.id, householdId, createdById: req.user.id },
      include: { product: true },
    });
    notifyShoppingAdded(req.user, item.label);
    return withProduct(item);
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
    const item = await prisma.shoppingItem.findUniqueOrThrow({ where: { id: req.params.id }, include: { product: true } });
    return withProduct(item);
  });

  app.delete<{ Params: { id: string } }>("/:id", async (req, reply) => {
    const { count } = await prisma.shoppingItem.deleteMany({
      where: { id: req.params.id, householdId: req.user.householdId },
    });
    if (!count) return reply.code(404).send({ error: "Introuvable" });
    return { ok: true };
  });
}

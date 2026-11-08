import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { prisma } from "../db.js";

const MEALS = ["BREAKFAST", "LUNCH", "DINNER", "SNACK"] as const;
const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);

const entryBody = z.object({
  date: isoDate,
  meal: z.enum(MEALS),
  label: z.string().trim().min(1).max(160),
  kcal: z.number().int().min(1).max(20000),
});

const select = { id: true, date: true, meal: true, label: true, kcal: true } as const;

// suivi strictement personnel : jamais visible de l'autre personne du foyer
const mine = (req: { user: { id: string; householdId: string } }) => ({ householdId: req.user.householdId, ownerId: req.user.id });

// produit d'après son code-barres, via Open Food Facts (base ouverte, sans clé) ; kcal pour 100 g
export async function lookupProduct(barcode: string) {
  const res = await fetch(`https://world.openfoodfacts.org/api/v2/product/${barcode}.json?fields=product_name,brands,nutriments`, {
    headers: { "User-Agent": "Maison/1.0" },
    signal: AbortSignal.timeout(8000),
  }).catch(() => null);
  const n = res?.ok ? ((await res.json().catch(() => null)) as { product?: { product_name?: string; brands?: string; nutriments?: Record<string, number> } } | null)?.product : undefined;
  const kcal = n?.nutriments?.["energy-kcal_100g"] ?? (n?.nutriments?.["energy_100g"] ? n.nutriments["energy_100g"] / 4.184 : undefined);
  const brand = n?.brands?.split(",")[0]?.trim();
  const name = brand && !n?.product_name?.toLowerCase().includes(brand.toLowerCase()) ? `${n?.product_name} · ${brand}` : (n?.product_name ?? "");
  return typeof kcal === "number" && name ? { name: name.slice(0, 160), kcalPer100g: Math.round(kcal) } : null;
}

export async function calorieRoutes(app: FastifyInstance) {
  app.get<{ Params: { barcode: string } }>("/product/:barcode", { config: { rateLimit: { max: 30, timeWindow: "1 minute" } } }, async (req, reply) => {
    const { barcode } = z.object({ barcode: z.string().regex(/^\d{8,14}$/, "Code-barres invalide") }).parse(req.params);
    return (await lookupProduct(barcode)) ?? reply.code(404).send({ error: "Produit introuvable (ou Open Food Facts injoignable)" });
  });

  // ?from=YYYY-MM-DD&to=YYYY-MM-DD (inclus)
  app.get("/", async (req) => {
    const { from, to } = z.object({ from: isoDate, to: isoDate }).parse(req.query);
    return prisma.calorieEntry.findMany({
      where: { ...mine(req), date: { gte: from, lte: to } },
      select,
      orderBy: [{ date: "asc" }, { createdAt: "asc" }],
    });
  });

  app.post("/", async (req) => {
    const data = entryBody.parse(req.body);
    return prisma.calorieEntry.create({ data: { ...data, ...mine(req), createdById: req.user.id }, select });
  });

  app.patch<{ Params: { id: string } }>("/:id", async (req, reply) => {
    const found = await prisma.calorieEntry.findFirst({ where: { id: req.params.id, ...mine(req) } });
    if (!found) return reply.code(404).send({ error: "Introuvable" });
    return prisma.calorieEntry.update({ where: { id: found.id }, data: entryBody.parse(req.body), select });
  });

  app.delete<{ Params: { id: string } }>("/:id", async (req, reply) => {
    const found = await prisma.calorieEntry.findFirst({ where: { id: req.params.id, ...mine(req) } });
    if (!found) return reply.code(404).send({ error: "Introuvable" });
    await prisma.calorieEntry.delete({ where: { id: found.id } });
    return { ok: true };
  });
}

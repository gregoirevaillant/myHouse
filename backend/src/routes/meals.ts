import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { prisma } from "../db.js";

const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);

function addDays(date: string, days: number) {
  const d = new Date(`${date}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

export async function mealRoutes(app: FastifyInstance) {
  // ?week=YYYY-MM-DD (lundi de la semaine)
  app.get("/", async (req) => {
    const { week } = z.object({ week: isoDate }).parse(req.query);
    return prisma.meal.findMany({
      where: { householdId: req.user.householdId, ownerId: null, date: { gte: week, lte: addDays(week, 6) } },
      select: { date: true, slot: true, text: true, restaurantId: true },
    });
  });

  app.put("/", async (req) => {
    const body = z
      .object({
        date: isoDate,
        slot: z.enum(["LUNCH", "DINNER"]),
        text: z.string().max(2000),
        restaurantId: z.string().nullable().optional(),
      })
      .parse(req.body);
    const householdId = req.user.householdId;
    // repas au resto : le resto doit appartenir au foyer ; modifier le texte à la main défait le lien
    const restaurantId = body.restaurantId
      ? (await prisma.restaurant.findFirst({ where: { id: body.restaurantId, householdId }, select: { id: true } }))?.id ?? null
      : null;
    const key = { householdId_date_slot: { householdId, date: body.date, slot: body.slot } };
    const text = body.text.trim();
    if (!text) {
      await prisma.meal.deleteMany({ where: { householdId, date: body.date, slot: body.slot } });
      return { ...body, text: "", restaurantId: null };
    }
    await prisma.meal.upsert({
      where: key,
      create: { householdId, createdById: req.user.id, date: body.date, slot: body.slot, text, restaurantId },
      update: { text, restaurantId },
    });
    return { ...body, text, restaurantId };
  });
}

import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { prisma } from "../db.js";
import { parisDate } from "../jobs.js";
import { notifyOthers } from "../push.js";

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
      select: { date: true, slot: true, text: true },
    });
  });

  app.put("/", async (req) => {
    const body = z
      .object({ date: isoDate, slot: z.enum(["LUNCH", "DINNER"]), text: z.string().max(2000) })
      .parse(req.body);
    const householdId = req.user.householdId;
    const key = { householdId_date_slot: { householdId, date: body.date, slot: body.slot } };
    const text = body.text.trim();
    const previous = await prisma.meal.findUnique({ where: key, select: { text: true } });
    if (text && text !== previous?.text) notifyMeal(req.user, body.date, body.slot, text);
    if (!text) {
      await prisma.meal.deleteMany({ where: { householdId, date: body.date, slot: body.slot } });
      return { ...body, text: "" };
    }
    await prisma.meal.upsert({
      where: key,
      create: { householdId, createdById: req.user.id, date: body.date, slot: body.slot, text },
      update: { text },
    });
    return { ...body, text };
  });
}

// seuls les repas d'aujourd'hui et de demain valent une notification
function notifyMeal(author: { id: string; householdId: string }, date: string, slot: "LUNCH" | "DINNER", text: string) {
  const day = date === parisDate(0) ? "today" : date === parisDate(1) ? "tomorrow" : null;
  if (!day) return;
  const when = {
    today: { LUNCH: "Ce midi", DINNER: "Ce soir" },
    tomorrow: { LUNCH: "Demain midi", DINNER: "Demain soir" },
  }[day][slot];
  notifyOthers(author, "MEALS", (name) => ({
    title: "🍽️ Repas",
    body: `${when} : ${text} (${name})`,
    url: "/repas",
    tag: `repas-${date}-${slot}`,
  })).catch((err) => console.error(err));
}

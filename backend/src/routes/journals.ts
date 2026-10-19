import type { FastifyInstance, FastifyRequest } from "fastify";
import { z } from "zod";
import { prisma } from "../db.js";

const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
const titleBody = z.object({ title: z.string().trim().min(1).max(100) });

// un journal n'est visible que par son auteur
const findOwn = (req: FastifyRequest<{ Params: { id: string } }>) =>
  prisma.journal.findFirst({ where: { id: req.params.id, householdId: req.user.householdId, ownerId: req.user.id } });

export async function journalRoutes(app: FastifyInstance) {
  app.get("/", async (req) => {
    const journals = await prisma.journal.findMany({
      where: { householdId: req.user.householdId, ownerId: req.user.id },
      include: { entries: { select: { date: true }, orderBy: { date: "desc" } } },
      orderBy: { createdAt: "asc" },
    });
    return journals.map(({ id, title, entries }) => ({
      id,
      title,
      entryCount: entries.length,
      lastDate: entries[0]?.date ?? null,
    }));
  });

  app.post("/", async (req) => {
    const { title } = titleBody.parse(req.body);
    const journal = await prisma.journal.create({
      data: { title, householdId: req.user.householdId, createdById: req.user.id, ownerId: req.user.id },
    });
    return { id: journal.id, title: journal.title, entryCount: 0, lastDate: null };
  });

  app.get<{ Params: { id: string } }>("/:id", async (req, reply) => {
    const journal = await findOwn(req);
    if (!journal) return reply.code(404).send({ error: "Introuvable" });
    const entries = await prisma.journalEntry.findMany({
      where: { journalId: journal.id },
      select: { date: true, text: true },
      orderBy: { date: "desc" },
    });
    return { id: journal.id, title: journal.title, entries };
  });

  app.patch<{ Params: { id: string } }>("/:id", async (req, reply) => {
    const journal = await findOwn(req);
    if (!journal) return reply.code(404).send({ error: "Introuvable" });
    const { title } = titleBody.parse(req.body);
    await prisma.journal.update({ where: { id: journal.id }, data: { title } });
    return { ok: true };
  });

  app.delete<{ Params: { id: string } }>("/:id", async (req, reply) => {
    const journal = await findOwn(req);
    if (!journal) return reply.code(404).send({ error: "Introuvable" });
    await prisma.journal.delete({ where: { id: journal.id } });
    return { ok: true };
  });

  // texte vide = suppression de l'entrée du jour
  app.put<{ Params: { id: string } }>("/:id/entries", async (req, reply) => {
    const journal = await findOwn(req);
    if (!journal) return reply.code(404).send({ error: "Introuvable" });
    const body = z.object({ date: isoDate, text: z.string().max(50_000) }).parse(req.body);
    const text = body.text.trim();
    if (!text) {
      await prisma.journalEntry.deleteMany({ where: { journalId: journal.id, date: body.date } });
      return { date: body.date, text: "" };
    }
    await prisma.journalEntry.upsert({
      where: { journalId_date: { journalId: journal.id, date: body.date } },
      create: { journalId: journal.id, date: body.date, text },
      update: { text },
    });
    return { date: body.date, text };
  });
}

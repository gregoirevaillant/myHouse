import type { FastifyInstance, FastifyRequest } from "fastify";
import { z } from "zod";
import { prisma } from "../db.js";
import { detailsFor, downloadImage, SOURCES } from "../mediaSources.js";
import { removeImage, saveImage, sendImage } from "../uploads.js";

// types de médias, chacun avec sa base de données dans mediaSources.ts
const KINDS = ["MOVIE", "SERIES", "GAME", "BOOK"] as const;
const STATUSES = ["WISHLIST", "IN_PROGRESS", "DONE"] as const;

const text = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .nullish()
    .transform((v) => v || null);

const itemBody = z.object({
  kind: z.enum(KINDS),
  title: z.string().trim().min(1).max(200),
  year: z.number().int().min(1800).max(2200).nullish(),
  creator: text(200),
  overview: text(3000),
  status: z.enum(STATUSES),
  progress: text(50),
  rating: z.number().int().min(1).max(5).nullish(),
  doneAt: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .nullish(),
  note: text(1000),
  // fiche choisie dans une base ouverte : le serveur va chercher l'affiche et le résumé lui-même
  source: z.string().max(20).nullish(),
  sourceId: z.string().max(30).nullish(),
  // true = visible par moi seulement
  private: z.boolean().default(true), // une fiche est pour moi tant que je ne la partage pas
});

const patchBody = itemBody.omit({ source: true, sourceId: true }); // la fiche d'origine ne change pas

const select = {
  id: true,
  kind: true,
  title: true,
  year: true,
  creator: true,
  overview: true,
  status: true,
  progress: true,
  rating: true,
  doneAt: true,
  note: true,
  source: true,
  sourceId: true,
  ownerId: true,
  imagePath: true,
  createdAt: true,
} as const;
const publicItem = <T extends { ownerId: string | null; imagePath: string | null }>({ ownerId, imagePath, ...i }: T) => ({
  ...i,
  private: ownerId !== null,
  hasImage: !!imagePath,
});

// les fiches partagées du foyer et mes fiches privées
const visibleTo = (req: FastifyRequest) => ({
  householdId: req.user.householdId,
  OR: [{ ownerId: null }, { ownerId: req.user.id }],
});

export async function mediaRoutes(app: FastifyInstance) {
  const find = (req: FastifyRequest<{ Params: { id: string } }>) => prisma.mediaItem.findFirst({ where: { id: req.params.id, ...visibleTo(req) } });

  app.get("/", async (req) => {
    const list = await prisma.mediaItem.findMany({ where: visibleTo(req), select, orderBy: { createdAt: "desc" } });
    return list.map(publicItem);
  });

  // recherche dans les bases ouvertes
  app.get("/search", async (req, reply) => {
    const { kind, q } = z.object({ kind: z.enum(KINDS), q: z.string().trim().min(2).max(100) }).parse(req.query);
    const source = SOURCES[kind];
    if (!source) return reply.code(400).send({ error: "Pas encore de base de données pour ce type" });
    return source.search(q);
  });

  // affiche d'un résultat de recherche, relayée par le serveur (le navigateur ne contacte pas les bases)
  app.get("/thumb", async (req, reply) => {
    const { url } = z.object({ url: z.string().url().max(500) }).parse(req.query);
    const image = await downloadImage(url);
    if (!image) return reply.code(404).send({ error: "Introuvable" });
    return reply.type(image.mimetype).header("Cache-Control", "private, max-age=86400").send(image.buffer);
  });

  app.get<{ Params: { id: string } }>("/:id/image", async (req, reply) => {
    const item = await find(req);
    if (!item?.imagePath) return reply.code(404).send({ error: "Introuvable" });
    return sendImage(reply, item.imagePath);
  });

  app.post("/", async (req) => {
    const { private: isPrivate, ...data } = itemBody.parse(req.body);
    const details =
      data.source && data.sourceId
        ? await detailsFor(data.kind, data.source, data.sourceId).catch((err) => {
            req.log.warn({ err }, "fiche non enrichie"); // la fiche reste utilisable sans résumé ni affiche
            return null;
          })
        : null;
    const image = await downloadImage(details?.imageUrl ?? null);
    const item = await prisma.mediaItem.create({
      data: {
        ...data,
        overview: data.overview ?? details?.overview?.slice(0, 3000) ?? null,
        creator: data.creator ?? details?.creator ?? null,
        imagePath: image ? await saveImage(image) : null,
        householdId: req.user.householdId,
        createdById: req.user.id,
        ownerId: isPrivate ? req.user.id : null,
      },
      select,
    });
    return publicItem(item);
  });

  app.patch<{ Params: { id: string } }>("/:id", async (req, reply) => {
    if (!(await find(req))) return reply.code(404).send({ error: "Introuvable" });
    const { private: isPrivate, ...data } = patchBody.parse(req.body);
    const item = await prisma.mediaItem.update({
      where: { id: req.params.id },
      data: { ...data, ownerId: isPrivate ? req.user.id : null },
      select,
    });
    return publicItem(item);
  });

  app.delete<{ Params: { id: string } }>("/:id", async (req, reply) => {
    const item = await find(req);
    if (!item) return reply.code(404).send({ error: "Introuvable" });
    await prisma.mediaItem.delete({ where: { id: item.id } });
    await removeImage(item.imagePath);
    return { ok: true };
  });
}

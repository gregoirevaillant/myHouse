import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { prisma } from "../db.js";
import { importRecipe } from "../recipeImport.js";
import { readMultipart, removeImage, saveImage, sendImage } from "../uploads.js";

// ownerId renseigné = aliment privé, pour le suivi des calories de son auteur seulement
const publicRecipe = <T extends { imagePath: string | null; ownerId: string | null }>({ imagePath, ownerId, ...r }: T) => ({
  ...r,
  hasImage: !!imagePath,
  private: ownerId !== null,
});

// champs multipart (texte) : "" = vide
const optionalInt = (max: number) =>
  z
    .string()
    .trim()
    .default("") // champ absent (ancienne version de l'app encore en cache)
    .transform((v) => (v ? Number(v) : null))
    .pipe(z.number().int().min(1).max(max).nullable());
const optionalText = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .transform((v) => v || null);

const recipeFields = z.object({
  name: z.string().trim().min(1).max(150),
  category: z.enum(["PLAT", "ENTREE", "DESSERT", "APERO", "PETIT_DEJ", "AUTRE"]),
  servings: optionalInt(100),
  calories: optionalInt(10000),
  per100g: z
    .string()
    .default("false") // champ absent (ancienne version de l'app encore en cache)
    .transform((v) => v === "true"),
  minutes: optionalInt(10000),
  ingredients: z.string().trim().max(10000),
  steps: z.string().trim().max(20000),
  note: optionalText(2000),
  url: optionalText(1000).refine((u) => !u || /^https?:\/\//.test(u), "Lien invalide (http…)"),
});

const select = {
  id: true,
  name: true,
  category: true,
  servings: true,
  calories: true,
  per100g: true,
  ownerId: true,
  minutes: true,
  ingredients: true,
  steps: true,
  note: true,
  url: true,
  imagePath: true,
} as const;

export async function recipeRoutes(app: FastifyInstance) {
  // recettes partagées du foyer et mes aliments privés
  const visibleTo = (user: { id: string; householdId: string }) => ({ householdId: user.householdId, OR: [{ ownerId: null }, { ownerId: user.id }] });
  const find = (id: string, user: { id: string; householdId: string }) => prisma.recipe.findFirst({ where: { id, ...visibleTo(user) } });

  app.get("/", async (req) => {
    const recipes = await prisma.recipe.findMany({
      where: visibleTo(req.user),
      select,
      orderBy: { name: "asc" },
    });
    return recipes.map(publicRecipe);
  });

  app.get<{ Params: { id: string } }>("/:id/image", async (req, reply) => {
    const recipe = await find(req.params.id, req.user);
    if (!recipe?.imagePath) return reply.code(404).send({ error: "Introuvable" });
    return sendImage(reply, recipe.imagePath);
  });

  // lit une page de recette (JSON-LD schema.org) et renvoie les champs pré-remplis, sans rien enregistrer
  app.post("/import", async (req) => {
    const { url } = z.object({ url: z.string().trim().min(1).max(1000) }).parse(req.body);
    return importRecipe(/^https?:\/\//i.test(url) ? url : `https://${url}`);
  });

  app.post("/", async (req) => {
    const { fields, image } = await readMultipart(req);
    const data = recipeFields.parse(fields);
    const imagePath = image ? await saveImage(image) : null;
    const recipe = await prisma.recipe.create({
      // « private » n'est lu qu'à la création : on ne rend pas privée une recette que l'autre personne voit déjà
      data: { ...data, imagePath, householdId: req.user.householdId, createdById: req.user.id, ownerId: fields.private === "true" ? req.user.id : null },
      select,
    });
    return publicRecipe(recipe);
  });

  app.patch<{ Params: { id: string } }>("/:id", async (req, reply) => {
    const recipe = await find(req.params.id, req.user);
    if (!recipe) return reply.code(404).send({ error: "Introuvable" });
    const { fields, image } = await readMultipart(req);
    const data = recipeFields.parse(fields);
    let imagePath = recipe.imagePath;
    if (image || fields.removeImage === "true") {
      await removeImage(recipe.imagePath);
      imagePath = image ? await saveImage(image) : null;
    }
    const updated = await prisma.recipe.update({ where: { id: recipe.id }, data: { ...data, imagePath }, select });
    return publicRecipe(updated);
  });

  app.delete<{ Params: { id: string } }>("/:id", async (req, reply) => {
    const recipe = await find(req.params.id, req.user);
    if (!recipe) return reply.code(404).send({ error: "Introuvable" });
    await prisma.recipe.delete({ where: { id: recipe.id } });
    await removeImage(recipe.imagePath);
    return { ok: true };
  });
}

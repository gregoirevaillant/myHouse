import type { FastifyReply, FastifyRequest } from "fastify";

// Pages que l'administrateur active ou non pour chaque famille (Household.features). Mêmes noms que les routes du front, sans « / ».
export const MODULES = ["cartes", "repas", "recettes", "courses", "restos", "depenses", "infos", "budget"] as const;
// Espace privé de l'administrateur : jamais activé pour une famille, réservé à `User.isAdmin`
export const PRIVATE_MODULES = ["journal", "calories", "media"] as const;
export type Module = (typeof MODULES)[number] | (typeof PRIVATE_MODULES)[number];

// ignore les anciennes pages devenues privées (journal, calories, média) qui traîneraient dans Household.features
export const parseFeatures = (csv: string) => MODULES.filter((m) => csv.split(",").includes(m));
export const privateFeatures = (isAdmin: boolean) => (isAdmin ? [...PRIVATE_MODULES] : []);

// Segment d'URL sous /api → pages dont UNE suffit pour y accéder. Un segment absent d'ici (et de OPEN_ROUTES) est refusé.
const ROUTE_MODULES: Record<string, Module[]> = {
  cards: ["cartes"],
  meals: ["repas"],
  recipes: ["recettes", "repas", "calories"], // le planning et le suivi des calories piochent dans les recettes
  shopping: ["courses", "recettes"], // « ajouter les ingrédients » depuis une recette
  products: ["courses"],
  restaurants: ["restos", "repas"],
  expenses: ["depenses"],
  "expense-trackers": ["depenses"],
  journals: ["journal"],
  infos: ["infos"],
  calories: ["calories"],
  budget: ["budget"],
  media: ["media"],
};

// toujours accessibles à une personne connectée (limitées à son foyer)
const OPEN_ROUTES = new Set(["users", "push", "events"]);

export type Access = { isAdmin: boolean; mustChangePassword: boolean; features: ReadonlySet<string> };

declare module "fastify" {
  interface FastifyRequest {
    access: Access;
  }
}

// À placer après requireAuth. Se fie à la route reconnue par Fastify (pas à l'URL brute) : impossible à contourner par encodage.
export async function requireModule(req: FastifyRequest, reply: FastifyReply) {
  if (req.access.mustChangePassword) {
    return reply.code(403).send({ error: "Change d'abord ton mot de passe", code: "MUST_CHANGE_PASSWORD" });
  }
  const segment = req.routeOptions.url?.split("/")[2] ?? "";
  if (segment === "admin") {
    if (!req.access.isAdmin) return reply.code(403).send({ error: "Réservé à l'administrateur" });
    return;
  }
  if (OPEN_ROUTES.has(segment)) return;
  if (!ROUTE_MODULES[segment]?.some((m) => req.access.features.has(m))) {
    return reply.code(403).send({ error: "Cette page n'est pas activée pour toi" });
  }
}

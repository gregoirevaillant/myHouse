import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { prisma } from "../db.js";
import { notifyOthers } from "../push.js";

const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
// "" = effacer la valeur optionnelle
const optional = <T extends z.ZodTypeAny>(schema: T) =>
  z.union([z.literal("").transform(() => null), z.null(), schema]).optional();

const restaurantFields = z.object({
  name: z.string().trim().min(1).max(100),
  cuisine: z.string().trim().min(1).max(50),
  district: optional(z.string().trim().max(60)),
  address: optional(z.string().trim().max(300)),
  lat: optional(z.number().min(-90).max(90)),
  lng: optional(z.number().min(-180).max(180)),
  rating: optional(z.number().int().min(1).max(5)),
  price: optional(z.number().int().min(1).max(3)),
  phone: optional(z.string().trim().max(30)),
  url: optional(z.string().trim().url().max(500)),
});

const withVisits = { visits: { select: { date: true }, orderBy: { date: "desc" as const } } };

type WithVisits = { visits: { date: string }[] };
const publicRestaurant = <T extends WithVisits>({ visits, ...r }: T) => ({
  ...r,
  visits: visits.map((v) => v.date),
});

// Paris : arrondissement d'après le code postal (75116 = 16e), sinon la commune
function districtOf(address: Record<string, string | undefined>) {
  const m = address.postcode?.match(/^75(\d{3})$/);
  if (m && (address.city === "Paris" || !address.city)) {
    const n = Number(m[1]) === 116 ? 16 : Number(m[1]);
    if (n >= 1 && n <= 20) return n === 1 ? "1er" : `${n}e`;
  }
  return address.city ?? address.town ?? address.village ?? address.municipality ?? null;
}

type NominatimResult = {
  lat: string;
  lon: string;
  name?: string;
  display_name: string;
  address?: Record<string, string | undefined>;
};

export async function restaurantRoutes(app: FastifyInstance) {
  const find = (id: string, householdId: string) =>
    prisma.restaurant.findFirst({ where: { id, householdId, ownerId: null } });

  app.get("/", async (req) => {
    const list = await prisma.restaurant.findMany({
      where: { householdId: req.user.householdId, ownerId: null },
      include: withVisits,
      orderBy: { name: "asc" },
    });
    return list.map(publicRestaurant);
  });

  // recherche d'adresse via OpenStreetMap (Nominatim exige un User-Agent identifiable, d'où le passage par le serveur)
  app.get("/geocode", async (req, reply) => {
    const { q } = z.object({ q: z.string().trim().min(2).max(200) }).parse(req.query);
    const params = new URLSearchParams({
      q,
      format: "jsonv2",
      addressdetails: "1",
      countrycodes: "fr",
      limit: "5",
      "accept-language": "fr",
      // Paris en priorité, sans exclure la banlieue
      viewbox: "2.224,48.902,2.47,48.815",
    });
    try {
      const res = await fetch(`https://nominatim.openstreetmap.org/search?${params}`, {
        headers: { "User-Agent": "Maison/1.0 (application familiale privée)" },
        signal: AbortSignal.timeout(8000),
      });
      if (!res.ok) throw new Error(`Nominatim ${res.status}`);
      const results = (await res.json()) as NominatimResult[];
      return results.map((r) => {
        const a = r.address ?? {};
        const street = [a.house_number, a.road].filter(Boolean).join(" ");
        const city = a.city ?? a.town ?? a.village ?? "";
        return {
          label: r.display_name,
          name: r.name || null,
          address: [street, [a.postcode, city].filter(Boolean).join(" ")].filter(Boolean).join(", ") || r.display_name,
          lat: Number(r.lat),
          lng: Number(r.lon),
          district: districtOf(a),
        };
      });
    } catch (err) {
      req.log.warn(err);
      return reply.code(502).send({ error: "Recherche d'adresse indisponible" });
    }
  });

  app.post("/", async (req) => {
    const body = restaurantFields.extend({ visitedOn: isoDate.optional() }).parse(req.body);
    const { visitedOn, ...data } = body;
    const restaurant = await prisma.restaurant.create({
      data: {
        ...data,
        wishlist: !visitedOn,
        householdId: req.user.householdId,
        createdById: req.user.id,
        visits: visitedOn ? { create: { date: visitedOn } } : undefined,
      },
      include: withVisits,
    });
    notifyOthers(req.user, "RESTAURANTS", (name) => ({
      title: "🍜 Restos",
      body: visitedOn ? `${name} a ajouté ${restaurant.name} aux restos testés` : `Nouveau resto à tester : ${restaurant.name} (${name})`,
      url: "/restos",
      tag: `resto-${restaurant.id}`,
    })).catch((err) => console.error(err));
    return publicRestaurant(restaurant);
  });

  app.patch<{ Params: { id: string } }>("/:id", async (req, reply) => {
    const restaurant = await find(req.params.id, req.user.householdId);
    if (!restaurant) return reply.code(404).send({ error: "Introuvable" });
    const data = restaurantFields.extend({ wishlist: z.boolean() }).partial().parse(req.body);
    const updated = await prisma.restaurant.update({ where: { id: restaurant.id }, data, include: withVisits });
    return publicRestaurant(updated);
  });

  app.delete<{ Params: { id: string } }>("/:id", async (req, reply) => {
    const restaurant = await find(req.params.id, req.user.householdId);
    if (!restaurant) return reply.code(404).send({ error: "Introuvable" });
    await prisma.restaurant.delete({ where: { id: restaurant.id } });
    return { ok: true };
  });

  // « On y est allés » : une visite par jour au plus ; le resto quitte la liste à tester
  app.post<{ Params: { id: string } }>("/:id/visits", async (req, reply) => {
    const restaurant = await find(req.params.id, req.user.householdId);
    if (!restaurant) return reply.code(404).send({ error: "Introuvable" });
    const { date } = z.object({ date: isoDate }).parse(req.body);
    await prisma.restaurantVisit.upsert({
      where: { restaurantId_date: { restaurantId: restaurant.id, date } },
      create: { restaurantId: restaurant.id, date },
      update: {},
    });
    const updated = await prisma.restaurant.update({ where: { id: restaurant.id }, data: { wishlist: false }, include: withVisits });
    return publicRestaurant(updated);
  });

  app.delete<{ Params: { id: string; date: string } }>("/:id/visits/:date", async (req, reply) => {
    const restaurant = await find(req.params.id, req.user.householdId);
    if (!restaurant) return reply.code(404).send({ error: "Introuvable" });
    await prisma.restaurantVisit.deleteMany({ where: { restaurantId: restaurant.id, date: req.params.date } });
    return { ok: true };
  });
}

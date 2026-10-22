import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";

// Temps réel : chaque appareil ouvert garde une connexion Server-Sent Events ; à chaque modification
// on lui envoie les clés de requêtes (TanStack Query) à rafraîchir, jamais les données elles-mêmes.
type Client = { userId: string; reply: FastifyReply };

const clients = new Map<string, Set<Client>>();

export function broadcast(householdId: string, keys: string[][], onlyUserId?: string) {
  const message = `data: ${JSON.stringify({ keys })}\n\n`;
  for (const c of clients.get(householdId) ?? []) {
    if (!onlyUserId || c.userId === onlyUserId) c.reply.raw.write(message);
  }
}

// l'app n'ouvre la connexion que lorsqu'elle est à l'écran : inutile alors de notifier la personne
export function isLive(userId: string) {
  for (const set of clients.values()) for (const c of set) if (c.userId === userId) return true;
  return false;
}

// tout le budget peut bouger après une synchro (cf. useInvalidateBudget côté front)
export const budgetKeys = [["budget"], ["budget-trend"], ["recurring"], ["bank-connections"]];

// clés à rafraîchir selon la route modifiée ; private = seulement les autres appareils de la même personne
const INVALIDATIONS: { prefix: string; keys: string[][]; private?: boolean }[] = [
  { prefix: "/api/shopping", keys: [["shopping"]] },
  { prefix: "/api/products", keys: [["products"], ["shopping"]] },
  { prefix: "/api/meals", keys: [["meals"], ["restaurants"]] },
  { prefix: "/api/restaurants", keys: [["restaurants"], ["meals"]] },
  { prefix: "/api/expense-trackers", keys: [["expense-trackers"], ["expenses"]] },
  { prefix: "/api/expenses", keys: [["expenses"]] },
  { prefix: "/api/cards", keys: [["cards"]] },
  { prefix: "/api/infos", keys: [["infos"]] },
  { prefix: "/api/journals", keys: [["journals"], ["journal"]], private: true },
  { prefix: "/api/budget", keys: budgetKeys, private: true },
  { prefix: "/api/bank", keys: budgetKeys, private: true },
  { prefix: "/api/auth/preferences", keys: [["me"]], private: true },
];

// hook onResponse : toute écriture réussie prévient les appareils concernés
export async function invalidateOnWrite(req: FastifyRequest, reply: FastifyReply) {
  if (req.method === "GET" || reply.statusCode >= 400 || !req.user) return;
  const rule = INVALIDATIONS.find((r) => req.url.startsWith(r.prefix));
  if (rule) broadcast(req.user.householdId, rule.keys, rule.private ? req.user.id : undefined);
}

export async function liveRoutes(app: FastifyInstance) {
  app.get("/", (req, reply) => {
    reply.hijack();
    reply.raw.writeHead(200, {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
    });
    reply.raw.write(": ok\n\n");

    const { id: userId, householdId } = req.user;
    const client = { userId, reply };
    if (!clients.has(householdId)) clients.set(householdId, new Set());
    clients.get(householdId)!.add(client);

    // commentaire régulier : garde la connexion ouverte à travers cloudflared
    const ping = setInterval(() => reply.raw.write(": ping\n\n"), 25_000);
    req.raw.on("close", () => {
      clearInterval(ping);
      clients.get(householdId)?.delete(client);
    });
  });
}

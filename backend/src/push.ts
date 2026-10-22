import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import webpush from "web-push";
import { prisma } from "./db.js";
import { env } from "./env.js";
import { isLive } from "./live.js";

// seules les courses ajoutées et les nouvelles dépenses envoient une notification
export const NOTIFICATION_TYPES = ["SHOPPING", "EXPENSES"] as const;
export type NotificationType = (typeof NOTIFICATION_TYPES)[number];

export type PushPayload = { title: string; body: string; url: string; tag?: string };

// Clés VAPID : fournies par l'environnement, sinon générées une fois et gardées dans le volume de données
function vapidKeys() {
  if (env.vapidPublicKey && env.vapidPrivateKey) return { publicKey: env.vapidPublicKey, privateKey: env.vapidPrivateKey };
  const file = path.join(env.dataDir, "vapid.json");
  if (existsSync(file)) return JSON.parse(readFileSync(file, "utf8")) as { publicKey: string; privateKey: string };
  const keys = webpush.generateVAPIDKeys();
  mkdirSync(env.dataDir, { recursive: true });
  writeFileSync(file, JSON.stringify(keys), { mode: 0o600 });
  return keys;
}

const keys = vapidKeys();
webpush.setVapidDetails(env.vapidSubject, keys.publicKey, keys.privateKey);
export const vapidPublicKey = keys.publicKey;

// force : envoyer même si l'app est ouverte (notification de test)
export async function sendPush(userId: string, type: NotificationType | null, payload: PushPayload, force = false) {
  if (!force && isLive(userId)) return;
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { mutedNotifications: true, pushSubscriptions: true },
  });
  if (!user || (type && user.mutedNotifications.split(",").includes(type))) return;
  const body = JSON.stringify(payload);
  await Promise.all(
    user.pushSubscriptions.map((s) =>
      webpush
        .sendNotification({ endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } }, body, { TTL: 60 * 60 * 24, urgency: "high" })
        .catch(async (err: { statusCode?: number; message?: string }) => {
          // abonnement révoqué ou expiré côté navigateur : on l'oublie
          if (err.statusCode === 404 || err.statusCode === 410) {
            await prisma.pushSubscription.delete({ where: { id: s.id } }).catch(() => {});
          } else {
            console.error(`push ${userId} — ${err.statusCode ?? ""} ${err.message ?? err}`);
          }
        }),
    ),
  );
}

// prévient les autres membres du foyer de ce qu'a fait author
export async function notifyOthers(author: { id: string; householdId: string }, type: NotificationType, build: (authorName: string, recipientId: string) => PushPayload | null) {
  const members = await prisma.user.findMany({ where: { householdId: author.householdId }, select: { id: true, name: true } });
  const name = members.find((m) => m.id === author.id)?.name ?? "Quelqu'un";
  for (const m of members) {
    if (m.id === author.id) continue;
    const payload = build(name, m.id);
    if (payload) await sendPush(m.id, type, payload);
  }
}

// Courses : notification immédiate à chaque ajout ; les ajouts d'une même personne dans les 2 dernières
// minutes sont repris dans le texte, et la nouvelle notification remplace la précédente (même tag)
const RECENT_WINDOW = 2 * 60 * 1000;
const recentAdds = new Map<string, { labels: string[]; until: number }>();

export function notifyShoppingAdded(author: { id: string; householdId: string }, label: string) {
  const now = Date.now();
  const recent = recentAdds.get(author.id);
  const labels = recent && recent.until > now ? [...recent.labels, label] : [label];
  recentAdds.set(author.id, { labels, until: now + RECENT_WINDOW });
  const list = labels.length <= 3 ? joinFr(labels) : `${labels.slice(-2).join(", ")} et ${labels.length - 2} autres`;
  notifyOthers(author, "SHOPPING", (name) => ({
    title: "🛒 Courses",
    body: `${name} a ajouté ${list} à la liste`,
    url: "/courses",
    tag: "courses",
  })).catch((err) => console.error(err));
}

export const joinFr = (items: string[]) =>
  items.length <= 1 ? (items[0] ?? "") : `${items.slice(0, -1).join(", ")} et ${items[items.length - 1]}`;

export const eur = (cents: number) =>
  (cents / 100).toLocaleString("fr-FR", { style: "currency", currency: "EUR" });

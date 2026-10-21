import { prisma } from "./db.js";
import { eur, joinFr, sendPush } from "./push.js";

const TZ = "Europe/Paris";

// date du jour (heure de Paris) décalée de offset jours, au format YYYY-MM-DD
export function parisDate(offset = 0) {
  const today = new Intl.DateTimeFormat("en-CA", { timeZone: TZ }).format(new Date());
  const d = new Date(`${today}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + offset);
  return d.toISOString().slice(0, 10);
}

function parisClock() {
  const parts = new Intl.DateTimeFormat("en-US", { timeZone: TZ, hour: "numeric", hourCycle: "h23", weekday: "short" }).formatToParts(new Date());
  const get = (type: string) => parts.find((p) => p.type === type)?.value ?? "";
  return { hour: Number(get("hour")), weekday: get("weekday") };
}

// une tâche ne tourne qu'une fois par jour, même après un redémarrage
async function once(name: string, run: () => Promise<void>) {
  const today = parisDate();
  const last = await prisma.jobRun.findUnique({ where: { name } });
  if (last?.lastRun === today) return;
  await prisma.jobRun.upsert({ where: { name }, create: { name, lastRun: today }, update: { lastRun: today } });
  await run();
}

export async function runJobs() {
  const { hour, weekday } = parisClock();
  if (hour >= 9) await once("budget-reminders", budgetReminders);
  if (weekday === "Sun" && hour >= 19) await once("weekly-digest", weeklyDigest);
}

// Budget (privé) : accès banque bientôt expiré, prélèvements récurrents attendus demain
async function budgetReminders() {
  const tomorrow = parisDate(1);
  const owners = await prisma.bankConnection.findMany({ distinct: ["ownerId"], select: { ownerId: true } });
  for (const { ownerId } of owners) {
    const connections = await prisma.bankConnection.findMany({ where: { ownerId }, select: { validUntil: true } });
    const days = Math.min(...connections.map((c) => Math.ceil((c.validUntil.getTime() - Date.now()) / 86_400_000)));
    // rappels à J-7, J-3, J-1 et le jour même, pas tous les jours
    if ([7, 3, 1, 0].includes(days)) {
      await sendPush(ownerId, "BUDGET", {
        title: "🏦 Accès banque",
        body: days > 0 ? `L'accès à ta banque expire dans ${days} jour${days > 1 ? "s" : ""} : pense à la reconnecter.` : "L'accès à ta banque expire aujourd'hui : reconnecte-la pour continuer la synchro.",
        url: "/budget/banque",
        tag: "banque",
      });
    }

    const due = await prisma.recurringItem.findMany({
      where: { ownerId, status: "ACTIVE", nextDate: tomorrow, amountCents: { lt: 0 } },
      orderBy: { amountCents: "asc" },
    });
    if (due.length) {
      await sendPush(ownerId, "BUDGET", {
        title: "📊 Prélèvements demain",
        body: joinFr(due.map((r) => `${r.label} ${eur(-r.amountCents)}`)),
        url: "/budget/recurrent",
        tag: "prelevements",
      });
    }
  }
}

// Dimanche soir : la semaine qui vient (repas, courses) et l'état des comptes partagés
async function weeklyDigest() {
  const from = parisDate(1);
  const to = parisDate(7);
  const households = await prisma.household.findMany({ select: { id: true, users: { select: { id: true, name: true } } } });
  for (const h of households) {
    const [meals, toBuy, expenses] = await Promise.all([
      prisma.meal.count({ where: { householdId: h.id, ownerId: null, date: { gte: from, lte: to } } }),
      prisma.shoppingItem.count({ where: { householdId: h.id, ownerId: null, checked: false } }),
      prisma.expense.findMany({ where: { householdId: h.id, ownerId: null }, select: { paidById: true, amountCents: true, shares: { select: { userId: true, amountCents: true } } } }),
    ]);
    for (const user of h.users) {
      const parts = [
        `${meals} repas planifié${meals > 1 ? "s" : ""} sur 14`,
        `${toBuy} article${toBuy > 1 ? "s" : ""} aux courses`,
      ];
      const other = h.users.length === 2 ? h.users.find((u) => u.id !== user.id) : undefined;
      if (other) {
        // ce que j'ai payé moins ce que je dois (même calcul que computeDebt côté front)
        let net = 0;
        for (const e of expenses) {
          if (e.paidById === user.id) net += e.amountCents;
          for (const s of e.shares) if (s.userId === user.id) net -= s.amountCents;
        }
        parts.push(net > 0 ? `${other.name} te doit ${eur(net)}` : net < 0 ? `tu dois ${eur(-net)} à ${other.name}` : "comptes à jour");
      }
      await sendPush(user.id, "DIGEST", {
        title: "🏠 La semaine qui vient",
        body: parts.join(" · "),
        url: "/",
        tag: "resume",
      });
    }
  }
}

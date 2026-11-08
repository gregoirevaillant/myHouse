import "./env.js";
import { prisma } from "./db.js";
import { MODULES } from "./modules.js";
import { hashPassword } from "./password.js";

// Amorçage seulement : tant qu'aucun administrateur n'existe, crée (ou promeut) celui de ADMIN_* ; ensuite l'environnement ne sert plus.
// Les autres comptes se créent depuis la page Admin. USER1_* est lu pour qu'un ancien .env continue de fonctionner.
async function main() {
  if (await prisma.user.findFirst({ where: { isAdmin: true }, select: { id: true } })) return;

  const email = (process.env.ADMIN_EMAIL ?? process.env.USER1_EMAIL)?.toLowerCase().trim();
  if (!email) return console.log("Aucun administrateur : renseigne ADMIN_EMAIL, ADMIN_NAME et ADMIN_PASSWORD pour en créer un.");

  const existing = await prisma.user.findUnique({ where: { email } });
  if (existing) {
    await prisma.user.update({ where: { id: existing.id }, data: { isAdmin: true } });
    return console.log(`Administrateur : ${email}`);
  }

  const password = process.env.ADMIN_PASSWORD ?? process.env.USER1_PASSWORD;
  if (!password) return console.log("ADMIN_PASSWORD manquant : administrateur non créé.");
  const household =
    (await prisma.household.findFirst()) ?? (await prisma.household.create({ data: { name: "Maison", features: MODULES.join(",") } }));
  await prisma.user.create({
    data: {
      email,
      name: process.env.ADMIN_NAME ?? process.env.USER1_NAME ?? email,
      passwordHash: await hashPassword(password),
      householdId: household.id,
      isAdmin: true,
    },
  });
  console.log(`Administrateur créé : ${email}`);
}

main().finally(() => prisma.$disconnect());

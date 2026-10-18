import "./env.js";
import { prisma } from "./db.js";
import { hashPassword } from "./password.js";

// Idempotent : crée le foyer et les comptes s'ils n'existent pas, sans écraser les mots de passe changés.
async function main() {
  let household = await prisma.household.findFirst();
  if (!household) household = await prisma.household.create({ data: { name: "Maison" } });

  for (const n of [1, 2]) {
    const email = process.env[`USER${n}_EMAIL`]?.toLowerCase().trim();
    const password = process.env[`USER${n}_PASSWORD`];
    const name = process.env[`USER${n}_NAME`] ?? email ?? "";
    if (!email || !password) continue;
    const existing = await prisma.user.findUnique({ where: { email } });
    if (existing) continue;
    await prisma.user.create({
      data: { email, name, passwordHash: await hashPassword(password), householdId: household.id },
    });
    console.log(`Compte créé : ${email}`);
  }
}

main().finally(() => prisma.$disconnect());

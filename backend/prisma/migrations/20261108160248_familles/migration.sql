-- Familles : pages activées par foyer, administrateur, révocation des sessions, changement de mot de passe imposé.
ALTER TABLE "Household" ADD COLUMN "features" TEXT NOT NULL DEFAULT '';
ALTER TABLE "User" ADD COLUMN "isAdmin" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "User" ADD COLUMN "sessionVersion" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "User" ADD COLUMN "mustChangePassword" BOOLEAN NOT NULL DEFAULT false;

-- les foyers existants gardent toutes les pages
UPDATE "Household" SET "features" = 'cartes,repas,recettes,courses,restos,depenses,journal,infos,calories,budget';

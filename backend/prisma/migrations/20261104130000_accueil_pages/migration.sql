-- AlterTable
ALTER TABLE "User" ADD COLUMN "hiddenHome" TEXT NOT NULL DEFAULT '';

-- l'accueil masquait les mêmes pages que la barre : on conserve ce réglage
UPDATE "User" SET "hiddenHome" = "hiddenTabs";

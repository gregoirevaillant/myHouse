-- AlterTable
ALTER TABLE "Recipe" ADD COLUMN "calories" INTEGER;

-- AlterTable
ALTER TABLE "User" ADD COLUMN "calorieGoal" INTEGER;

-- CreateTable
CREATE TABLE "CalorieEntry" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "householdId" TEXT NOT NULL,
    "createdById" TEXT NOT NULL,
    "ownerId" TEXT NOT NULL,
    "date" TEXT NOT NULL,
    "meal" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "kcal" INTEGER NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "CalorieEntry_householdId_fkey" FOREIGN KEY ("householdId") REFERENCES "Household" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateIndex
CREATE INDEX "CalorieEntry_householdId_ownerId_date_idx" ON "CalorieEntry"("householdId", "ownerId", "date");

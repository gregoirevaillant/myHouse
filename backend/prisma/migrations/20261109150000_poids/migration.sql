-- AlterTable
ALTER TABLE "User" ADD COLUMN "weightGoal" INTEGER;

-- CreateTable
CREATE TABLE "WeightEntry" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "householdId" TEXT NOT NULL,
    "createdById" TEXT NOT NULL,
    "ownerId" TEXT NOT NULL,
    "date" TEXT NOT NULL,
    "grams" INTEGER NOT NULL,
    "bodyFat" REAL,
    "source" TEXT NOT NULL DEFAULT 'MANUAL',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "WeightEntry_householdId_fkey" FOREIGN KEY ("householdId") REFERENCES "Household" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateIndex
CREATE INDEX "WeightEntry_householdId_ownerId_date_idx" ON "WeightEntry"("householdId", "ownerId", "date");

-- CreateIndex
CREATE UNIQUE INDEX "WeightEntry_ownerId_date_key" ON "WeightEntry"("ownerId", "date");

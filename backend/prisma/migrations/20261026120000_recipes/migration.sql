-- CreateTable
CREATE TABLE "Recipe" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "householdId" TEXT NOT NULL,
    "createdById" TEXT NOT NULL,
    "ownerId" TEXT,
    "name" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "servings" INTEGER,
    "minutes" INTEGER,
    "ingredients" TEXT NOT NULL DEFAULT '',
    "steps" TEXT NOT NULL DEFAULT '',
    "note" TEXT,
    "url" TEXT,
    "imagePath" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Recipe_householdId_fkey" FOREIGN KEY ("householdId") REFERENCES "Household" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateIndex
CREATE INDEX "Recipe_householdId_idx" ON "Recipe"("householdId");

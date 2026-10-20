-- CreateTable
CREATE TABLE "ExpenseTracker" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "householdId" TEXT NOT NULL,
    "createdById" TEXT NOT NULL,
    "ownerId" TEXT,
    "name" TEXT NOT NULL,
    "emoji" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ExpenseTracker_householdId_fkey" FOREIGN KEY ("householdId") REFERENCES "Household" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- Un carnet « Vie quotidienne » par foyer, qui reprend les dépenses existantes
INSERT INTO "ExpenseTracker" ("id", "householdId", "createdById", "name", "emoji")
SELECT 'trk_' || h."id", h."id", COALESCE((SELECT u."id" FROM "User" u WHERE u."householdId" = h."id" LIMIT 1), ''), 'Vie quotidienne', '🏠'
FROM "Household" h;

-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_Expense" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "householdId" TEXT NOT NULL,
    "createdById" TEXT NOT NULL,
    "ownerId" TEXT,
    "trackerId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "amountCents" INTEGER NOT NULL,
    "paidById" TEXT NOT NULL,
    "date" TEXT NOT NULL,
    "isReimbursement" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Expense_householdId_fkey" FOREIGN KEY ("householdId") REFERENCES "Household" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "Expense_trackerId_fkey" FOREIGN KEY ("trackerId") REFERENCES "ExpenseTracker" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "Expense_paidById_fkey" FOREIGN KEY ("paidById") REFERENCES "User" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
INSERT INTO "new_Expense" ("id", "householdId", "createdById", "ownerId", "trackerId", "title", "amountCents", "paidById", "date", "isReimbursement", "createdAt")
SELECT "id", "householdId", "createdById", "ownerId", 'trk_' || "householdId", "title", "amountCents", "paidById", "date", "isReimbursement", "createdAt" FROM "Expense";
DROP TABLE "Expense";
ALTER TABLE "new_Expense" RENAME TO "Expense";
CREATE INDEX "Expense_householdId_date_idx" ON "Expense"("householdId", "date");
CREATE INDEX "Expense_trackerId_idx" ON "Expense"("trackerId");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;

-- CreateTable
CREATE TABLE "BankConnection" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "householdId" TEXT NOT NULL,
    "ownerId" TEXT NOT NULL,
    "aspspName" TEXT NOT NULL,
    "aspspCountry" TEXT NOT NULL,
    "sessionId" TEXT NOT NULL,
    "validUntil" DATETIME NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "BankConnection_householdId_fkey" FOREIGN KEY ("householdId") REFERENCES "Household" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "BankAccount" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "connectionId" TEXT NOT NULL,
    "ownerId" TEXT NOT NULL,
    "uid" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "iban" TEXT,
    "accountType" TEXT,
    "currency" TEXT NOT NULL,
    "balanceCents" INTEGER,
    "balanceAt" DATETIME,
    "lastSyncAt" DATETIME,
    CONSTRAINT "BankAccount_connectionId_fkey" FOREIGN KEY ("connectionId") REFERENCES "BankConnection" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "BankTransaction" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "accountId" TEXT NOT NULL,
    "externalId" TEXT NOT NULL,
    "date" TEXT NOT NULL,
    "amountCents" INTEGER NOT NULL,
    "label" TEXT NOT NULL,
    "labelKey" TEXT NOT NULL,
    "counterparty" TEXT,
    "counterpartyIban" TEXT,
    "mcc" TEXT,
    "category" TEXT NOT NULL,
    "categorySource" TEXT NOT NULL,
    "recurringId" TEXT,
    CONSTRAINT "BankTransaction_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "BankAccount" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "CategoryRule" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "householdId" TEXT NOT NULL,
    "ownerId" TEXT NOT NULL,
    "pattern" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    CONSTRAINT "CategoryRule_householdId_fkey" FOREIGN KEY ("householdId") REFERENCES "Household" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "RecurringItem" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "householdId" TEXT NOT NULL,
    "ownerId" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "period" TEXT NOT NULL,
    "amountCents" INTEGER NOT NULL,
    "lastDate" TEXT NOT NULL,
    "nextDate" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "RecurringItem_householdId_fkey" FOREIGN KEY ("householdId") REFERENCES "Household" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateIndex
CREATE INDEX "BankTransaction_accountId_date_idx" ON "BankTransaction"("accountId", "date");

-- CreateIndex
CREATE UNIQUE INDEX "BankTransaction_accountId_externalId_key" ON "BankTransaction"("accountId", "externalId");

-- CreateIndex
CREATE UNIQUE INDEX "CategoryRule_ownerId_pattern_key" ON "CategoryRule"("ownerId", "pattern");

-- CreateIndex
CREATE UNIQUE INDEX "RecurringItem_ownerId_key_key" ON "RecurringItem"("ownerId", "key");

-- CreateTable
CREATE TABLE "MediaItem" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "householdId" TEXT NOT NULL,
    "createdById" TEXT NOT NULL,
    "ownerId" TEXT,
    "kind" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "year" INTEGER,
    "creator" TEXT,
    "overview" TEXT,
    "status" TEXT NOT NULL,
    "progress" TEXT,
    "rating" INTEGER,
    "doneAt" TEXT,
    "note" TEXT,
    "source" TEXT,
    "sourceId" TEXT,
    "imagePath" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "MediaItem_householdId_fkey" FOREIGN KEY ("householdId") REFERENCES "Household" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);


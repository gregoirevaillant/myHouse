-- CreateTable
CREATE TABLE "Restaurant" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "householdId" TEXT NOT NULL,
    "createdById" TEXT NOT NULL,
    "ownerId" TEXT,
    "name" TEXT NOT NULL,
    "cuisine" TEXT NOT NULL,
    "district" TEXT,
    "address" TEXT,
    "lat" REAL,
    "lng" REAL,
    "wishlist" BOOLEAN NOT NULL DEFAULT true,
    "rating" INTEGER,
    "price" INTEGER,
    "phone" TEXT,
    "url" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Restaurant_householdId_fkey" FOREIGN KEY ("householdId") REFERENCES "Household" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "RestaurantVisit" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "restaurantId" TEXT NOT NULL,
    "date" TEXT NOT NULL,
    CONSTRAINT "RestaurantVisit_restaurantId_fkey" FOREIGN KEY ("restaurantId") REFERENCES "Restaurant" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_Meal" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "householdId" TEXT NOT NULL,
    "createdById" TEXT NOT NULL,
    "ownerId" TEXT,
    "date" TEXT NOT NULL,
    "slot" TEXT NOT NULL,
    "text" TEXT NOT NULL,
    "restaurantId" TEXT,
    CONSTRAINT "Meal_householdId_fkey" FOREIGN KEY ("householdId") REFERENCES "Household" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "Meal_restaurantId_fkey" FOREIGN KEY ("restaurantId") REFERENCES "Restaurant" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
INSERT INTO "new_Meal" ("createdById", "date", "householdId", "id", "ownerId", "slot", "text") SELECT "createdById", "date", "householdId", "id", "ownerId", "slot", "text" FROM "Meal";
DROP TABLE "Meal";
ALTER TABLE "new_Meal" RENAME TO "Meal";
CREATE UNIQUE INDEX "Meal_householdId_date_slot_key" ON "Meal"("householdId", "date", "slot");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;

-- CreateIndex
CREATE UNIQUE INDEX "RestaurantVisit_restaurantId_date_key" ON "RestaurantVisit"("restaurantId", "date");


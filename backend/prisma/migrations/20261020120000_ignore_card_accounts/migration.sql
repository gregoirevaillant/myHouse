-- Les comptes carte doublent les paiements déjà présents sur le compte courant : on les supprime
DELETE FROM "BankTransaction" WHERE "accountId" IN (SELECT "id" FROM "BankAccount" WHERE "accountType" = 'CARD');
DELETE FROM "BankAccount" WHERE "accountType" = 'CARD';

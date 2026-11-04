# Amélioration continue de Maison

Backlog issu de `docs/ANALYSE.md` (2026-11-04). Même format que `tasks/todo.md` : tâches petites et vérifiables, cases à cocher, un commit par tâche.

Vérification commune (pas de suite de tests pour l'instant) : voir `CONSTRAINTS.md`, tableau « Appliqué avec des chiffres ».
Déploiement : commit, push, `docker compose up -d --build`.

Tailles : S = moins d'une heure, M = une demi-journée, L = plus.

## Phase 1 : ne pas perdre les données, fermer les failles critiques (P0)

- [ ] **A1 : Sauvegarde automatique du volume `data`** (M)
  - Description : copie quotidienne cohérente de `app.db` (`sqlite3 .backup`, jamais un `cp` du fichier ouvert) et de `uploads/` + `vapid.json`, avec rotation (7 quotidiennes, 4 hebdomadaires), hors du volume Docker. Mécanisme au choix de l'hôte : tâche cron sur le VPS lançant un `docker compose exec` ou un second service dans `docker-compose.yml`.
  - Critères :
    - [ ] Une sauvegarde existe chaque nuit (script prêt ; planification à installer : `cron` absent de l hôte) dans un dossier hors du volume `data`
    - [x] Restauration testée une fois sur une base vide : l'app démarre et affiche les mêmes cartes et dépenses
    - [x] Procédure de restauration écrite dans `README.md`
  - Vérification : lancer la sauvegarde à la main, restaurer dans un conteneur jetable, comparer les comptes de lignes.
  - Fichiers : `docker-compose.yml` ou script dans `scripts/`, `README.md`

- [ ] **A2 : Mettre à jour `@fastify/jwt` (critique)** (S à M)
  - Description : passer à la version corrigée (10.x). Vérifier le changement d'API (`jwtVerify({ onlyCookie: true })`, `jwtSign`, option `cookie`).
  - Critères :
    - [ ] `npm audit --omit=dev` ne signale plus `@fastify/jwt` ni `fast-jwt`
    - [ ] Connexion, déconnexion, `/auth/me` et une route protégée fonctionnent
    - [ ] Une session existante (cookie de 30 jours) reste valable, sinon le dire avant de déployer
  - Vérification : build backend, test manuel de connexion en local avec le `.env`.
  - Dépendances : aucune
  - Fichiers : `backend/package.json`, `backend/package-lock.json`, `backend/src/server.ts`, `backend/src/auth.ts` si l'API change

- [ ] **A3 : Mettre à jour `@fastify/static`** (S)
  - Critères : `npm audit` ne le signale plus ; l'app est servie, le repli SPA vers `index.html` marche, `/api/inconnu` renvoie toujours 404 JSON.
  - Fichiers : `backend/package.json`, `backend/src/server.ts`

- [ ] **A4 : Mettre à jour `zod` (3 vers 4)** (M)
  - Description : lire le guide de migration ; les points sensibles sont `z.string().regex`, `.nullish().transform`, `.partial()`, le format de `error.issues` renvoyé par le gestionnaire d'erreur.
  - Critères : build propre ; un corps invalide renvoie toujours un 400 « Données invalides » ; le front affiche toujours le message.
  - Vérification : appeler une route avec un corps invalide (budget avec montant négatif) avant et après.
  - Fichiers : `backend/package.json`, tous les `routes/*.ts` si l'API change

- [ ] **A5 : Mettre à jour `prisma` (6 vers 7)** (M à L)
  - Description : migration majeure (configuration, adaptateurs). À faire en dernier, sur une copie de la base (A1 d'abord).
  - Critères : `prisma migrate deploy` passe sur une copie de la base de production ; aucune requête ne change de comportement ; `npm audit` ne signale plus `prisma`, `@prisma/config`, `deepmerge-ts`.
  - Vérification : démarrer l'image sur la copie, parcourir chaque page.
  - Dépendances : A1

### Checkpoint 1
- [ ] `npm audit --omit=dev` backend sans vulnérabilité haute ni critique (ou exception E1 mise à jour dans `CONSTRAINTS.md`)
- [ ] Une sauvegarde restaurée avec succès
- [ ] Livré : commit, push, redéploiement
- [ ] **Relecture humaine**

## Phase 2 : durcir l'exploitation (P1)

- [ ] **A6 : Image Docker durcie** (S)
  - Description : utilisateur non root (`USER node`, volume `data` accessible), `HEALTHCHECK` sur une petite route `/api/health` publique, sans donnée.
  - Critères :
    - [ ] `docker compose ps` affiche `healthy`
    - [ ] Le processus ne tourne plus en root ; l'écriture dans `/data` et `uploads/` fonctionne (ajouter une carte avec photo)
    - [ ] Un volume existant garde ses droits (prévoir `chown` au démarrage ou documenter la commande)
  - Fichiers : `Dockerfile`, `docker-compose.yml`, `backend/src/server.ts`

- [ ] **A7 : Premiers tests sur les calculs à risque** (M)
  - Description : Vitest côté frontend pour `lib/tricount.ts`, `lib/budget.ts`, `lib/expenses.ts` ; côté backend `nameKey` et `isPrivateIp`. Seulement des fonctions pures, pas de test de composants.
  - Critères :
    - [ ] Scripts `npm test` dans chaque paquet, lancés par Docker
    - [ ] Cas : mensuel contre annuel (÷ 12), remboursement qui annule un solde, 127.0.0.1 / 10.x / `::ffff:192.168.1.1` refusés, nom avec accents normalisé
    - [ ] Chaque test échoue si on casse volontairement la fonction (vérifier une fois)
  - Dépendances : aucune
  - Fichiers : `backend/package.json`, `frontend/package.json`, fichiers `*.test.ts` à côté du code

- [ ] **A8 : Sauvegarde avant migration** (S)
  - Description : l'entrée du conteneur copie `app.db` vers `app.db.avant-migration` avant `prisma migrate deploy` si des migrations sont en attente.
  - Critères : après un déploiement avec nouvelle migration, la copie existe ; un échec de migration laisse la base d'origine intacte.
  - Dépendances : A1
  - Fichiers : `Dockerfile` (commande), éventuellement `scripts/entrypoint.sh`

- [ ] **A9 : En-têtes de sécurité** (S)
  - Description : `@fastify/helmet` avec une CSP adaptée (images `data:` et `blob:`, tuiles de carte Leaflet, polices Google, flux SSE, `worker-src` pour le service worker). Tester avant de durcir : une CSP trop stricte casse la carte, le scanner de codes-barres ou les notifications.
  - Critères : `curl -I` montre les en-têtes ; toutes les pages et le mode hors ligne fonctionnent ; pas d'erreur CSP dans la console sur iPhone ni sur ordinateur.
  - Fichiers : `backend/package.json`, `backend/src/server.ts`

- [ ] **A10 : Révocation des sessions** (M)
  - Description : `User.sessionVersion` (entier, migration) inscrit dans le JWT ; `requireAuth` compare avec la base ; incrémenté au changement de mot de passe. Ajouter « se déconnecter partout » dans les réglages si simple.
  - Critères :
    - [x] Après un changement de mot de passe, l'ancien cookie reçoit un 401
    - [x] Les sessions déjà ouvertes avant le déploiement ne sont pas toutes déconnectées sans prévenir (valeur par défaut 0 acceptée si le jeton n'a pas le champ)
    - [x] Une requête de plus par appel : mesurer, sinon cache mémoire court
  - Dépendances : A2
  - Fichiers : `schema.prisma`, migration, `auth.ts`

- [ ] **A11 : Découper le frontend par page** (M)
  - Description : `React.lazy` + `Suspense` sur les routes de `App.tsx` (hors accueil). Mesurer d'abord le temps de premier affichage sur iPhone (Lighthouse mobile sur l'accueil), puis après.
  - Critères :
    - [x] Bundle d'entrée sous 400 kB (cliquet dans `CONSTRAINTS.md`)
    - [x] La navigation reste fluide ; en hors ligne, les pages déjà visitées s'ouvrent (le service worker met les morceaux en cache)
    - [x] Aucune page blanche pendant le chargement (repli visible)
  - Fichiers : `frontend/src/App.tsx`, éventuellement `vite.config.ts`

- [ ] **A12 : README à jour** (S)
  - Critères : port `127.0.0.1:8083`, liste réelle des pages, sauvegarde et restauration (A1), notifications (clés VAPID), variables d'environnement, commandes de vérification par Docker.
  - Fichiers : `README.md`

### Checkpoint 2
- [x] Tests lancés par Docker et passants
- [x] Image non root saine, en-têtes présents, sessions révoquées au changement de mot de passe
- [x] `CONSTRAINTS.md` : cliquets mis à jour avec les nouvelles valeurs
- [x] **Relecture humaine**

## Phase 3 : à l'occasion (P2)

Une seule ligne chacune ; passer en tâche détaillée au moment de s'y mettre.

- [x] A13 : corriger l'avertissement ESLint de `components/Codes.tsx` (déplacer les constantes dans `lib/`)
- [x] A14 : filtrer `ownerId` dans `PATCH`/`DELETE` des courses (cohérence avec le modèle)
- [x] A15 : allonger le mot de passe minimum à 10 caractères, avec message clair
- [x] A16 : vérifier les signatures d'image (octets magiques) en plus du type MIME dans `uploads.ts`
- [x] A17 : aligner les versions de TypeScript (5.9) et la version de Node de vérification (24, comme l'image)
- [x] A18 : types d'API partagés ou test de contrat entre `backend/` et `frontend/src/lib/api.ts` ; ids de catégories du budget en un seul endroit
- [x] A19 : niveau de logs Fastify réglable (`LOG_LEVEL`) et sans corps de requête
- [x] A20 : tests de bout en bout des parcours (connexion, courses, dépense) si les tests unitaires se révèlent insuffisants

## Rythme d'entretien

À faire régulièrement, sans tâche dédiée :

- Chaque mois : `npm audit --omit=dev` des deux paquets ; mise à jour des dépendances mineures ; lancer le build complet.
- Chaque trimestre : vérifier qu'une sauvegarde se restaure ; relire `CONSTRAINTS.md` et les exceptions arrivées à échéance.
- À chaque nouvelle fonctionnalité : mettre à jour `CLAUDE.md` (architecture) et `INVALIDATIONS` dans `live.ts` si d'autres appareils affichent la donnée.

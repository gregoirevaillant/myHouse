# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project

"Maison": a household PWA for two people (loyalty cards, weekly meals, recipes, shopping list + product catalogue, restaurants (tried / to try, map, visits), shared expenses, private journals, manual budget of monthly/yearly charges). Everything user-facing, all code comments, API error messages and commit messages are in **French**: keep it that way.

## Commands

No test suite exists. Verify changes by type-checking/building.

```sh
# backend (Fastify API on :3000, reads backend/.env: DATABASE_URL, JWT_SECRET, USER1_*, USER2_*)
cd backend && npm i && npx prisma migrate dev && npm run seed && npm run dev
npm run build                          # tsc → dist/
npx prisma migrate dev --name <name>   # after editing prisma/schema.prisma

# frontend (Vite on :5173, proxies /api → localhost:3000)
cd frontend && npm i && npm run dev
npm run build    # tsc -b && vite build
npm run lint     # eslint
```

Deployment: `docker compose up -d --build` (single image, port 1000, behind cloudflared). The container runs `prisma migrate deploy`, then the seed, then the server. SQLite DB and uploaded photos live in the `data` volume (`DATA_DIR=/data`).

## Architecture

Two independent npm packages, `backend/` and `frontend/`, combined in one Docker image: in production Fastify serves the built frontend from `PUBLIC_DIR` with an SPA fallback to `index.html` (anything not under `/api`).

### Backend (`backend/src`)
- Fastify 5 + Prisma 6 on SQLite, ESM (imports use `.js` extensions), Zod for all request validation. A `ZodError` thrown from a handler is turned into a 400 by the global error handler in `server.ts`; other errors with `statusCode < 500` return their message.
- `server.ts` mounts everything under `/api`; `/api/auth` is public, every other route plugin is registered inside a scope with the `requireAuth` preHandler. New route modules go in `routes/` and get registered there.
- Auth: JWT in an httpOnly `session` cookie (30 days). `req.user` is `{ id, householdId }`.
- **Data scoping**: every model hangs off a `Household`. Queries must always filter by `req.user.householdId`. Models also carry `createdById` and `ownerId`: `ownerId: null` means shared within the household; a set `ownerId` means private to that user (used by journals, reserved for later elsewhere).
- Conventions in the schema: dates are `YYYY-MM-DD` strings, enums are plain strings (comments list values), money is integer cents. A reimbursement is an `Expense` with `isReimbursement` paid by the debtor and shared to the creditor. `Product.nameKey` is a normalized name (lowercase, no accents) used for matching shopping items to products.
- Images (cards, products): multipart with a single optional `image` field, handled by `uploads.ts` (`readMultipart` / `saveImage` / `removeImage` / `sendImage`), stored in `DATA_DIR/uploads`, served via `GET /api/{cards|products}/:id/image`.
- **Budget** (`routes/budget.ts`, `frontend/src/lib/budget.ts`, `pages/Budget.tsx`): manual entry, no bank connection. A `BudgetItem` is a charge or income (`kind` EXPENSE | INCOME) that recurs `MONTHLY` or `YEARLY` (`dueDay`, plus `dueMonth` for yearly); amounts are positive integer cents, the sign comes from `kind`. Same visibility model as `HouseInfo`: `ownerId` null = shared, set = private (new items default to private). All totals (monthly equivalent = yearly ÷ 12, "reste par mois", 12-month calendar) are computed on the frontend from `GET /api/budget`. Category ids are duplicated in `routes/budget.ts` and `frontend/src/lib/budget.ts`. Budget data is deliberately not persisted offline.
- **Calories** (`routes/calories.ts`, `lib/calories.ts`, `pages/Calories.tsx`): suivi strictement personnel (`CalorieEntry.ownerId` toujours renseigné, jamais partagé), une ligne = un repas saisi (`meal` BREAKFAST | LUNCH | DINNER | SNACK, `kcal` entier). `GET /api/calories?from&to` renvoie une plage de jours. L'objectif quotidien est `User.calorieGoal` (via `/auth/preferences`). `Recipe.calories` = kcal par portion (importé depuis `nutrition.calories` du JSON-LD si présent) ; la fiche recette propose « Calories » pour l'ajouter au suivi du jour (`RecipeToCalories`). Scan de produit : `BarcodeScanner` (caméra, `@zxing/browser` chargé à la demande) lit un code-barres, `GET /api/calories/product/:barcode` interroge Open Food Facts côté serveur (kcal pour 100 g) et le formulaire calcule le total d'après les grammes. Pas de catalogue local. Données non persistées hors ligne.
- **Temps réel** (`live.ts`): `GET /api/events` is a Server-Sent Events stream (in-memory hub per household, `: ping` every 25 s for cloudflared). An `onResponse` hook on the `/api` scope (`invalidateOnWrite`) broadcasts the TanStack Query keys to refresh after every successful non-GET, according to the `INVALIDATIONS` URL-prefix map (private data — journals, budget, preferences — only to the same user's devices). New routes whose data other devices show must get an entry there. Only keys are sent, never data.
- **Pages de l'accueil vs barre de menu**: `User.hiddenTabs` masque des pages de la barre, `User.hiddenHome` (copié de `hiddenTabs` à la migration) masque des tuiles de l'accueil ; les deux sont indépendants, réglés dans `Profile.tsx` (`PageList`), et la recherche globale couvre l'union. Une session gardée hors ligne sans `hiddenHome` retombe sur `hiddenTabs` (`useHomeTabs`). Ordre des pages : `User.menuOrder` (CSV, commun à la barre et à l'accueil, flèches ▲▼ dans `PageList`) appliqué par `orderTabs` dans `lib/tabs.ts` (pages inconnues de l'ordre = à la fin). Tuiles sur 2 colonnes : `User.homeWide` (défaut `/repas`). Les tuiles vivent dans `components/home/` (chacune charge ses données ; `Tile` = lien en fond + contenu qui laisse passer les clics, sauf `Action` pour les boutons rapides ; ne jamais mettre un modal dans une tuile : overflow/transform). La barre défile au-delà de 7 pages.
- **Notifications push** (`push.ts`, `routes/push.ts`): Web Push via `web-push`; VAPID keys from `VAPID_PUBLIC_KEY`/`VAPID_PRIVATE_KEY` or generated once into `DATA_DIR/vapid.json`. `sendPush` skips users who muted the type (`User.mutedNotifications`, CSV: SHOPPING, EXPENSES; unknown legacy values are filtered out) or who are live (an open SSE connection = app on screen), and drops subscriptions answering 404/410. Only two triggers, on purpose, both sent immediately with high urgency: shopping adds (one push per add, the text recaps the same author's adds of the last 2 min and replaces the previous one via the tag) and new expenses. There are no scheduled jobs.
- **Import de recette** (`recipeImport.ts`, `POST /api/recipes/import`): fetches a page server-side, reads the schema.org `Recipe` JSON-LD and returns pre-filled fields (+ photo as data URL) without saving; the frontend shows them in `RecipeForm` via `draft`. Only public addresses are fetched (redirects re-checked).
- `seed.ts` is idempotent: it creates the household and the two accounts from `USER1_*`/`USER2_*` env vars only if missing, and never overwrites changed passwords.

### Frontend (`frontend/src`)
- React 19 + React Router 7 + TanStack Query 5 + Tailwind 3 (custom pastel palette and `ink`/`cream` colors in `tailwind.config.js`), PWA via `vite-plugin-pwa`.
- `lib/api.ts` holds the `api()` fetch wrapper (throws `ApiError` with the server's `error` message) and **all shared API types**; keep them in sync with the backend responses by hand.
- Auth state is the `["me"]` query (`lib/auth.ts`); `null` shows `Login`. Any 401 invalidates `["me"]` (global handler in `main.tsx`).
- **Offline**: the query cache is persisted to localStorage, but only the keys listed in `OFFLINE_KEYS` in `main.tsx` (`me`, `shopping`, `cards`, `infos`); `gcTime` is `Infinity` on purpose (see comment there). `lib/offline.ts` warms these queries and preloads their images on startup; the service worker caches `/api/(cards|products)/:id/image` (in `vite.config.ts`). When adding a field to `User` or to persisted data, handle older cached objects lacking it (cf. `hiddenTabs ?? []` in `lib/tabs.ts`).
- **Temps réel / push**: `lib/live.ts` (`useLiveUpdates`, mounted in `Layout`) keeps an `EventSource` open only while the page is visible and invalidates the received keys (all queries after a reconnect); there is no polling. The service worker is generated by workbox and loads `public/push-sw.js` (push display and notification click) through `workbox.importScripts`. `lib/push.ts` handles the per-device subscription; settings are in `Profile.tsx`.
- Navigation: `lib/tabs.ts` defines the menu tabs; users can hide tabs and the nav bar (preferences stored on `User`, updated optimistically via `useUpdatePreferences`). Routes are in `App.tsx`; pages under `Layout` get the shell, `CardDetail` is full-screen.

## Qualité et amélioration continue

Lire `CONSTRAINTS.md` avant d'écrire du code et ne pas l'affaiblir pour faire passer un changement. L'état des lieux est dans `docs/ANALYSE.md`, le backlog priorisé dans `tasks/amelioration.md` (cocher les tâches faites, mettre à jour les valeurs de `CONSTRAINTS.md` quand un cliquet s'améliore).

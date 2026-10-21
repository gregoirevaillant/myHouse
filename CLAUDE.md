# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project

"Maison": a household PWA for two people (loyalty cards, weekly meals, shopping list + product catalogue, shared expenses, private journals, personal bank-fed budget). Everything user-facing, all code comments, API error messages and commit messages are in **French**: keep it that way.

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
- **Budget** (`budget/`, `routes/budget.ts`, `routes/bank.ts`, `enableBanking.ts`): private per user, fully automatic from bank data via Enable Banking (PSD2); no manual entry. Sync (`budget/sync.ts`) upserts transactions on `(accountId, externalId)`, categorizes them (`budget/categorize.ts`: learned `CategoryRule` > internal transfer > keywords > MCC > default; `categorySource: USER` is never overwritten), then `detectRecurring` rebuilds `RecurringItem`s (DISMISSED ones stay dismissed). Category ids are duplicated in `budget/categories.ts` and `frontend/src/lib/budget.ts`. Amounts are signed (negative = outflow). `/api/bank/*` returns 503 unless `EB_APP_ID`/`EB_PRIVATE_KEY_PATH` are set; the server then also syncs every 6h. Budget data is deliberately not persisted offline.
- **Temps réel** (`live.ts`): `GET /api/events` is a Server-Sent Events stream (in-memory hub per household, `: ping` every 25 s for cloudflared). An `onResponse` hook on the `/api` scope (`invalidateOnWrite`) broadcasts the TanStack Query keys to refresh after every successful non-GET, according to the `INVALIDATIONS` URL-prefix map (private data — journals, budget, bank, preferences — only to the same user's devices). New routes whose data other devices show must get an entry there. Only keys are sent, never data.
- **Notifications push** (`push.ts`, `routes/push.ts`, `jobs.ts`): Web Push via `web-push`; VAPID keys from `VAPID_PUBLIC_KEY`/`VAPID_PRIVATE_KEY` or generated once into `DATA_DIR/vapid.json`. `sendPush` skips users who muted the type (`User.mutedNotifications`, CSV: SHOPPING, MEALS, EXPENSES, BUDGET, DIGEST) or who are live (an open SSE connection = app on screen), and drops subscriptions answering 404/410. Triggers: shopping adds (batched 2 min per author), new expenses, today's/tomorrow's meals, and `jobs.ts` (checked every 10 min, Europe/Paris time, once a day via `JobRun`): budget reminders at 9 h, weekly digest Sunday 19 h.
- `seed.ts` is idempotent: it creates the household and the two accounts from `USER1_*`/`USER2_*` env vars only if missing, and never overwrites changed passwords.

### Frontend (`frontend/src`)
- React 19 + React Router 7 + TanStack Query 5 + Tailwind 3 (custom pastel palette and `ink`/`cream` colors in `tailwind.config.js`), PWA via `vite-plugin-pwa`.
- `lib/api.ts` holds the `api()` fetch wrapper (throws `ApiError` with the server's `error` message) and **all shared API types**; keep them in sync with the backend responses by hand.
- Auth state is the `["me"]` query (`lib/auth.ts`); `null` shows `Login`. Any 401 invalidates `["me"]` (global handler in `main.tsx`).
- **Offline**: the query cache is persisted to localStorage, but only the keys listed in `OFFLINE_KEYS` in `main.tsx` (`me`, `shopping`, `cards`); `gcTime` is `Infinity` on purpose (see comment there). `lib/offline.ts` warms these queries and preloads their images on startup; the service worker caches `/api/(cards|products)/:id/image` (in `vite.config.ts`). When adding a field to `User` or to persisted data, handle older cached objects lacking it (cf. `hiddenTabs ?? []` in `lib/tabs.ts`).
- **Temps réel / push**: `lib/live.ts` (`useLiveUpdates`, mounted in `Layout`) keeps an `EventSource` open only while the page is visible and invalidates the received keys (all queries after a reconnect); there is no polling. The service worker is generated by workbox and loads `public/push-sw.js` (push display and notification click) through `workbox.importScripts`. `lib/push.ts` handles the per-device subscription; settings are in `Profile.tsx`.
- Navigation: `lib/tabs.ts` defines the menu tabs; users can hide tabs and the nav bar (preferences stored on `User`, updated optimistically via `useUpdatePreferences`). Routes are in `App.tsx`; pages under `Layout` get the shell, `CardDetail` is full-screen.

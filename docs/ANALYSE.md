# Analyse du projet Maison

Date : 2026-11-04. Analyse faite avec les skills `agent-skills` (revue à cinq axes, sécurité, performance, contraintes). Rien n'a été modifié dans le code : ce document constate, le backlog (`tasks/amelioration.md`) planifie.

## État mesuré

| Mesure | Valeur |
|--------|--------|
| Code source suivi par git (hors lockfiles) | ~10 700 lignes, 2 paquets (`backend/`, `frontend/`) |
| `tsc` backend | 0 erreur |
| `tsc -b` frontend | 0 erreur |
| `eslint` frontend | 0 erreur, 1 avertissement (`components/Codes.tsx:5`, react-refresh) |
| `npm audit --omit=dev` frontend | 0 vulnérabilité |
| `npm audit --omit=dev` backend | **10 vulnérabilités : 2 critiques, 5 hautes, 3 modérées** |
| Bundle JS principal frontend | 724 kB (220 kB gzip) + 454 kB (117 kB gzip) |
| Tests automatisés | aucun |
| CI | aucune |
| Sauvegarde de la base | aucune automatique |

## Points forts (à conserver)

- Découpage clair : un fichier de routes par domaine, validation Zod partout, erreurs en français.
- Cloisonnement par foyer systématique (`householdId` dans les requêtes) et modèle `ownerId` (partagé / privé) cohérent. Journaux, calories et budget sont bien filtrés par `ownerId`.
- Cookie de session `httpOnly`, `sameSite=lax`, `secure` en HTTPS ; limitation de débit sur le login ; hash `scrypt` avec comparaison à temps constant.
- Import de recette protégé contre le SSRF (adresses publiques seulement, redirections revérifiées, tailles limitées).
- Temps réel sobre (SSE, seulement des clés à invalider) ; hors-ligne limité aux données utiles et sans données sensibles (budget non persisté).
- Documentation de l'architecture dans `CLAUDE.md`, suivi de tâches dans `tasks/`.

## Constats classés

Gravité : **P0** à traiter maintenant, **P1** prochainement, **P2** quand l'occasion se présente.

### Sécurité

| # | Gravité | Constat | Où |
|---|---------|---------|----|
| S1 | **P0** | Dépendances backend vulnérables : `@fastify/jwt` / `fast-jwt` (critique, c'est la vérification de session), `@fastify/static` (haute), `prisma` (haute), `zod` (haute). Les correctifs demandent des versions majeures (`@fastify/jwt` 10, `@fastify/static` 10, `zod` 4, `prisma` 7) : à faire un par un, avec build et test de connexion. | `backend/package.json` |
| S2 | P1 | Aucun en-tête de sécurité (CSP, `X-Content-Type-Options`, `Referrer-Policy`, `X-Frame-Options`). Cloudflare en ajoute peut-être, mais rien n'est garanti côté app. | `server.ts` |
| S3 | P1 | Les sessions ne sont jamais révoquées : un changement de mot de passe ou la déconnexion ne coupe pas un cookie volé (valable 30 jours). Piste : champ `User.sessionVersion` dans le JWT, incrémenté au changement de mot de passe. | `auth.ts` |
| S4 | P1 | Le conteneur tourne en root, sans `HEALTHCHECK`. | `Dockerfile` |
| S5 | P2 | Mot de passe minimum 6 caractères. | `auth.ts:/password` |
| S6 | P2 | `PATCH` et `DELETE` des courses ne filtrent pas `ownerId` (aujourd'hui toujours `null`, sans effet réel, mais le modèle prévoit le privé). | `routes/shopping.ts` |
| S7 | P2 | Le type MIME des images vient du client, sans vérification du contenu. Risque faible car la réponse force un type image fixe. | `uploads.ts` |
| S8 | P2 | Le login ne limite que par adresse IP ; derrière cloudflared tout le monde partage l'IP de confiance via `trustProxy`. Acceptable tant que le port reste lié à `127.0.0.1` (c'est le cas depuis `21f38c6`). | `server.ts`, `docker-compose.yml` |

### Fiabilité et exploitation

| # | Gravité | Constat |
|---|---------|---------|
| F1 | **P0** | Aucune sauvegarde automatique du volume `data` (SQLite + photos + clés VAPID). Une erreur disque ou un `docker compose down -v` fait tout perdre : cartes, dépenses, journaux. |
| F2 | P1 | La migration (`prisma migrate deploy`) tourne au démarrage sans copie préalable de la base ; un échec de migration bloque le conteneur en boucle (`restart: unless-stopped`). |
| F3 | P1 | Aucun test ni CI : la seule vérification est `tsc` et `eslint` lancés à la main. Les logiques les plus risquées sont pures et faciles à tester : `tricount.ts` (270 lignes, soldes et remboursements), `lib/budget.ts`, `lib/expenses.ts`, `nameKey`, `isPrivateIp`. |
| F4 | P2 | Journalisation Fastify par défaut, sans niveau réglé ni masquage ; pas de suivi d'erreurs. Suffisant pour deux personnes. |

### Performance

| # | Gravité | Constat |
|---|---------|---------|
| R1 | P1 | Le bundle principal fait 724 kB (220 kB gzip) : toutes les pages sont chargées d'un coup, seule la carte (`RestaurantMap`) est découpée. Le découpage par route (`React.lazy`) réduirait le premier affichage sur iPhone. À mesurer avant (Lighthouse sur l'accueil). |
| R2 | P2 | Pas de pagination sur `expenses` et `calories` hors plage de dates ; sans effet à deux utilisateurs, à surveiller si l'historique grossit. |

### Maintenabilité

| # | Gravité | Constat |
|---|---------|---------|
| M1 | P1 | `README.md` périmé : parle du port 1000 (désormais `127.0.0.1:8083`), ne mentionne pas restaurants, calories, notifications, temps réel. |
| M2 | P1 | Les types d'API sont recopiés à la main entre `backend/` et `frontend/src/lib/api.ts`, et les ids de catégories du budget sont dupliqués. Risque de dérive silencieuse. Pas urgent à deux paquets ; un fichier de types partagé ou un test de contrat suffirait. |
| M3 | P2 | Versions TypeScript différentes (backend 5.9, frontend 5.8) et Node 22 en vérification contre Node 24 dans l'image. À aligner. |
| M4 | P2 | Fichiers volumineux à surveiller : `Restaurants.tsx` (344 lignes), `Budget.tsx` (334), `tricount.ts` (270). Pas de découpage tant qu'on ne les modifie pas. |
| M5 | P2 | Un avertissement ESLint (`Codes.tsx`) : déplacer les constantes exportées dans un fichier de `lib/`. |

## Ce qui n'est volontairement pas recommandé

- Pas de monitoring ni d'observabilité lourde : deux utilisateurs, un conteneur.
- Pas de migration vers Postgres : SQLite suffit, la sauvegarde (F1) règle le vrai risque.
- Pas de bibliothèque de gestion d'état ou de formulaires : TanStack Query couvre le besoin.
- Pas de suite de tests exhaustive : seulement les fonctions pures à risque (F3).

# Contraintes

Dernière revue : 2026-11-04. Niveau de départ : « écrit » (commandes Docker à lancer à la main ; backlog dans `tasks/amelioration.md`).

Lire ce fichier avant d'écrire du code. Ne pas l'affaiblir pour faire passer un changement : un seuil qui baisse doit se voir dans la revue, avec une exception datée plus bas.

Pas d'outils installés sur l'hôte : tout se lance par Docker (voir `tasks/todo.md`).

## Plancher (toujours appliqué)

- Aucun nouveau `@ts-ignore`, `@ts-expect-error` sans raison, `eslint-disable`, ni `as any`
- Aucun `catch {}` vide qui avale une erreur sans commentaire (le `.catch(() => {})` de `removeImage` est l'exception connue)
- Aucun test supprimé ou ignoré sans raison dans le message de commit
- Aucun secret dans le code ou dans git (`.env` reste ignoré ; `.env.example` ne contient que des variables vides ou des e-mails)
- Toute requête Prisma sur une donnée du foyer filtre par `req.user.householdId`, et par `ownerId` pour les données privées
- Textes visibles, commentaires, messages d'erreur d'API et commits en français

## Appliqué avec des chiffres

| Dimension | Règle | Pourquoi ce seuil | Commande | Quand |
|-----------|-------|-------------------|----------|-------|
| Types backend | 0 erreur | Déjà à 0 aujourd'hui | `docker run --rm -v "$PWD/backend":/app -w /app node:22-slim sh -c "npx prisma generate && npx tsc --noEmit"` | avant chaque commit |
| Types frontend | 0 erreur | Déjà à 0 aujourd'hui | `docker run --rm -v "$PWD/frontend":/app -w /app node:22-slim sh -c "npx tsc -b"` | avant chaque commit |
| Lint frontend | 0 erreur, 1 avertissement maximum (état actuel) | Ne pas en ajouter ; corriger `Codes.tsx` (M5) | `… npm run lint` | avant chaque commit |
| Dépendances (externe) | Aucune vulnérabilité haute ou critique dans `npm audit --omit=dev` | Frontend déjà à 0 ; le backend est à 7 hautes/critiques (voir exceptions) | `docker run --rm -v "$PWD/backend":/app -w /app node:22-slim npm audit --omit=dev --audit-level=high` | à chaque mise à jour de dépendance, une fois par mois |
| Migration | `prisma migrate diff` = « No difference » après un changement de schéma | Évite un schéma et des migrations qui divergent | `npx prisma migrate diff --from-migrations prisma/migrations --to-schema-datamodel prisma/schema.prisma` | après toute édition de `schema.prisma` |
| Build | `docker compose build` réussit | C'est ce qui part en production | `docker compose build` | avant déploiement |

## Mesuré, pas encore imposé (cliquet : ne doit pas empirer)

| Mesure | Aujourd'hui | Sens |
|--------|-------------|------|
| Bundle JS principal frontend | 724 kB (220 kB gzip) | ne doit pas grandir (tolérance 0,5 %) ; à réduire (tâche A11) |
| Avertissements ESLint | 1 | ne doit pas monter |
| Vulnérabilités backend (prod) | 10 (2 critiques, 5 hautes, 3 modérées) | doit baisser jusqu'à 0 haute/critique (tâches A2 à A5) |
| Tests automatisés | 0 | doit monter (tâche A7), puis couverture des lignes modifiées ≥ 80 % sur les fichiers de calcul |
| Sauvegarde automatique | `scripts/backup.sh` (A1) | doit tourner chaque nuit |

## Exceptions

| ID | Règle | Périmètre | Raison | Responsable | Expire |
|----|-------|-----------|--------|-------------|--------|
| E1 | Dépendances sans vulnérabilité haute/critique | `backend/package.json` : `@fastify/jwt`, `@fastify/static`, `prisma`, `zod` | Correctifs en versions majeures, à traiter un par un (A2 à A5) | Grégoire | 2027-01-31 |
| E2 | `catch` vide | `backend/src/uploads.ts` `removeImage` | Supprimer un fichier déjà absent ne doit pas échouer | Grégoire | permanente |

## Garde-fous du seuil lui-même

À vérifier à chaque revue avec `git diff` :

1. Un seuil a-t-il baissé, une commande retirée de ce tableau ?
2. Un test a-t-il été retiré ou allégé ?
3. Un commentaire de suppression (`eslint-disable`, `@ts-ignore`) est-il apparu ?
4. Un code inachevé (`throw new Error("Not implemented")`, `TODO` à la place du code) est-il apparu ?
5. Une ligne a-t-elle été ajoutée à la table des exceptions sans discussion ?

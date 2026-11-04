# Tâches : ordre des pages + accueil bento

Vérification commune à chaque tâche (pas de suite de tests dans le projet) :
- Backend : `docker run --rm -v "$PWD/backend":/app -w /app node:22-slim sh -c "npx prisma generate && npx tsc --noEmit"`
- Frontend : `docker run --rm -v "$PWD/frontend":/app -w /app node:22-slim sh -c "npx tsc -b && npm run lint"`
- Déploiement : commit, push, `docker compose up -d --build`

## Phase 1 : ordre des pages

- [x] **T1 : L'ordre est enregistré et appliqué** (M)
  - Description : nouveau champ `User.menuOrder` (CSV de routes), renvoyé par l'API, modifiable via `PATCH /auth/preferences` ; `lib/tabs.ts` trie barre et accueil selon cet ordre.
  - Critères :
    - [x] `PATCH /auth/preferences {menuOrder:["/budget","/cartes"]}` est refusé s'il contient autre chose qu'une route valide (même regex que `hiddenTabs`)
    - [x] Avec `menuOrder = ["/budget","/cartes"]`, la barre et l'accueil montrent Budget puis Cartes, puis les autres pages dans l'ordre par défaut
    - [x] Une page absente de `menuOrder` (ex. nouvelle page) apparaît à la fin
    - [x] Une session sans le champ (`undefined`) garde l'ordre par défaut
  - Vérification : `tsc`/lint ; `prisma migrate diff` = « No difference » ; appel PATCH puis lecture de `/auth/me` ; contrôle sur l'accueil.
  - Dépendances : aucune
  - Fichiers : `backend/prisma/schema.prisma`, nouvelle migration, `backend/src/auth.ts`, `frontend/src/lib/api.ts`, `frontend/src/lib/auth.ts`, `frontend/src/lib/tabs.ts`, `frontend/src/pages/Home.tsx` (tri des tuiles)

- [x] **T2 : Je réordonne les pages dans les Réglages** (S)
  - Description : dans `PageList`, boutons ▲ ▼ par page ; l'ordre est enregistré (mise à jour optimiste).
  - Critères :
    - [x] ▲ sur la première page et ▼ sur la dernière sont désactivés
    - [x] Un déplacement change aussitôt l'ordre de la liste, de la barre et de l'accueil, sur le téléphone et sur un autre appareil de la même personne (via `["me"]` invalidé)
    - [x] Les pages masquées restent réordonnables
    - [x] Cibles tactiles ≥ 44 px, libellés accessibles (« Monter Budget »)
  - Vérification : `tsc`/lint ; contrôle iPhone : monter Budget en premier, recharger, vérifier la barre et l'accueil.
  - Dépendances : T1
  - Fichiers : `frontend/src/pages/Profile.tsx`

### Checkpoint 1
- [x] `tsc` et lint propres, migration conforme
- [x] Ordre changé dans Réglages → visible sur l'accueil et la barre après rechargement
- [x] Le compte de Noémie (pages masquées) n'est pas modifié
- [x] **Relecture humaine avant la suite**

## Phase 2 : tout voir dans la barre

- [x] **T3 : Barre de menu défilante au-delà de 7 pages** (S)
  - Description : quand il y a plus de 7 onglets, la barre défile horizontalement (onglets de largeur fixe, libellés lisibles), au lieu de tout écraser.
  - Critères :
    - [x] Avec 10 pages, libellés complets (≥ 11 px) et zones tactiles confortables
    - [x] L'onglet actif est amené dans la vue au chargement
    - [x] ≤ 7 pages : rendu inchangé
    - [x] Clair et sombre OK, zone sûre en bas de l'iPhone respectée
  - Vérification : `tsc`/lint ; contrôle iPhone (barre activée, 10 pages).
  - Dépendances : aucune (peut se faire avant T2)
  - Fichiers : `frontend/src/components/Layout.tsx`

### Checkpoint 2
- [x] Toutes les pages accessibles depuis la barre avec 10 pages
- [x] **Relecture humaine**

## Phase 3 : accueil bento (à valider avant de commencer)

- [x] **T4 : Sortir les tuiles de `Home.tsx`** (M, refactor sans changement visible)
  - Description : une tuile = un petit composant dans `components/home/`, `Home.tsx` ne garde que la grille et le tri.
  - Critères :
    - [x] Rendu identique avant/après (clair et sombre)
    - [x] Chaque tuile charge ses propres données ; `enabled` conserve l'économie de requêtes pour les pages masquées
    - [x] `Home.tsx` < 120 lignes
  - Vérification : `tsc`/lint ; comparaison visuelle.
  - Dépendances : T1
  - Fichiers : `frontend/src/pages/Home.tsx` + ~9 fichiers de tuiles (à regrouper si trop)

- [x] **T5 : Taille de tuile réglable (normale / large)** (M)
  - Description : par tuile, choix « normale » ou « large » (2 colonnes), enregistré par personne (`User.homeWide`, CSV) ; réglé dans les Réglages à côté de l'ordre.
  - Critères :
    - [x] Une tuile large occupe 2 colonnes sur iPhone, sans trou laissé dans la grille avec `grid-flow-dense`
    - [x] Valeur par défaut = tailles actuelles (Repas large)
    - [x] Champ absent des anciennes sessions toléré
  - Vérification : `tsc`/lint, migration conforme ; contrôle iPhone avec 3 combinaisons.
  - Dépendances : T4
  - Fichiers : schéma + migration, `auth.ts`, `api.ts`, `lib/auth.ts`, `lib/tabs.ts`, `Profile.tsx`, `Home.tsx`

- [x] **T6 : Actions rapides sur les tuiles** (M)
  - Description : sur Courses, un champ « Ajouter un article » sans quitter l'accueil ; sur Calories, un bouton « + » qui ouvre l'ajout d'un repas.
  - Critères :
    - [x] Ajouter un article depuis l'accueil l'ajoute à la liste de courses (avec la notification à l'autre personne, comme aujourd'hui)
    - [x] Le clic sur « + » n'ouvre pas la page de la tuile
    - [x] Fonctionne au clavier et au toucher
  - Vérification : `tsc`/lint ; contrôle iPhone des deux actions.
  - Dépendances : T4
  - Fichiers : tuiles Courses et Calories, éventuellement `pages/Calories.tsx` (extraire `EntryForm`)

### Checkpoint 3
- [x] Toutes les critères des tâches validés sur iPhone (clair et sombre)
- [x] `CLAUDE.md` mis à jour (ordre du menu, tailles)
- [x] Livré : commit, push, redéploiement

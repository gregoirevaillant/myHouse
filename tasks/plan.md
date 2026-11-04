# Plan : ordre des pages du menu + accueil « bento » amélioré

## Contexte (état actuel)
- `frontend/src/lib/tabs.ts` : liste fixe `tabs` (10 pages). `useVisibleTabs()` (barre) et `useHomeTabs()` (accueil) la filtrent selon `User.hiddenTabs` / `User.hiddenHome`. **Aucun ordre personnalisable** : barre et accueil suivent l'ordre du tableau.
- `pages/Home.tsx` (289 lignes) : un tableau `tiles` dans un ordre codé en dur, filtré par `visible`. Les tailles sont codées dans chaque tuile (`Repas` = `col-span-2`, `Courses` = `row-span-2`), grille `grid-cols-2 sm:grid-cols-3`, `grid-flow-dense`.
- `components/Layout.tsx` : barre du bas, `justify-around`, tous les onglets sur la largeur (10 onglets = libellés à 10 px, tronqués).
- `pages/Profile.tsx` : `MenuSettings` + `PageList` (cases à cocher barre / accueil).
- Préférences : `User` (Prisma) → `publicUser` / `PATCH /auth/preferences` (`auth.ts`) → `useUpdatePreferences` (optimiste). Pas de suite de tests : vérification par `tsc`, `lint`, `prisma migrate diff`, puis contrôle à la main sur iPhone.

## Décisions d'architecture
1. **Un seul ordre, partagé par la barre et l'accueil** (`User.menuOrder`, CSV de routes comme `hiddenTabs`). Plus simple à régler et à comprendre ; la séparation des *pages affichées* existe déjà. (Question ouverte 1.)
2. **Réordonner avec des flèches ▲ ▼** dans Réglages, pas de glisser-déposer : sur iPhone le glisser est fragile (conflit avec le défilement) et demanderait une dépendance.
3. **Pages absentes de l'ordre enregistré** (nouvelle page ajoutée plus tard, session gardée hors ligne sans le champ) : placées à la fin, dans l'ordre par défaut. `menuOrder ?? []` comme pour `hiddenTabs`.
4. L'ordre est appliqué **à un seul endroit** (`lib/tabs.ts`) ; `Home`, `Layout` et la recherche n'ont rien à savoir de plus. `Home` trie ses tuiles avec la même fonction.
5. « Améliorer le bento » est vague : je propose trois améliorations concrètes, **optionnelles et ordonnées** (phase 3), à valider avant de les faire.

## Graphe de dépendances
```
User.menuOrder (schéma + migration)
   └── PATCH /auth/preferences + publicUser
          └── type User + Preferences (frontend)
                 └── orderTabs() dans lib/tabs.ts ──┬── Layout (barre)
                        │                           └── Home (tuiles)
                        └── flèches ▲▼ dans Profile (PageList)

Layout : barre défilante (indépendant)
Home : extraction des tuiles ──► tailles réglables ──► actions rapides
```

## Phase 1 : ordre des pages
- T1 Ordre enregistré et appliqué (backend + `orderTabs`)
- T2 Flèches ▲ ▼ dans les Réglages
- Checkpoint 1

## Phase 2 : tout voir dans la barre
- T3 Barre de menu défilante au-delà de 7 pages
- Checkpoint 2

## Phase 3 : accueil bento (optionnel, à valider)
- T4 Sortir les tuiles de `Home.tsx` (refactor, sans changement visible)
- T5 Taille de tuile réglable (normale / large)
- T6 Actions rapides sur les tuiles (Courses, Calories)
- Checkpoint 3

Le détail des tâches (critères, vérifications, fichiers) est dans `tasks/todo.md`.

## Risques et parades
| Risque | Impact | Parade |
|---|---|---|
| iPhone garde l'ancienne version de l'app en cache (déjà vu) | Moyen | Dire de rouvrir l'app deux fois ; `menuOrder ?? []` rend le nouveau code tolérant aux anciennes sessions |
| Tailles réglables + `grid-flow-dense` laissent des trous dans la grille | Moyen | T5 limité à 2 tailles (1×1 / 2×1) ; contrôle visuel iPhone clair et sombre avant de livrer |
| Migration SQLite écrite à la main qui diverge du schéma | Moyen | `prisma migrate diff` après `migrate deploy` (fait pour les migrations précédentes) |
| `Home.tsx` grossit encore (289 lignes) | Faible | T4 avant T5/T6 |
| Les deux comptes ont des réglages différents (Noémie masque des pages) | Faible | Ordre stocké par personne ; aucun réglage existant modifié |

## Questions ouvertes (valeurs par défaut si pas de réponse)
1. Un même ordre pour la barre et l'accueil, ou deux ordres séparés ? **Défaut : un seul.**
2. Que veux-tu dire par « améliorer le bento » ? Mes propositions : tailles réglables (T5), actions rapides (T6), grille plus lisible. **Défaut : faire la phase 1 et 2, puis valider T4–T6 avec toi.**
3. Flèches ▲ ▼ ou glisser-déposer ? **Défaut : flèches.**

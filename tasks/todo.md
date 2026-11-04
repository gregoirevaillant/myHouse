# Tâches : bouton retour visible, défilement indépendant

Vérification commune (pas de suite de tests dans le projet) :
- Frontend : `docker run --rm -v "$PWD/frontend":/app -w /app node:22-slim sh -c "npx tsc -b && npm run lint"` (0 erreur, 1 avertissement existant sur `Codes.tsx`)
- Déploiement : commit, push, `docker compose up -d --build`
- Contrôle visuel sur iPhone (application installée), clair et sombre

## Phase 1 : le bouton retour reste visible

- [x] **T1 : En-tête collant en haut de l'écran** (S)
  - Description : l'en-tête de `Layout` reste fixé en haut pendant le défilement ; la zone sûre iPhone passe dans son `padding-top`.
  - Critères :
    - [ ] Sur une longue page (Courses, Recettes), en défilant, le bouton ◀ reste visible et cliquable
    - [ ] Le contenu ne s'affiche pas par-dessus ni au travers de l'en-tête (fond opaque, clair et sombre)
    - [ ] L'en-tête ne passe pas sous l'encoche / la barre d'état en mode application installée
    - [ ] Une modale (🔍 Recherche, formulaires) s'affiche toujours par-dessus l'en-tête
    - [ ] La barre du bas et l'accueil sont inchangés
  - Vérification : `tsc` + lint ; contrôle iPhone : défiler Courses, vérifier ◀, ouvrir la recherche.
  - Dépendances : aucune
  - Fichiers : `frontend/src/components/Layout.tsx`

- [ ] ~~**T2 : Chaque nouvelle page s'ouvre en haut** (S) — non retenue, hors demande~~
  - Description : composant `ScrollToTop` (`useLocation` + `useNavigationType`) monté dans `App.tsx` ; à chaque navigation vers une nouvelle page, on revient en haut avant l'affichage (`useLayoutEffect`).
  - Critères :
    - [ ] Défiler l'accueil jusqu'en bas, ouvrir « Budget » : la page commence en haut, ◀ visible
    - [ ] Même comportement via la barre du bas, une tuile, la recherche et un lien interne (liste de recettes vers une recette)
    - [ ] `CardDetail` (hors `Layout`) s'ouvre aussi en haut
    - [ ] Ajouter ou cocher un article (même page, données qui changent) ne remonte pas la page
  - Vérification : `tsc` + lint ; contrôle iPhone des cinq chemins ci-dessus.
  - Dépendances : aucune (se combine avec T1)
  - Fichiers : nouveau `frontend/src/components/ScrollToTop.tsx`, `frontend/src/App.tsx`

### Checkpoint 1
- [ ] `tsc` et lint propres
- [ ] Défiler l'accueil, ouvrir une page : elle est en haut avec ◀ visible ; défiler la page : ◀ reste visible
- [ ] Clair et sombre, iPhone installé
- [ ] **Relecture humaine** (décider si T3 est voulue)

## Phase 2 : confort (facultatif)

- [ ] ~~**T3 : Retour arrière = retrouver sa position** (S) — non retenue, hors demande~~
  - Description : `ScrollToTop` mémorise la position par entrée d'historique (`location.key`) ; sur un retour arrière (`POP`), on la restaure, sinon on remonte en haut.
  - Critères :
    - [ ] Défiler une longue liste, ouvrir un détail, revenir avec le geste ou le bouton du navigateur : on retrouve la position
    - [ ] Le bouton ◀ de l'en-tête (lien vers l'accueil, donc une nouvelle navigation) ouvre l'accueil en haut
    - [ ] Aucun saut visible quand le contenu arrive après coup
  - Vérification : `tsc` + lint ; contrôle iPhone avec Courses puis Produits puis retour.
  - Dépendances : T2
  - Fichiers : `frontend/src/components/ScrollToTop.tsx`

### Checkpoint 2
- [ ] Tout validé sur iPhone ; livré : commit, push, redéploiement
- [ ] `CLAUDE.md` : une ligne dans « Frontend » (en-tête collant, `ScrollToTop`)

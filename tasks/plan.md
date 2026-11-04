# Plan : bouton retour toujours visible, défilement indépendant entre pages

## Contexte (état actuel)
- Toute l'app défile avec **la fenêtre** (pas de conteneur à défilement propre) : `Layout.tsx` est un `div` normal, le `<header>` (bouton ◀ Accueil, titre, 🔍, profil) est dans le flux, donc il part avec le défilement.
- Aucune gestion du défilement lors d'un changement de page : `BrowserRouter` (`main.tsx`) ne remet rien à zéro. Si on défile l'accueil puis qu'on ouvre une page, la nouvelle page s'affiche **à la même position** : le bouton ◀ est déjà hors de l'écran, et la page commence au milieu.
- Le bouton ◀ renvoie à `/` (Accueil), il n'est affiché que hors de l'accueil (`!isHome`).
- La barre du bas est déjà `fixed` (`z-40`) ; les modales sont `fixed z-50` et bloquent le défilement du `body`. `CardDetail` est une route à part (hors `Layout`) avec son propre bouton retour.
- Couleur de fond : `bg-cream` (variable CSS, clair et sombre). Zone sûre iPhone : `env(safe-area-inset-top)` déjà utilisée dans le `padding-top` du conteneur.

## Décisions
1. **En-tête collant (`sticky top-0`)** plutôt que bouton flottant : le titre, la recherche et le profil restent aussi accessibles, rien à repositionner, aucun nouveau composant. Alternative écartée : ne coller que le bouton ◀ (il recouvrirait le contenu de la page).
2. **Remise en haut à chaque navigation** par un petit composant `ScrollToTop` placé dans `App.tsx` (couvre aussi `CardDetail`, hors `Layout`). Utilise `useLocation` + `useNavigationType`.
3. **Retour arrière du navigateur** : on retrouve la position de la page précédente (utile pour revenir sur une longue liste). Gardé comme tâche séparée et facultative : plus fragile que la remise à zéro.
4. Le `padding-top` (zone sûre) passe du conteneur à l'en-tête collant, sinon le contenu défilerait derrière l'encoche.

## Graphe de dépendances
```
T1 en-tête collant (Layout.tsx)        T2 remise en haut (App.tsx + nouveau composant)
        └─────────── indépendantes, T3 dépend de T2 ───────────┘
                                                  └── T3 position restaurée au retour (facultatif)
```

## Risques
| Risque | Impact | Parade |
|--------|--------|--------|
| Contenu qui passe visiblement sous l'en-tête collant (fond transparent) | Moyen | Fond `bg-cream` opaque, léger dégradé ou ombre non nécessaire |
| Encoche / barre d'état iPhone : en-tête mal placé en mode PWA | Moyen | Zone sûre dans le `padding-top` de l'en-tête ; contrôle sur iPhone installé |
| En-tête collant et modales (`z-50`) ou barre du bas (`z-40`) | Faible | En-tête en `z-30` |
| `scrollTo` exécuté avant que la page soit rendue (contenu plus court, position qui « saute ») | Faible | `useLayoutEffect` dans `ScrollToTop` |
| Perte de la position au retour arrière (T3) si le contenu charge après coup | Faible | T3 facultative ; sinon retour en haut, acceptable |

import { useMe } from "./auth";

export const tabs = [
  { to: "/cartes", label: "Cartes", icon: "💳", active: "bg-lavender" },
  { to: "/repas", label: "Repas", icon: "🍽️", active: "bg-peach" },
  { to: "/recettes", label: "Recettes", icon: "📖", active: "bg-rose" },
  { to: "/courses", label: "Courses", icon: "🛒", active: "bg-mint" },
  { to: "/restos", label: "Restos", icon: "🍜", active: "bg-peach" },
  { to: "/depenses", label: "Dépenses", icon: "💶", active: "bg-sky" },
  { to: "/journal", label: "Journal", icon: "📔", active: "bg-lemon" },
  { to: "/infos", label: "Infos", icon: "🔑", active: "bg-lavender" },
  { to: "/calories", label: "Calories", icon: "🔥", active: "bg-peach" },
  { to: "/budget", label: "Budget", icon: "📊", active: "bg-rose" },
  { to: "/media", label: "Médias", icon: "🎬", active: "bg-lavender" },
  { to: "/poids", label: "Poids", icon: "⚖️", active: "bg-sky" },
  { to: "/sante", label: "Santé", icon: "❤️", active: "bg-mint" },
  { to: "/sport", label: "Sport", icon: "📈", active: "bg-lemon" },
  { to: "/sommeil", label: "Sommeil", icon: "😴", active: "bg-lavender" },
  { to: "/aujourdhui", label: "Aujourd'hui", icon: "🌅", active: "bg-lemon" },
];

// pages activées pour la famille par l'administrateur ; features absent (session gardée hors ligne avant les familles) = toutes
export const allowedTabs = (features?: string[]) => (features ? tabs.filter((t) => features.includes(t.to.slice(1))) : tabs);
export const useEnabledTabs = () => allowedTabs(useMe().data?.features);
export const useHasPage = (page: string) => {
  const me = useMe().data;
  return !me?.features || me.features.includes(page) || !!me.privateFeatures?.includes(page);
};

// Espace privé (administrateur seulement) : pages hors des familles, rangées sous /prive sur l'accueil
export const PRIVATE_PAGES = ["/aujourdhui", "/journal", "/media", "/calories", "/poids", "/sante", "/sport", "/sommeil"];
export const isPrivatePath = (pathname: string) => pathname === "/prive" || PRIVATE_PAGES.some((p) => pathname === p || pathname.startsWith(`${p}/`));
export const usePrivateTabs = () => {
  const priv = useMe().data?.privateFeatures ?? [];
  return PRIVATE_PAGES.map((to) => tabs.find((t) => t.to === to)!).filter((t) => priv.includes(t.to.slice(1)));
};

// pages dans l'ordre choisi ; celles que l'ordre ne connaît pas (nouvelle page) restent à la fin, dans l'ordre par défaut
export function orderTabs(list: typeof tabs, order: string[]) {
  const rank = (to: string) => {
    const i = order.indexOf(to);
    return i < 0 ? order.length : i;
  };
  return [...list].sort((a, b) => rank(a.to) - rank(b.to));
}

// pages affichées sur l'accueil ; ?? hiddenTabs : une session gardée hors ligne avant ce réglage masquait les mêmes pages que la barre
export function useHomeTabs() {
  const { data: me } = useMe();
  const hidden = me?.hiddenHome ?? me?.hiddenTabs ?? [];
  return orderTabs(allowedTabs(me?.features).filter((t) => !hidden.includes(t.to)), me?.menuOrder ?? []);
}

// tuiles de l'accueil sur 2 colonnes ; ?? : sans réglage, seulement les repas
export const useWideTiles = () => new Set(useMe().data?.homeWide ?? ["/repas"]);

// onglets affichés dans la barre de menu, selon les préférences de la personne connectée
export function useVisibleTabs() {
  const { data: me } = useMe();
  // ?? [] : une session gardée hors ligne avant l'ajout des préférences n'a pas le champ
  const hidden = me?.hiddenTabs ?? [];
  const enabled = allowedTabs(me?.features);
  const visible = enabled.filter((t) => !hidden.includes(t.to));
  return orderTabs(visible.length ? visible : enabled, me?.menuOrder ?? []);
}

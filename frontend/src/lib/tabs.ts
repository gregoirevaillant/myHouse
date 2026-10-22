import { useMe } from "./auth";

export const tabs = [
  { to: "/cartes", label: "Cartes", icon: "💳", active: "bg-lavender" },
  { to: "/repas", label: "Repas", icon: "🍽️", active: "bg-peach" },
  { to: "/courses", label: "Courses", icon: "🛒", active: "bg-mint" },
  { to: "/restos", label: "Restos", icon: "🍜", active: "bg-peach" },
  { to: "/depenses", label: "Dépenses", icon: "💶", active: "bg-sky" },
  { to: "/journal", label: "Journal", icon: "📔", active: "bg-lemon" },
  { to: "/infos", label: "Infos", icon: "🔑", active: "bg-lavender" },
  { to: "/budget", label: "Budget", icon: "📊", active: "bg-rose" },
];

// onglets affichés dans la barre de menu, selon les préférences de la personne connectée
export function useVisibleTabs() {
  const { data: me } = useMe();
  // ?? [] : une session gardée hors ligne avant l'ajout des préférences n'a pas le champ
  const hidden = me?.hiddenTabs ?? [];
  const visible = tabs.filter((t) => !hidden.includes(t.to));
  return visible.length ? visible : tabs;
}

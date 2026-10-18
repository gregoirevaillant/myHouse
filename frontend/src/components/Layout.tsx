import { NavLink, Outlet } from "react-router-dom";
import { useMe } from "../lib/auth";

const tabs = [
  { to: "/cartes", label: "Cartes", icon: "💳", active: "bg-lavender" },
  { to: "/repas", label: "Repas", icon: "🍽️", active: "bg-peach" },
  { to: "/courses", label: "Courses", icon: "🛒", active: "bg-mint" },
  { to: "/depenses", label: "Dépenses", icon: "💶", active: "bg-sky" },
];

export function Layout() {
  const { data: me } = useMe();
  return (
    <div className="mx-auto min-h-screen max-w-2xl px-4 pb-32 pt-[calc(1.25rem+env(safe-area-inset-top))]">
      <header className="mb-6 flex items-center justify-between">
        <div>
          <p className="text-sm font-semibold text-ink-soft">Bonjour {me?.name} 👋</p>
          <h1 className="text-2xl font-extrabold">Notre maison</h1>
        </div>
        <NavLink
          to="/profil"
          className="flex h-11 w-11 items-center justify-center rounded-full bg-rose text-lg font-extrabold shadow-soft"
          aria-label="Profil"
        >
          {me?.name.charAt(0).toUpperCase()}
        </NavLink>
      </header>

      <Outlet />

      <nav className="fixed inset-x-0 bottom-0 z-40 px-4 pb-[calc(0.75rem+env(safe-area-inset-bottom))]">
        <div className="mx-auto flex max-w-md justify-around rounded-3xl bg-white p-2 shadow-soft">
          {tabs.map((t) => (
            <NavLink
              key={t.to}
              to={t.to}
              className={({ isActive }) =>
                `flex flex-1 flex-col items-center rounded-2xl py-2 text-xs font-bold transition ${isActive ? t.active : "text-ink-soft"}`
              }
            >
              <span className="text-xl">{t.icon}</span>
              {t.label}
            </NavLink>
          ))}
        </div>
      </nav>
    </div>
  );
}

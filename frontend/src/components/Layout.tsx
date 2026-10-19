import { NavLink, Outlet } from "react-router-dom";
import { useMe } from "../lib/auth";
import { useOfflineWarmup } from "../lib/offline";
import { useVisibleTabs } from "../lib/tabs";
import { OfflineBanner } from "./OfflineBanner";

export function Layout() {
  const { data: me } = useMe();
  const tabs = useVisibleTabs();
  useOfflineWarmup();
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

      <OfflineBanner />
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

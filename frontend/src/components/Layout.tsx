import { useState } from "react";
import { Link, NavLink, Outlet, useLocation } from "react-router-dom";
import { useMe } from "../lib/auth";
import { useLiveUpdates } from "../lib/live";
import { useOfflineWarmup } from "../lib/offline";
import { useVisibleTabs } from "../lib/tabs";
import { GlobalSearch } from "./GlobalSearch";
import { Modal } from "./Modal";
import { OfflineBanner } from "./OfflineBanner";

export function Layout() {
  const { data: me } = useMe();
  const tabs = useVisibleTabs();
  const isHome = useLocation().pathname === "/";
  const [searching, setSearching] = useState(false);
  // ?? true : une session gardée hors ligne avant l'ajout de la préférence n'a pas le champ
  const showNavBar = me?.showNavBar ?? true;
  useOfflineWarmup();
  useLiveUpdates();
  return (
    <div
      className={`mx-auto min-h-screen max-w-2xl px-4 pt-[calc(1.25rem+env(safe-area-inset-top))] ${showNavBar ? "pb-32" : "pb-[calc(2rem+env(safe-area-inset-bottom))]"}`}
    >
      <header className="mb-6 flex items-center gap-3">
        {!isHome && (
          <Link
            to="/"
            className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-white text-lg shadow-soft transition active:scale-90"
            aria-label="Accueil"
          >
            ◀
          </Link>
        )}
        <Link to="/" className="flex-1">
          <p className="text-sm font-semibold text-ink-soft">Bonjour {me?.name} 👋</p>
          <h1 className="text-2xl font-extrabold">Notre maison</h1>
        </Link>
        <button
          onClick={() => setSearching(true)}
          className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-white text-lg shadow-soft transition active:scale-90"
          aria-label="Rechercher"
        >
          🔍
        </button>
        <NavLink
          to="/profil"
          className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-rose text-lg font-extrabold shadow-soft"
          aria-label="Profil"
        >
          {me?.name.charAt(0).toUpperCase()}
        </NavLink>
      </header>

      {searching && (
        <Modal title="Rechercher" onClose={() => setSearching(false)}>
          <GlobalSearch onClose={() => setSearching(false)} />
        </Modal>
      )}

      <OfflineBanner />
      <Outlet />

      {showNavBar && (
        <nav className={`fixed inset-x-0 bottom-0 z-40 pb-[calc(0.75rem+env(safe-area-inset-bottom))] ${tabs.length > 7 ? "px-2" : "px-4"}`}>
          <div className={`mx-auto flex max-w-md justify-around rounded-3xl bg-white shadow-soft ${tabs.length > 7 ? "p-1" : "p-2"}`}>
            {tabs.map((t) => (
              <NavLink
                key={t.to}
                to={t.to}
                className={({ isActive }) =>
                  `flex min-w-0 flex-1 flex-col items-center rounded-2xl py-2 text-xs font-bold transition ${isActive ? t.active : "text-ink-soft"}`
                }
              >
                <span className="text-xl">{t.icon}</span>
                {/* au-delà de 7 onglets, libellés plus petits pour tenir sur la largeur de l'iPhone */}
                <span className={`max-w-full truncate ${tabs.length > 7 ? "text-[10px]" : ""}`}>{t.label}</span>
              </NavLink>
            ))}
          </div>
        </nav>
      )}
    </div>
  );
}

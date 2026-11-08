import { PasswordForm } from "../components/PasswordForm";
import { useLogout, useMe } from "../lib/auth";

// Compte créé (ou réinitialisé) par l'administrateur : rien d'autre n'est accessible avant d'avoir choisi son mot de passe
export function FirstLogin() {
  const { data: me } = useMe();
  const logout = useLogout();
  return (
    <div className="flex min-h-screen items-center justify-center bg-gradient-to-br from-lavender-soft via-cream to-rose-soft px-4">
      <div className="w-full max-w-sm space-y-4">
        <div className="text-center">
          <img src="/icon.svg" alt="" className="mx-auto mb-3 h-16 w-16" />
          <h1 className="text-2xl font-extrabold">Bienvenue {me?.name} 👋</h1>
          <p className="text-sm text-ink-soft">Choisis ton mot de passe : celui que tu as reçu est provisoire.</p>
        </div>
        <PasswordForm />
        <button className="btn-ghost w-full" onClick={() => logout.mutate()}>
          Se déconnecter
        </button>
      </div>
    </div>
  );
}

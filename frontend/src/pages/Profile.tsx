import { useState, type FormEvent } from "react";
import { useMutation } from "@tanstack/react-query";
import { api } from "../lib/api";
import { useLogout, useMe, useUpdatePreferences } from "../lib/auth";
import { tabs } from "../lib/tabs";

export function Profile() {
  const { data: me } = useMe();
  const logout = useLogout();
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const change = useMutation({
    mutationFn: () => api("/auth/password", { method: "POST", json: { current, next } }),
    onSuccess: () => {
      setCurrent("");
      setNext("");
    },
  });

  const submit = (e: FormEvent) => {
    e.preventDefault();
    change.mutate();
  };

  return (
    <section className="space-y-6">
      <div className="rounded-3xl bg-rose-soft p-6">
        <p className="text-lg font-extrabold">{me?.name}</p>
        <p className="text-sm text-ink-soft">{me?.email}</p>
      </div>

      <MenuSettings />

      <form onSubmit={submit} className="space-y-3 rounded-3xl bg-white p-6 shadow-soft">
        <h2 className="font-extrabold">Changer mon mot de passe</h2>
        <input
          className="input"
          type="password"
          placeholder="Mot de passe actuel"
          autoComplete="current-password"
          value={current}
          onChange={(e) => setCurrent(e.target.value)}
          required
        />
        <input
          className="input"
          type="password"
          placeholder="Nouveau mot de passe (6 caractères min.)"
          autoComplete="new-password"
          minLength={6}
          value={next}
          onChange={(e) => setNext(e.target.value)}
          required
        />
        {change.error && <p className="text-sm font-semibold text-rose-deep">{change.error.message}</p>}
        {change.isSuccess && <p className="text-sm font-semibold text-mint-deep">Mot de passe modifié ✓</p>}
        <button className="btn-primary w-full" disabled={change.isPending}>
          Enregistrer
        </button>
      </form>

      <button className="btn-ghost w-full text-rose-deep" onClick={() => logout.mutate()}>
        Se déconnecter
      </button>
    </section>
  );
}

function MenuSettings() {
  const { data: me } = useMe();
  const save = useUpdatePreferences();
  const hidden = me?.hiddenTabs ?? [];
  const showNavBar = me?.showNavBar ?? true;

  const toggle = (to: string) =>
    save.mutate({ hiddenTabs: hidden.includes(to) ? hidden.filter((t) => t !== to) : [...hidden, to] });

  return (
    <div className="space-y-3 rounded-3xl bg-white p-6 shadow-soft">
      <h2 className="font-extrabold">Menu</h2>
      <label className="flex items-center justify-between gap-3 rounded-2xl bg-cream px-3 py-3 font-bold">
        <span>
          Barre de menu en bas
          <span className="block text-xs font-semibold text-ink-soft">Sinon, on passe par l'accueil</span>
        </span>
        <input
          type="checkbox"
          role="switch"
          className="peer sr-only"
          checked={showNavBar}
          onChange={() => save.mutate({ showNavBar: !showNavBar })}
        />
        <span
          aria-hidden
          className="relative h-7 w-12 shrink-0 rounded-full bg-ink-soft/30 transition peer-checked:bg-lavender-deep peer-focus-visible:ring-2 peer-focus-visible:ring-lavender after:absolute after:left-1 after:top-1 after:h-5 after:w-5 after:rounded-full after:bg-white after:shadow after:transition peer-checked:after:translate-x-5"
        />
      </label>

      <p className="pt-2 text-sm font-bold text-ink-soft">Pages affichées (accueil et barre de menu)</p>
      <div className="space-y-2">
        {tabs.map((t) => {
          const shown = !hidden.includes(t.to);
          // au moins une page doit rester visible
          const last = shown && tabs.every((o) => o.to === t.to || hidden.includes(o.to));
          return (
            <label key={t.to} className={`flex items-center gap-3 rounded-2xl px-3 py-2 font-bold ${shown ? t.active : "bg-cream text-ink-soft"}`}>
              <input
                type="checkbox"
                className="h-5 w-5 accent-lavender-deep"
                checked={shown}
                disabled={last}
                onChange={() => toggle(t.to)}
              />
              <span className="text-xl">{t.icon}</span>
              {t.label}
            </label>
          );
        })}
      </div>
      {save.error && <p className="text-sm font-semibold text-rose-deep">{save.error.message}</p>}
    </div>
  );
}

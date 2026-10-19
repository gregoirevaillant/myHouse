import { useState, type FormEvent } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { api, type User } from "../lib/api";
import { useLogout, useMe } from "../lib/auth";
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

      <TabsSettings />

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

function TabsSettings() {
  const qc = useQueryClient();
  const { data: me } = useMe();
  const hidden = me?.hiddenTabs ?? [];
  const save = useMutation({
    mutationFn: (hiddenTabs: string[]) => api<User>("/auth/tabs", { method: "PUT", json: { hiddenTabs } }),
    onMutate: (hiddenTabs) => {
      if (me) qc.setQueryData<User>(["me"], { ...me, hiddenTabs });
    },
    onSuccess: (user) => qc.setQueryData(["me"], user),
    onError: () => qc.invalidateQueries({ queryKey: ["me"] }),
  });

  const toggle = (to: string) => save.mutate(hidden.includes(to) ? hidden.filter((t) => t !== to) : [...hidden, to]);

  return (
    <div className="space-y-3 rounded-3xl bg-white p-6 shadow-soft">
      <h2 className="font-extrabold">Pages du menu</h2>
      <div className="space-y-2">
        {tabs.map((t) => {
          const shown = !hidden.includes(t.to);
          // au moins une page doit rester dans le menu
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

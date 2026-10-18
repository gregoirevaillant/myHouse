import { useState, type FormEvent } from "react";
import { useMutation } from "@tanstack/react-query";
import { api } from "../lib/api";
import { useLogout, useMe } from "../lib/auth";

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

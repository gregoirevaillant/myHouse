import { useState, type FormEvent } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "../lib/api";

// Utilisé dans Réglages et à la première connexion d'un compte créé par l'administrateur
export function PasswordForm() {
  const qc = useQueryClient();
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const change = useMutation({
    mutationFn: () => api("/auth/password", { method: "POST", json: { current, next } }),
    onSuccess: () => {
      setCurrent("");
      setNext("");
      // le serveur a levé l'obligation de changer le mot de passe : on recharge la session
      qc.invalidateQueries({ queryKey: ["me"] });
    },
  });

  const submit = (e: FormEvent) => {
    e.preventDefault();
    change.mutate();
  };

  return (
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
        placeholder="Nouveau mot de passe (10 caractères min.)"
        autoComplete="new-password"
        minLength={10}
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
  );
}

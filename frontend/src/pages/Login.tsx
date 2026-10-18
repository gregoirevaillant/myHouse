import { useState, type FormEvent } from "react";
import { useLogin } from "../lib/auth";

export function Login() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const login = useLogin();

  const submit = (e: FormEvent) => {
    e.preventDefault();
    login.mutate({ email, password });
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-gradient-to-br from-lavender-soft via-cream to-rose-soft px-4">
      <form onSubmit={submit} className="w-full max-w-sm rounded-3xl bg-white/80 p-8 shadow-soft backdrop-blur">
        <div className="mb-6 text-center">
          <img src="/icon.svg" alt="" className="mx-auto mb-3 h-16 w-16" />
          <h1 className="text-2xl font-extrabold">Notre maison</h1>
          <p className="text-sm text-ink-soft">Connecte-toi pour continuer</p>
        </div>
        <label className="label" htmlFor="email">Email</label>
        <input
          id="email"
          className="input mb-4"
          type="email"
          autoComplete="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          required
        />
        <label className="label" htmlFor="password">Mot de passe</label>
        <input
          id="password"
          className="input mb-5"
          type="password"
          autoComplete="current-password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          required
        />
        {login.error && <p className="mb-4 text-center text-sm font-semibold text-rose-deep">{login.error.message}</p>}
        <button className="btn-primary w-full" disabled={login.isPending}>
          {login.isPending ? "Connexion…" : "Se connecter"}
        </button>
      </form>
    </div>
  );
}

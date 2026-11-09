import { useState, type FormEvent } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Navigate } from "react-router-dom";
import { api, type AdminHousehold } from "../lib/api";
import { useMe } from "../lib/auth";
import { PRIVATE_PAGES, tabs } from "../lib/tabs";

// mot de passe provisoire lisible (sans caractères qui se confondent), tiré du générateur sécurisé du navigateur
const ALPHABET = "abcdefghjkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789";
const randomPassword = () =>
  Array.from(crypto.getRandomValues(new Uint8Array(14)), (b) => ALPHABET[b % ALPHABET.length]).join("");

const MODULES = tabs.filter((t) => !PRIVATE_PAGES.includes(t.to)).map((t) => ({ id: t.to.slice(1), label: `${t.icon} ${t.label}` }));

function useAdminMutation<T>(fn: (v: T) => Promise<unknown>) {
  const qc = useQueryClient();
  return useMutation({ mutationFn: fn, onSuccess: () => qc.invalidateQueries({ queryKey: ["admin"] }) });
}

function PagesPicker({ value, onChange }: { value: string[]; onChange: (v: string[]) => void }) {
  return (
    <div className="flex flex-wrap gap-2">
      {MODULES.map((m) => {
        const on = value.includes(m.id);
        return (
          <label key={m.id} className={`cursor-pointer rounded-full px-3 py-1.5 text-sm font-bold shadow-soft ${on ? "bg-mint" : "bg-cream text-ink/50"}`}>
            <input type="checkbox" className="sr-only" checked={on} onChange={() => onChange(on ? value.filter((v) => v !== m.id) : [...value, m.id])} />
            {m.label}
          </label>
        );
      })}
    </div>
  );
}

function NewFamily() {
  const [name, setName] = useState("");
  const [features, setFeatures] = useState<string[]>([]);
  const create = useAdminMutation(() => api("/admin/households", { method: "POST", json: { name, features } }));
  const submit = (e: FormEvent) => {
    e.preventDefault();
    create.mutate(undefined, { onSuccess: () => { setName(""); setFeatures([]); } });
  };
  return (
    <form onSubmit={submit} className="space-y-3 rounded-3xl bg-white p-6 shadow-soft">
      <h2 className="font-extrabold">Nouvelle famille</h2>
      <input className="input" placeholder="Nom (ex. Papa et Maman)" value={name} onChange={(e) => setName(e.target.value)} required maxLength={100} />
      <p className="text-xs font-bold text-ink-soft">Pages accessibles</p>
      <PagesPicker value={features} onChange={setFeatures} />
      {create.error && <p className="text-sm font-semibold text-rose-deep">{create.error.message}</p>}
      <button className="btn-primary w-full" disabled={create.isPending}>Créer la famille</button>
    </form>
  );
}

function AddMember({ household }: { household: AdminHousehold }) {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState(randomPassword);
  const [created, setCreated] = useState<{ email: string; password: string } | null>(null);
  const add = useAdminMutation(() => api(`/admin/households/${household.id}/users`, { method: "POST", json: { name, email, password } }));
  const submit = (e: FormEvent) => {
    e.preventDefault();
    add.mutate(undefined, {
      onSuccess: () => {
        setCreated({ email, password });
        setName("");
        setEmail("");
        setPassword(randomPassword());
      },
    });
  };
  return (
    <form onSubmit={submit} className="space-y-2 rounded-2xl bg-cream p-3">
      <p className="text-xs font-bold text-ink-soft">Ajouter une personne</p>
      <input className="input" placeholder="Prénom" value={name} onChange={(e) => setName(e.target.value)} required maxLength={100} />
      <input className="input" type="email" placeholder="Email" autoComplete="off" value={email} onChange={(e) => setEmail(e.target.value)} required />
      <input className="input font-mono" aria-label="Mot de passe provisoire" value={password} onChange={(e) => setPassword(e.target.value)} required minLength={10} autoComplete="off" />
      {add.error && <p className="text-sm font-semibold text-rose-deep">{add.error.message}</p>}
      {created && (
        <p className="rounded-xl bg-lemon p-2 text-sm font-bold">
          Compte créé. Transmets-lui : <span className="font-mono">{created.email}</span> / <span className="font-mono">{created.password}</span> (à changer à sa première connexion).
        </p>
      )}
      <button className="btn-ghost w-full" disabled={add.isPending}>Ajouter</button>
    </form>
  );
}

function ResetPassword({ userId }: { userId: string }) {
  const [password, setPassword] = useState<string | null>(null);
  const reset = useAdminMutation((p: string) => api(`/admin/users/${userId}/password`, { method: "POST", json: { password: p } }));
  if (password === null) {
    return (
      <button className="text-xs font-bold text-sky-deep underline" onClick={() => setPassword(randomPassword())}>
        Réinitialiser le mot de passe
      </button>
    );
  }
  return (
    <span className="flex items-center gap-2 text-xs">
      <span className="font-mono font-bold">{password}</span>
      {reset.isSuccess ? (
        <span className="font-bold text-mint-deep">Appliqué : à lui transmettre ✓</span>
      ) : (
        <button className="font-bold text-rose-deep underline" disabled={reset.isPending} onClick={() => reset.mutate(password)}>
          Appliquer
        </button>
      )}
      {reset.error && <span className="font-bold text-rose-deep">{reset.error.message}</span>}
    </span>
  );
}

function Family({ household }: { household: AdminHousehold }) {
  const save = useAdminMutation((features: string[]) => api(`/admin/households/${household.id}`, { method: "PATCH", json: { features } }));
  return (
    <div className="space-y-3 rounded-3xl bg-white p-6 shadow-soft">
      <h2 className="font-extrabold">{household.name}</h2>
      <ul className="space-y-1">
        {household.users.map((u) => (
          <li key={u.id} className="text-sm">
            <p className="font-bold">
              {u.name} <span className="font-normal text-ink-soft">· {u.email}</span>
              {u.isAdmin && <span className="ml-1 rounded-full bg-lavender px-2 py-0.5 text-xs">admin</span>}
              {u.mustChangePassword && <span className="ml-1 rounded-full bg-lemon px-2 py-0.5 text-xs">mot de passe provisoire</span>}
            </p>
            <ResetPassword userId={u.id} />
          </li>
        ))}
      </ul>
      <p className="text-xs font-bold text-ink-soft">Pages accessibles (appliqué tout de suite)</p>
      <PagesPicker value={household.features} onChange={(f) => save.mutate(f)} />
      {save.error && <p className="text-sm font-semibold text-rose-deep">{save.error.message}</p>}
      <AddMember household={household} />
    </div>
  );
}

export function Admin() {
  const { data: me } = useMe();
  const { data: households = [], isLoading, error } = useQuery({
    queryKey: ["admin"],
    queryFn: () => api<AdminHousehold[]>("/admin/households"),
    enabled: !!me?.isAdmin,
  });
  if (!me?.isAdmin) return <Navigate to="/" replace />;
  return (
    <section className="space-y-4">
      <h1 className="text-xl font-extrabold">Familles</h1>
      <p className="text-sm text-ink-soft">Chaque famille a ses propres données, sans aucun lien avec les autres. Tu choisis les pages dont elle dispose.</p>
      {isLoading && <p className="text-sm text-ink-soft">Chargement…</p>}
      {error && <p className="text-sm font-semibold text-rose-deep">{error.message}</p>}
      {households.map((h) => (
        <Family key={h.id} household={h} />
      ))}
      <NewFamily />
    </section>
  );
}

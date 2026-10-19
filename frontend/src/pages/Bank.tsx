import { useEffect, useRef, useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useSearchParams } from "react-router-dom";
import { BudgetTabs } from "../components/BudgetTabs";
import { Modal } from "../components/Modal";
import { api, type BankConnection } from "../lib/api";
import { consentWarning, useBankConnections, useInvalidateBudget } from "../lib/budget";
import { normalize } from "../lib/products";
import { formatEur } from "../lib/money";

type Aspsp = { name: string; logo: string | null };

export function Bank() {
  const [params, setParams] = useSearchParams();
  const [choosing, setChoosing] = useState(false);
  const { data: connections = [], isLoading } = useBankConnections();
  const invalidate = useInvalidateBudget();

  // retour de la banque : ?code&state (ou ?error si la personne a annulé)
  const finish = useMutation({
    mutationFn: (body: { code: string; state: string }) => api<{ errors: string[] }>("/bank/sessions", { method: "POST", json: body }),
    onSuccess: invalidate,
  });
  const handled = useRef(false);
  const code = params.get("code");
  const state = params.get("state");
  const bankError = params.get("error_description") ?? params.get("error");
  useEffect(() => {
    if (!code || !state || handled.current) return;
    // le code n'est utilisable qu'une fois (StrictMode relance les effets en dev)
    handled.current = true;
    finish.mutate({ code, state });
    setParams({}, { replace: true });
  }, [code, state, finish, setParams]);

  const remove = useMutation({
    mutationFn: (id: string) => api(`/bank/connections/${id}`, { method: "DELETE" }),
    onSuccess: invalidate,
  });

  const accounts = connections.flatMap((c) => c.accounts);
  const total = accounts.reduce((s, a) => s + (a.balanceCents ?? 0), 0);

  return (
    <section>
      <div className="mb-4 flex items-center justify-between">
        <h2 className="flex items-center gap-2 text-lg font-extrabold">
          <span className="rounded-xl bg-rose px-2 py-1">📊</span> Budget
        </h2>
        <button className="btn bg-rose px-4 py-2 shadow-soft" onClick={() => setChoosing(true)}>
          + Banque
        </button>
      </div>
      <BudgetTabs />

      {finish.isPending && <p className="mb-4 rounded-2xl bg-lavender-soft px-4 py-3 text-sm font-bold">Import de tes opérations… (ça peut prendre une minute)</p>}
      {finish.error && <p className="mb-4 rounded-2xl bg-rose-soft px-4 py-3 text-sm font-semibold text-rose-deep">{finish.error.message}</p>}
      {finish.data?.errors.length ? (
        <p className="mb-4 rounded-2xl bg-rose-soft px-4 py-3 text-sm font-semibold text-rose-deep">{finish.data.errors.join(" · ")}</p>
      ) : null}
      {finish.isSuccess && !finish.data.errors.length && (
        <p className="mb-4 rounded-2xl bg-mint-soft px-4 py-3 text-sm font-bold">Banque connectée ✓ Tes opérations sont importées.</p>
      )}
      {bankError && !code && (
        <p className="mb-4 rounded-2xl bg-rose-soft px-4 py-3 text-sm font-semibold text-rose-deep">Connexion annulée : {bankError}</p>
      )}

      {isLoading ? (
        <p className="text-center text-ink-soft">Chargement…</p>
      ) : connections.length === 0 ? (
        <div className="rounded-3xl bg-rose-soft p-8 text-center">
          <p className="text-3xl">🏦</p>
          <p className="mt-2 font-extrabold">Aucune banque connectée</p>
          <p className="mt-1 text-sm font-semibold text-ink-soft">
            L'accès se fait en lecture seule, via la DSP2 (Enable Banking). Tu t'identifies directement sur le site de ta banque.
          </p>
          <button className="btn-primary mt-4" onClick={() => setChoosing(true)}>
            Connecter une banque
          </button>
        </div>
      ) : (
        <>
          <div className="mb-4 rounded-3xl bg-white p-5 shadow-soft">
            <p className="text-sm font-bold text-ink-soft">Patrimoine visible</p>
            <p className="text-4xl font-extrabold">{formatEur(total)}</p>
            <p className="mt-1 text-xs font-semibold text-ink-soft">
              Comptes et livrets accessibles par la banque ; PEA et assurance-vie n'y figurent en général pas.
            </p>
          </div>
          <div className="space-y-4">
            {connections.map((c) => (
              <ConnectionCard
                key={c.id}
                connection={c}
                onReconnect={() => setChoosing(true)}
                onRemove={() => remove.mutate(c.id)}
                removing={remove.isPending}
              />
            ))}
          </div>
        </>
      )}

      {choosing && (
        <Modal title="Choisir ta banque" onClose={() => setChoosing(false)}>
          <AspspList />
        </Modal>
      )}
    </section>
  );
}

function ConnectionCard({
  connection: c,
  onReconnect,
  onRemove,
  removing,
}: {
  connection: BankConnection;
  onReconnect: () => void;
  onRemove: () => void;
  removing: boolean;
}) {
  const [confirming, setConfirming] = useState(false);
  const warning = consentWarning(c.validUntil);
  return (
    <div className="rounded-3xl bg-rose-soft p-4">
      <div className="mb-3 flex items-center justify-between px-1">
        <p className="font-extrabold">🏦 {c.aspspName}</p>
        <p className="text-xs font-semibold text-ink-soft">accès jusqu'au {new Date(c.validUntil).toLocaleDateString("fr-FR")}</p>
      </div>
      {warning && (
        <button onClick={onReconnect} className="mb-3 w-full rounded-2xl bg-peach px-4 py-2 text-left text-sm font-bold">
          ⚠️ {warning}
        </button>
      )}
      <ul className="space-y-2">
        {c.accounts.map((a) => (
          <li key={a.id} className="flex items-center justify-between gap-3 rounded-2xl bg-white px-4 py-3 shadow-soft">
            <span className="min-w-0">
              <span className="block truncate font-bold">
                {a.isSavings ? "🐷" : "💳"} {a.name}
              </span>
              <span className="block text-xs font-semibold text-ink-soft">
                {a.iban}
                {a.lastSyncAt && ` · synchro ${new Date(a.lastSyncAt).toLocaleString("fr-FR", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}`}
              </span>
            </span>
            <span className="shrink-0 font-extrabold tabular-nums">{a.balanceCents !== null ? formatEur(a.balanceCents) : "—"}</span>
          </li>
        ))}
      </ul>
      <div className="mt-3 flex justify-end">
        {confirming ? (
          <span className="flex items-center gap-2 text-sm font-bold">
            Supprimer la connexion et son historique ?
            <button className="rounded-xl bg-rose-deep px-3 py-1 text-white" onClick={onRemove} disabled={removing}>
              Oui
            </button>
            <button className="rounded-xl bg-white px-3 py-1" onClick={() => setConfirming(false)}>
              Non
            </button>
          </span>
        ) : (
          <button className="text-sm font-bold text-rose-deep" onClick={() => setConfirming(true)}>
            Déconnecter
          </button>
        )}
      </div>
    </div>
  );
}

function AspspList() {
  const [search, setSearch] = useState("");
  const { data: aspsps = [], isLoading, error } = useQuery({
    queryKey: ["aspsps"],
    queryFn: () => api<Aspsp[]>("/bank/aspsps"),
    staleTime: Infinity,
  });
  const connect = useMutation({
    mutationFn: (aspspName: string) => api<{ url: string }>("/bank/connect", { method: "POST", json: { aspspName } }),
    // on part sur le site de la banque, qui renverra vers /budget/banque
    onSuccess: ({ url }) => window.location.assign(url),
  });

  const query = normalize(search);
  const list = aspsps.filter((a) => normalize(a.name).includes(query));

  if (error) return <p className="text-sm font-semibold text-rose-deep">{error.message}</p>;

  return (
    <div>
      <input
        className="input mb-3 focus:border-rose-deep"
        placeholder="Rechercher (BNP, Crédit Agricole…)"
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        autoFocus
      />
      {connect.error && <p className="mb-3 text-sm font-semibold text-rose-deep">{connect.error.message}</p>}
      {isLoading ? (
        <p className="text-center text-ink-soft">Chargement…</p>
      ) : (
        <ul className="max-h-[50vh] space-y-2 overflow-y-auto">
          {list.map((a) => (
            <li key={a.name}>
              <button
                className="flex w-full items-center gap-3 rounded-2xl bg-white px-4 py-3 text-left font-bold shadow-soft transition active:scale-[0.98] disabled:opacity-50"
                disabled={connect.isPending}
                onClick={() => connect.mutate(a.name)}
              >
                {a.logo ? <img src={a.logo} alt="" className="h-8 w-8 rounded-lg object-contain" /> : <span className="text-2xl">🏦</span>}
                {a.name}
              </button>
            </li>
          ))}
          {list.length === 0 && <li className="text-center text-sm text-ink-soft">Aucune banque trouvée</li>}
        </ul>
      )}
    </div>
  );
}

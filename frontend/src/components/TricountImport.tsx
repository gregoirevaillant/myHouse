import { useState, type ChangeEvent } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import { api, type ExpenseTracker } from "../lib/api";
import { computeDebt, EMOJIS } from "../lib/expenses";
import { useMembers } from "../lib/members";
import { formatEur } from "../lib/money";
import { guessMember, readTricountFile, toExpenses, tricountPeople, type TricountEntry } from "../lib/tricount";
import { monthKey, shortDate } from "../lib/dates";

type Loaded = { entries: TricountEntry[]; currency: string | null; files: string[] };

export function TricountImport() {
  const qc = useQueryClient();
  const navigate = useNavigate();
  const { data: members = [] } = useMembers();
  const [loaded, setLoaded] = useState<Loaded | null>(null);
  const [readError, setReadError] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [emoji, setEmoji] = useState("✈️");
  const [mapping, setMapping] = useState<Record<string, string | null>>({});
  // un ancien tricount est en général fini : rangé directement dans les carnets terminés
  const [finished, setFinished] = useState(true);

  // plusieurs fichiers possibles (dépenses + remboursements exportés séparément)
  const pick = async (e: ChangeEvent<HTMLInputElement>) => {
    const files = [...(e.target.files ?? [])];
    e.target.value = "";
    if (!files.length) return;
    setReadError(null);
    try {
      const read = await Promise.all(files.map(readTricountFile));
      const entries = read.flatMap((f) => f.entries);
      if (!entries.length) throw new Error("Aucune dépense trouvée dans ce fichier");
      setLoaded({ entries, currency: read.find((f) => f.currency)?.currency ?? null, files: files.map((f) => f.name) });
      const title = read[0].name.replace(/[_-]+/g, " ").trim();
      setName(title.charAt(0).toUpperCase() + title.slice(1));
      setMapping(Object.fromEntries(tricountPeople(entries).map((p) => [p, guessMember(p, members)])));
    } catch (err) {
      setReadError(err instanceof Error && err.message ? err.message : "Fichier illisible");
    }
  };

  const people = Object.keys(mapping);
  const { expenses, skipped } = loaded ? toExpenses(loaded.entries, mapping) : { expenses: [], skipped: 0 };
  const spent = expenses.filter((e) => !e.isReimbursement).reduce((s, e) => s + e.amountCents, 0);
  const debt = computeDebt(
    expenses.map((e) => ({ ...e, id: "", trackerId: "" })),
    members,
  );
  const dates = expenses.map((e) => e.date).sort();
  const [first, last] = [dates[0], dates[dates.length - 1]];

  const save = useMutation({
    mutationFn: () => api<ExpenseTracker>("/expense-trackers/import", { method: "POST", json: { name: name.trim(), emoji, expenses, finishedAt: finished ? last : null } }),
    onSuccess: (t) => {
      qc.invalidateQueries({ queryKey: ["expense-trackers"] });
      qc.invalidateQueries({ queryKey: ["expenses"] });
      // terminé : ouvert sur son bilan ; sinon sur le mois de sa dernière dépense
      navigate(`/depenses/${t.id}`, finished ? undefined : { state: { month: monthKey(last) } });
    },
  });

  if (!loaded) {
    return (
      <div className="space-y-4">
        <ol className="list-decimal space-y-1.5 pl-5 text-sm font-semibold text-ink-soft">
          <li>
            Ouvre{" "}
            <a href="https://tricount-exporter.pages.dev/fr/" target="_blank" rel="noreferrer" className="font-bold text-sky-deep underline">
              Tricount Exporter
            </a>{" "}
            et colle le lien de partage de ton tricount.
          </li>
          <li>
            Touche <b>Exporter</b>, puis <b>Classeur Excel (.xlsx)</b>, sans décocher de colonne ni de personne.
          </li>
          <li>Choisis ici le fichier téléchargé (dossier Téléchargements de l'app Fichiers).</li>
        </ol>
        <label className="btn w-full cursor-pointer bg-sky-deep text-white shadow-soft">
          📄 Choisir le fichier
          <input type="file" accept=".xlsx,.json,.csv" multiple className="hidden" onChange={pick} />
        </label>
        <p className="text-center text-xs font-semibold text-ink-soft">Les exports JSON ou CSV marchent aussi : choisis alors Dépenses et Remboursements ensemble.</p>
        {readError && <p className="text-center text-sm font-semibold text-rose-deep">{readError}</p>}
      </div>
    );
  }

  const unmapped = people.every((p) => !mapping[p]);

  return (
    <div className="space-y-5">
      <div>
        <label className="label" htmlFor="tc-name">Nom du carnet</label>
        <input id="tc-name" className="input focus:border-sky" maxLength={100} value={name} onChange={(e) => setName(e.target.value)} />
        <div className="mt-2 flex flex-wrap gap-2">
          {EMOJIS.map((em) => (
            <button
              type="button"
              key={em}
              onClick={() => setEmoji(em)}
              className={`h-10 w-10 rounded-2xl text-lg shadow-soft transition ${emoji === em ? "bg-sky" : "bg-white"}`}
            >
              {em}
            </button>
          ))}
        </div>
      </div>

      <div>
        <span className="label">Qui est qui ?</span>
        <ul className="space-y-2">
          {people.map((p) => (
            <li key={p} className="rounded-2xl bg-white p-3 shadow-soft">
              <p className="mb-2 truncate font-extrabold">{p}</p>
              <div className="grid grid-cols-3 gap-1 rounded-xl bg-cream p-1">
                {[...members.map((m) => [m.id, m.name] as const), [null, "Autre"] as const].map(([id, label]) => (
                  <button
                    key={id ?? "none"}
                    type="button"
                    onClick={() => setMapping({ ...mapping, [p]: id })}
                    className={`truncate rounded-lg px-2 py-1.5 text-xs font-bold transition ${mapping[p] === id ? "bg-sky-deep text-white" : "text-ink-soft"}`}
                  >
                    {label}
                  </button>
                ))}
              </div>
            </li>
          ))}
        </ul>
        {people.some((p) => !mapping[p]) && (
          <p className="mt-2 text-xs font-semibold text-ink-soft">
            Les parts des autres personnes ne sont pas reprises : seul ce qui se passe entre vous deux est importé.
          </p>
        )}
      </div>

      <div className="space-y-1 rounded-3xl bg-sky-soft p-4 text-sm font-semibold">
        <p className="mb-1 font-extrabold">Aperçu</p>
        <p>
          {expenses.length} ligne{expenses.length > 1 ? "s" : ""} à importer
          {first && ` · du ${shortDate(first)} ${first.slice(0, 4)} au ${shortDate(last)} ${last.slice(0, 4)}`}
        </p>
        <p>Dépenses : {formatEur(spent)}</p>
        <p className="font-extrabold">{debt ? `${debt.from.name} doit ${formatEur(debt.cents)} à ${debt.to.name}` : "À l'équilibre"}</p>
        {skipped > 0 && (
          <p className="text-ink-soft">
            {skipped} ligne{skipped > 1 ? "s" : ""} sans effet entre vous deux, laissée{skipped > 1 ? "s" : ""} de côté
          </p>
        )}
        {loaded.currency && loaded.currency !== "EUR" && (
          <p className="text-rose-deep">Ce tricount est en {loaded.currency} : les montants seront repris tels quels, comme des euros.</p>
        )}
        <p className="pt-1 text-xs text-ink-soft">Compare le solde avec celui de Tricount avant d'importer (un centime d'écart est possible sur les partages inégaux).</p>
      </div>

      <label className="flex items-center gap-3 rounded-2xl bg-white p-4 font-bold shadow-soft">
        <input type="checkbox" className="h-5 w-5 accent-sky-deep" checked={finished} onChange={(e) => setFinished(e.target.checked)} />
        <span>
          Ce tricount est terminé
          <span className="block text-xs font-semibold text-ink-soft">Rangé dans les carnets terminés, ouvert sur son bilan</span>
        </span>
      </label>

      {save.error && <p className="text-center text-sm font-semibold text-rose-deep">{save.error.message}</p>}
      <div className="flex gap-2">
        <button type="button" className="btn-ghost" onClick={() => setLoaded(null)}>
          Autre fichier
        </button>
        <button
          type="button"
          className="btn flex-1 bg-sky-deep text-white shadow-soft"
          disabled={!name.trim() || !expenses.length || unmapped || save.isPending}
          onClick={() => save.mutate()}
        >
          {save.isPending ? "Import…" : "Importer"}
        </button>
      </div>
    </div>
  );
}

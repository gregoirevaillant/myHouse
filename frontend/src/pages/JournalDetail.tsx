import { useEffect, useRef, useState, type FormEvent } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link, useNavigate, useParams } from "react-router-dom";
import { Modal } from "../components/Modal";
import { api, type Journal, type JournalEntry } from "../lib/api";
import { fromIso, toIso } from "../lib/dates";

const longDate = (iso: string) =>
  fromIso(iso).toLocaleDateString("fr-FR", { weekday: "long", day: "numeric", month: "long", year: "numeric" });

export function JournalDetail() {
  const { id } = useParams<{ id: string }>();
  const today = toIso(new Date());
  const [pick, setPick] = useState(today);
  // jours ouverts dans cette visite : ils restent affichés même si leur texte est vidé
  const [opened, setOpened] = useState<string[]>([today]);
  const [focusDate, setFocusDate] = useState<string>();
  const [editing, setEditing] = useState(false);
  const { data: journal, isLoading, error } = useQuery({
    queryKey: ["journal", id],
    queryFn: () => api<Journal>(`/journals/${id}`),
  });

  if (isLoading) return <p className="text-center text-ink-soft">Chargement…</p>;
  if (!journal) return <p className="text-center text-ink-soft">{error?.message ?? "Introuvable"}</p>;

  const dates = [...new Set([...journal.entries.map((e) => e.date), ...opened])].sort().reverse();
  const text = (date: string) => journal.entries.find((e) => e.date === date)?.text ?? "";

  const open = (e: FormEvent) => {
    e.preventDefault();
    if (!pick) return;
    if (!opened.includes(pick)) setOpened([...opened, pick]);
    setFocusDate(pick);
  };

  return (
    <section>
      <div className="mb-4 flex items-center justify-between gap-2">
        <Link to="/journal" className="btn-ghost shrink-0 px-4 py-2" aria-label="Retour aux journaux">
          ◀
        </Link>
        <h2 className="flex-1 truncate text-lg font-extrabold">📔 {journal.title}</h2>
        <button className="btn-ghost shrink-0 px-4 py-2" onClick={() => setEditing(true)} aria-label="Modifier le journal">
          ✏️
        </button>
      </div>

      <form onSubmit={open} className="mb-5 flex gap-2 rounded-2xl bg-white p-2 shadow-soft">
        <input
          type="date"
          className="min-w-0 flex-1 rounded-xl bg-lemon-soft px-3 py-2 font-semibold outline-none"
          value={pick}
          onChange={(e) => setPick(e.target.value)}
          required
        />
        <button className="btn shrink-0 bg-lemon px-4 py-2">Écrire ce jour</button>
      </form>

      <div className="space-y-3">
        {dates.map((date) => (
          <EntryCard
            key={date}
            journalId={journal.id}
            date={date}
            isToday={date === today}
            serverText={text(date)}
            autoFocus={date === focusDate}
            onEdit={() => !opened.includes(date) && setOpened((o) => [...o, date])}
          />
        ))}
      </div>

      {editing && (
        <Modal title="Modifier le journal" onClose={() => setEditing(false)}>
          <JournalSettings journal={journal} onDone={() => setEditing(false)} />
        </Modal>
      )}
    </section>
  );
}

function EntryCard({
  journalId,
  date,
  isToday,
  serverText,
  autoFocus,
  onEdit,
}: {
  journalId: string;
  date: string;
  isToday: boolean;
  serverText: string;
  autoFocus: boolean;
  onEdit: () => void;
}) {
  const qc = useQueryClient();
  const [value, setValue] = useState(serverText);
  const [status, setStatus] = useState<"idle" | "saving" | "saved" | "error">("idle");
  const focused = useRef(false);
  const timer = useRef<number>(undefined);
  const ref = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    if (!focused.current && timer.current === undefined) setValue(serverText);
  }, [serverText]);

  useEffect(() => {
    if (!autoFocus) return;
    ref.current?.focus();
    ref.current?.scrollIntoView({ behavior: "smooth", block: "center" });
  }, [autoFocus]);

  const save = async (text: string) => {
    timer.current = undefined;
    setStatus("saving");
    try {
      const saved = await api<JournalEntry>(`/journals/${journalId}/entries`, { method: "PUT", json: { date, text } });
      qc.setQueryData<Journal>(["journal", journalId], (j) =>
        j && {
          ...j,
          entries: [...j.entries.filter((e) => e.date !== date), ...(saved.text ? [saved] : [])],
        },
      );
      qc.invalidateQueries({ queryKey: ["journals"] });
      setStatus("saved");
    } catch {
      setStatus("error");
    }
  };

  const onChange = (text: string) => {
    setValue(text);
    onEdit();
    window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => save(text), 800);
  };

  return (
    <label className={`block rounded-3xl p-4 ${serverText || value ? "bg-white shadow-soft" : "bg-lemon-soft"} ${isToday ? "ring-2 ring-lemon-deep/40" : ""}`}>
      <span className="mb-2 flex items-center justify-between text-sm font-extrabold capitalize">
        <span>
          {longDate(date)}
          {isToday && <span className="ml-2 rounded-full bg-lemon px-2 py-0.5 text-xs normal-case">aujourd'hui</span>}
        </span>
        <span className="text-xs font-semibold text-ink-soft">
          {status === "saving" && "…"}
          {status === "saved" && "✓"}
          {status === "error" && <span className="text-rose-deep">erreur</span>}
        </span>
      </span>
      <textarea
        ref={ref}
        rows={3}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onFocus={() => (focused.current = true)}
        onBlur={() => (focused.current = false)}
        placeholder="Qu'est-ce qui s'est passé ce jour-là ?"
        className="w-full resize-none bg-transparent leading-relaxed outline-none [field-sizing:content] placeholder:text-ink-soft/60"
      />
    </label>
  );
}

function JournalSettings({ journal, onDone }: { journal: Journal; onDone: () => void }) {
  const qc = useQueryClient();
  const navigate = useNavigate();
  const [title, setTitle] = useState(journal.title);
  const rename = useMutation({
    mutationFn: () => api(`/journals/${journal.id}`, { method: "PATCH", json: { title } }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["journal", journal.id] });
      qc.invalidateQueries({ queryKey: ["journals"] });
      onDone();
    },
  });
  const remove = useMutation({
    mutationFn: () => api(`/journals/${journal.id}`, { method: "DELETE" }),
    onSuccess: () => {
      qc.removeQueries({ queryKey: ["journal", journal.id] });
      qc.invalidateQueries({ queryKey: ["journals"] });
      navigate("/journal", { replace: true });
    },
  });

  const submit = (e: FormEvent) => {
    e.preventDefault();
    rename.mutate();
  };

  return (
    <div className="space-y-6">
      <form onSubmit={submit} className="space-y-3">
        <label className="label" htmlFor="journal-title">
          Titre
        </label>
        <input
          id="journal-title"
          className="input focus:border-lemon-deep"
          maxLength={100}
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          required
        />
        {rename.error && <p className="text-sm font-semibold text-rose-deep">{rename.error.message}</p>}
        <button className="btn-primary w-full" disabled={rename.isPending}>
          Enregistrer
        </button>
      </form>
      <button
        className="btn-ghost w-full text-rose-deep"
        disabled={remove.isPending}
        onClick={() => confirm(`Supprimer « ${journal.title} » et tous ses textes ?`) && remove.mutate()}
      >
        Supprimer le journal
      </button>
    </div>
  );
}

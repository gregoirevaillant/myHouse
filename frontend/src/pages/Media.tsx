import { useState, type FormEvent } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Modal } from "../components/Modal";
import { Stars } from "../components/Stars";
import { api, type MediaHit, type MediaInput, type MediaItem, type MediaKind, type MediaStatus } from "../lib/api";
import { toIso } from "../lib/dates";
import { hitImage, KIND_IDS, KINDS, mediaImage, STATUS_IDS, statusLabel, useMedia } from "../lib/media";

type Draft = Partial<MediaInput> & { kind: MediaKind; imageUrl?: string | null }; // imageUrl : affiche du résultat de recherche, pour l'aperçu
type Opened = { item?: MediaItem; draft?: Draft } | { adding: true; kind?: MediaKind } | null;

export function Media() {
  const { data: items = [], isLoading } = useMedia();
  const [kind, setKind] = useState<MediaKind | "ALL">("ALL");
  const [status, setStatus] = useState<MediaStatus>("WISHLIST");
  const [opened, setOpened] = useState<Opened>(null);
  const [view, setView] = useState<"DASH" | "LIST">("DASH");
  const ofKind = items.filter((i) => kind === "ALL" || i.kind === kind);
  const shown = ofKind.filter((i) => i.status === status);
  const count = (s: MediaStatus) => ofKind.filter((i) => i.status === s).length;
  const pill = (on: boolean) => `whitespace-nowrap rounded-full px-3 py-1.5 text-sm font-bold shadow-soft transition active:scale-95 ${on ? "bg-lavender" : "bg-white text-ink-soft"}`;

  return (
    <section>
      <div className="mb-4 flex items-center justify-between">
        <h2 className="flex items-center gap-2 text-lg font-extrabold">
          <span className="rounded-xl bg-lavender px-2 py-1">🎬</span> Médias
        </h2>
        <button className="btn bg-lavender px-4 py-2 shadow-soft" onClick={() => setOpened({ adding: true })}>
          + Ajouter
        </button>
      </div>

      <div className="mb-4 flex gap-1.5">
        <button className={`flex-1 ${pill(view === "DASH")}`} onClick={() => setView("DASH")}>
          📊 Résumé
        </button>
        <button className={`flex-1 ${pill(view === "LIST")}`} onClick={() => setView("LIST")}>
          🗂️ Listes
        </button>
      </div>

      {view === "DASH" && !isLoading && (
        <Dashboard
          items={items}
          onOpen={(item) => setOpened({ item })}
          onAdd={(k) => setOpened({ adding: true, kind: k })}
          onList={(k, s) => {
            setKind(k);
            if (s) setStatus(s);
            setView("LIST");
          }}
        />
      )}

      {view === "LIST" && <div className="-mx-4 mb-3 flex gap-1.5 overflow-x-auto px-4 pb-1">
        <button className={pill(kind === "ALL")} onClick={() => setKind("ALL")}>
          Tout
        </button>
        {KIND_IDS.map((k) => (
          <button key={k} className={pill(kind === k)} onClick={() => setKind(k)}>
            {KINDS[k].icon} {KINDS[k].plural}
          </button>
        ))}
      </div>}
      {view === "LIST" && <div className="mb-4 flex gap-1.5">
        {STATUS_IDS.map((s) => (
          <button key={s} className={`flex-1 ${pill(status === s)}`} onClick={() => setStatus(s)}>
            {kind === "ALL" || kind === "MOVIE" ? statusLabel("MOVIE", s) : statusLabel(kind, s)} · {count(s)}
          </button>
        ))}
      </div>}

      {isLoading ? (
        <p className="text-center text-ink-soft">Chargement…</p>
      ) : view === "DASH" ? null : shown.length === 0 ? (
        <div className="rounded-3xl bg-lavender-soft p-8 text-center text-ink-soft">
          <p className="text-3xl">🍿</p>
          <p className="mt-2 font-semibold">{items.length === 0 ? "Films, séries, jeux, livres… ajoute ce que tu veux suivre" : "Rien dans cette liste"}</p>
        </div>
      ) : (
        <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3">
          {shown.map((m) => (
            <li key={m.id}>
              <button className="block w-full overflow-hidden rounded-2xl bg-white text-left shadow-soft transition active:scale-95" onClick={() => setOpened({ item: m })}>
                <div className="flex aspect-[2/3] items-center justify-center bg-lavender-soft text-5xl">
                  {m.hasImage ? <img src={mediaImage(m)} alt="" loading="lazy" className="h-full w-full object-cover" /> : KINDS[m.kind].icon}
                </div>
                <div className="p-2.5">
                  <p className="line-clamp-2 font-extrabold leading-tight">{m.title}</p>
                  <p className="text-xs font-semibold text-ink-soft">
                    {KINDS[m.kind].icon} {m.year ?? KINDS[m.kind].label}
                    {m.status === "IN_PROGRESS" && m.progress ? ` · ${m.progress}` : ""}
                    {m.private ? " · 🔒" : ""}
                  </p>
                  <Stars value={m.rating} />
                </div>
              </button>
            </li>
          ))}
        </ul>
      )}

      {opened && "adding" in opened && (
        <Modal title="Ajouter" onClose={() => setOpened(null)}>
          <AddPicker initialKind={opened.kind} onPick={(draft) => setOpened({ draft })} />
        </Modal>
      )}
      {opened && !("adding" in opened) && (
        <Modal title={opened.item ? opened.item.title : "Nouvelle fiche"} onClose={() => setOpened(null)}>
          <MediaForm item={opened.item} draft={opened.draft} onDone={() => setOpened(null)} />
        </Modal>
      )}
    </section>
  );
}

function Poster({ m, onOpen }: { m: MediaItem; onOpen: (m: MediaItem) => void }) {
  return (
    <button className="w-24 shrink-0 text-left transition active:scale-95" onClick={() => onOpen(m)}>
      <span className="flex aspect-[2/3] items-center justify-center overflow-hidden rounded-xl bg-lavender-soft text-3xl shadow-soft">
        {m.hasImage ? <img src={mediaImage(m)} alt="" loading="lazy" className="h-full w-full object-cover" /> : KINDS[m.kind].icon}
      </span>
      <span className="mt-1 line-clamp-2 block text-xs font-extrabold leading-tight">{m.title}</span>
      <span className="block truncate text-[11px] font-semibold text-ink-soft">{m.status === "IN_PROGRESS" && m.progress ? m.progress : (m.year ?? "")}</span>
      <Stars value={m.rating} />
    </button>
  );
}

function Shelf({ title, items, onOpen, onAll }: { title: string; items: MediaItem[]; onOpen: (m: MediaItem) => void; onAll?: () => void }) {
  if (!items.length) return null;
  return (
    <div className="mb-5">
      <div className="mb-2 flex items-baseline justify-between">
        <h3 className="font-extrabold">{title}</h3>
        {onAll && (
          <button className="text-sm font-bold text-ink-soft" onClick={onAll}>
            Tout voir
          </button>
        )}
      </div>
      <div className="-mx-4 flex gap-3 overflow-x-auto px-4 pb-1">
        {items.map((m) => (
          <Poster key={m.id} m={m} onOpen={onOpen} />
        ))}
      </div>
    </div>
  );
}

// résumé : chiffres clés, par type, puis ce qui est en cours, à venir et terminé récemment
function Dashboard({ items, onOpen, onAdd, onList }: { items: MediaItem[]; onOpen: (m: MediaItem) => void; onAdd: (k: MediaKind) => void; onList: (k: MediaKind | "ALL", s?: MediaStatus) => void }) {
  if (items.length === 0) {
    return (
      <div className="rounded-3xl bg-lavender-soft p-6 text-center">
        <p className="text-3xl">🍿</p>
        <p className="mt-2 font-semibold text-ink-soft">Rien de suivi pour l'instant. Qu'est-ce que tu ajoutes en premier ?</p>
        <div className="mt-4 grid grid-cols-2 gap-2">
          {KIND_IDS.map((k) => (
            <button key={k} className="rounded-2xl bg-white px-3 py-3 font-extrabold shadow-soft transition active:scale-95" onClick={() => onAdd(k)}>
              {KINDS[k].icon} {KINDS[k].label}
            </button>
          ))}
        </div>
      </div>
    );
  }
  const year = String(new Date().getFullYear());
  const doing = items.filter((i) => i.status === "IN_PROGRESS");
  const done = items.filter((i) => i.status === "DONE").sort((a, b) => (b.doneAt ?? "").localeCompare(a.doneAt ?? ""));
  const doneThisYear = done.filter((i) => i.doneAt?.startsWith(year)).length;
  const rated = items.filter((i) => i.rating);
  const average = rated.length ? rated.reduce((n, i) => n + (i.rating ?? 0), 0) / rated.length : null;
  const next = items.filter((i) => i.status === "WISHLIST").slice(0, 10); // déjà du plus récent au plus ancien
  const stat = (label: string, value: string, on?: () => void) => (
    <button className="rounded-2xl bg-white px-3 py-2.5 text-left shadow-soft transition active:scale-95" onClick={on} disabled={!on}>
      <span className="block text-2xl font-extrabold leading-none">{value}</span>
      <span className="text-xs font-bold text-ink-soft">{label}</span>
    </button>
  );

  return (
    <div>
      <div className="mb-5 grid grid-cols-2 gap-2 rounded-3xl bg-lavender-soft p-3 sm:grid-cols-4">
        {stat("en cours", String(doing.length), () => onList("ALL", "IN_PROGRESS"))}
        {stat("à voir, jouer, lire", String(items.length - doing.length - done.length), () => onList("ALL", "WISHLIST"))}
        {stat(`terminés en ${year}`, String(doneThisYear), () => onList("ALL", "DONE"))}
        {stat("note moyenne", average ? `${average.toFixed(1).replace(".", ",")} ★` : "—")}
      </div>

      <Shelf title="▶️ En cours" items={doing} onOpen={onOpen} onAll={() => onList("ALL", "IN_PROGRESS")} />
      <Shelf title="⏭️ À voir ensuite" items={next} onOpen={onOpen} onAll={() => onList("ALL", "WISHLIST")} />
      <Shelf title="✅ Terminés récemment" items={done.slice(0, 10)} onOpen={onOpen} onAll={() => onList("ALL", "DONE")} />

      <h3 className="mb-2 font-extrabold">Par type</h3>
      <ul className="grid grid-cols-2 gap-2">
        {KIND_IDS.map((k) => {
          const of = items.filter((i) => i.kind === k);
          const n = (s: MediaStatus) => of.filter((i) => i.status === s).length;
          return (
            <li key={k}>
              <button className="w-full rounded-2xl bg-white p-3 text-left shadow-soft transition active:scale-95" onClick={() => onList(k, n("IN_PROGRESS") ? "IN_PROGRESS" : n("WISHLIST") ? "WISHLIST" : "DONE")}>
                <span className="block font-extrabold">
                  {KINDS[k].icon} {KINDS[k].plural} <span className="text-ink-soft">{of.length}</span>
                </span>
                <span className="text-xs font-semibold text-ink-soft">
                  {n("WISHLIST")} {KINDS[k].wish.toLowerCase()} · {n("IN_PROGRESS")} en cours · {n("DONE")} {KINDS[k].done.toLowerCase()}
                </span>
              </button>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

// choix du type, puis recherche dans la base ouverte (ou saisie à la main)
function AddPicker({ initialKind, onPick }: { initialKind?: MediaKind; onPick: (draft: Draft) => void }) {
  const [kind, setKind] = useState<MediaKind>(initialKind ?? "MOVIE");
  const [text, setText] = useState("");
  const [term, setTerm] = useState("");
  const info = KINDS[kind];
  const search = useQuery({
    queryKey: ["media-search", kind, term],
    queryFn: () => api<MediaHit[]>(`/media/search?kind=${kind}&q=${encodeURIComponent(term)}`),
    enabled: info.searchable && term.length >= 2,
    staleTime: 5 * 60_000,
  });
  const submit = (e: FormEvent) => {
    e.preventDefault();
    setTerm(text.trim());
  };
  const pill = (on: boolean) => `rounded-full px-3 py-1.5 text-sm font-bold shadow-soft transition active:scale-95 ${on ? "bg-lavender" : "bg-white text-ink-soft"}`;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-1.5">
        {KIND_IDS.map((k) => (
          <button key={k} className={pill(kind === k)} onClick={() => setKind(k)}>
            {KINDS[k].icon} {KINDS[k].label}
          </button>
        ))}
      </div>
      {info.searchable ? (
        <form onSubmit={submit} className="flex gap-2">
          <input className="input flex-1 focus:border-lavender" placeholder={`Rechercher un ${info.label.toLowerCase()}…`} aria-label="Rechercher" value={text} onChange={(e) => setText(e.target.value)} autoFocus />
          <button className="btn bg-lavender px-4" disabled={text.trim().length < 2}>
            OK
          </button>
        </form>
      ) : null}
      {search.isFetching && <p className="text-center text-ink-soft">Recherche…</p>}
      {search.error && <p className="text-sm font-bold text-rose-deep">{search.error.message}</p>}
      {search.data?.length === 0 && <p className="text-center font-semibold text-ink-soft">Aucun résultat</p>}
      <ul className="space-y-2">
        {search.data?.map((h) => (
          <li key={h.source + h.sourceId}>
            <button
              className="flex w-full items-center gap-3 rounded-2xl bg-white p-2 text-left shadow-soft transition active:scale-95"
              onClick={() => onPick({ kind, title: h.title, year: h.year, creator: h.creator, source: h.source, sourceId: h.sourceId, imageUrl: h.imageUrl })}
            >
              <span className="flex h-20 w-14 shrink-0 items-center justify-center overflow-hidden rounded-xl bg-lavender-soft text-2xl">
                {h.imageUrl ? <img src={hitImage(h.imageUrl)} alt="" loading="lazy" className="h-full w-full object-cover" /> : info.icon}
              </span>
              <span className="min-w-0">
                <span className="font-extrabold">{h.title}</span> <span className="text-sm font-semibold text-ink-soft">{h.year}</span>
                {h.subtitle && <span className="line-clamp-2 text-xs font-semibold text-ink-soft">{h.subtitle}</span>}
              </span>
            </button>
          </li>
        ))}
      </ul>
      <button className="btn-ghost w-full" onClick={() => onPick({ kind })}>
        ✏️ Saisir à la main
      </button>
      <p className="text-center text-xs font-semibold text-ink-soft">
        Données : {info.source}
        {info.source === "TMDB" && " — ce produit utilise l'API TMDB mais n'est ni approuvé ni certifié par TMDB"}
      </p>
    </div>
  );
}

function MediaForm({ item, draft, onDone }: { item?: MediaItem; draft?: Draft; onDone: () => void }) {
  const qc = useQueryClient();
  const kind = item?.kind ?? draft?.kind ?? "MOVIE";
  const info = KINDS[kind];
  const [title, setTitle] = useState(item?.title ?? draft?.title ?? "");
  const [year, setYear] = useState(String(item?.year ?? draft?.year ?? ""));
  const [creator, setCreator] = useState(item?.creator ?? draft?.creator ?? "");
  const [status, setStatus] = useState<MediaStatus>(item?.status ?? "WISHLIST");
  const [progress, setProgress] = useState(item?.progress ?? "");
  const [rating, setRating] = useState<number | null>(item?.rating ?? null);
  const [doneAt, setDoneAt] = useState(item?.doneAt ?? "");
  const [note, setNote] = useState(item?.note ?? "");
  const [isPrivate, setIsPrivate] = useState(item?.private ?? true);
  const [confirmDelete, setConfirmDelete] = useState(false);

  const done = () => {
    qc.invalidateQueries({ queryKey: ["media"] });
    onDone();
  };
  const save = useMutation({
    mutationFn: () => {
      const body: MediaInput = {
        kind,
        title,
        year: Number(year) || null,
        creator: creator.trim() || null,
        overview: item?.overview ?? null,
        status,
        progress: status === "IN_PROGRESS" ? progress.trim() || null : null,
        rating,
        doneAt: status === "DONE" ? doneAt || toIso(new Date()) : null,
        note: note.trim() || null,
        source: item?.source ?? draft?.source ?? null,
        sourceId: item?.sourceId ?? draft?.sourceId ?? null,
        private: isPrivate,
      };
      return api<MediaItem>(item ? `/media/${item.id}` : "/media", { method: item ? "PATCH" : "POST", json: body });
    },
    onSuccess: done,
  });
  const remove = useMutation({ mutationFn: () => api(`/media/${item!.id}`, { method: "DELETE" }), onSuccess: done });
  const submit = (e: FormEvent) => {
    e.preventDefault();
    save.mutate();
  };
  const pill = (on: boolean) => `flex-1 rounded-full px-3 py-1.5 text-sm font-bold shadow-soft transition active:scale-95 ${on ? "bg-lavender" : "bg-white text-ink-soft"}`;

  return (
    <form onSubmit={submit} className="space-y-4">
      {(item?.hasImage || draft?.imageUrl) && (
        <img src={item?.hasImage ? mediaImage(item) : hitImage(draft!.imageUrl!)} alt={title} className="mx-auto max-h-72 rounded-2xl object-contain shadow-soft" />
      )}
      {item?.overview && <p className="max-h-40 overflow-y-auto rounded-2xl bg-white p-3 text-sm font-semibold text-ink-soft shadow-soft">{item.overview}</p>}
      <div className="flex gap-1.5">
        {STATUS_IDS.map((s) => (
          <button key={s} type="button" className={pill(status === s)} onClick={() => setStatus(s)}>
            {statusLabel(kind, s)}
          </button>
        ))}
      </div>
      {status === "IN_PROGRESS" && (
        <div>
          <label className="label" htmlFor="media-progress">Avancement</label>
          <input id="media-progress" className="input focus:border-lavender" placeholder={kind === "BOOK" ? "p. 120" : kind === "GAME" ? "Chapitre 3, 40 %…" : "S2 E5"} value={progress} onChange={(e) => setProgress(e.target.value)} />
        </div>
      )}
      {status === "DONE" && (
        <div className="space-y-3">
          <div>
            <span className="label">Ma note</span>
            <Stars value={rating} onChange={setRating} />
          </div>
          <div>
            <label className="label" htmlFor="media-done">Terminé le</label>
            <input id="media-done" type="date" className="input focus:border-lavender" value={doneAt || toIso(new Date())} onChange={(e) => setDoneAt(e.target.value)} />
          </div>
        </div>
      )}

      <div>
        <label className="label" htmlFor="media-title">Titre</label>
        <input id="media-title" className="input focus:border-lavender" value={title} onChange={(e) => setTitle(e.target.value)} required />
      </div>
      <div className="grid grid-cols-3 gap-3">
        <div>
          <label className="label" htmlFor="media-year">Année</label>
          <input id="media-year" className="input focus:border-lavender" inputMode="numeric" value={year} onChange={(e) => setYear(e.target.value.replace(/\D/g, "").slice(0, 4))} />
        </div>
        <div className="col-span-2">
          <label className="label" htmlFor="media-creator">{info.creator}</label>
          <input id="media-creator" className="input focus:border-lavender" value={creator} onChange={(e) => setCreator(e.target.value)} />
        </div>
      </div>
      <div>
        <label className="label" htmlFor="media-note">Note (facultatif)</label>
        <textarea id="media-note" className="input focus:border-lavender" rows={2} value={note} onChange={(e) => setNote(e.target.value)} />
      </div>
      <label className="flex items-center gap-3 rounded-2xl bg-white px-4 py-3 font-bold shadow-soft">
        <input type="checkbox" className="h-5 w-5 accent-rose-deep" checked={!isPrivate} onChange={(e) => setIsPrivate(!e.target.checked)} />
        <span>
          🏠 Pour la maison
          <span className="block text-xs font-semibold text-ink-soft">{isPrivate ? "🔒 Rien que pour moi tant que tu ne coches pas" : "Visible par tout le foyer"}</span>
        </span>
      </label>

      {save.error && <p className="text-sm font-bold text-rose-deep">{save.error.message}</p>}
      <button className="btn-primary w-full" disabled={save.isPending || !title.trim()}>
        {item ? "Enregistrer" : "Ajouter"}
      </button>
      {item && (
        <div className="text-center">
          {confirmDelete ? (
            <div className="flex justify-center gap-2">
              <button type="button" className="btn-ghost" onClick={() => setConfirmDelete(false)}>
                Annuler
              </button>
              <button type="button" className="btn bg-rose-deep text-white" onClick={() => remove.mutate()} disabled={remove.isPending}>
                Supprimer
              </button>
            </div>
          ) : (
            <button type="button" className="text-sm font-bold text-ink-soft" onClick={() => setConfirmDelete(true)}>
              Supprimer la fiche
            </button>
          )}
        </div>
      )}
    </form>
  );
}

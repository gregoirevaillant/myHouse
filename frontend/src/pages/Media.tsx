import { useState, type FormEvent } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Modal } from "../components/Modal";
import { Stars } from "../components/Stars";
import { api, type MediaHit, type MediaInput, type MediaItem, type MediaKind, type MediaStatus } from "../lib/api";
import { toIso } from "../lib/dates";
import { hitImage, KIND_IDS, KINDS, mediaImage, STATUS_IDS, statusLabel, useMedia } from "../lib/media";

type Draft = Partial<MediaInput> & { kind: MediaKind; imageUrl?: string | null }; // imageUrl : affiche du résultat de recherche, pour l'aperçu
type Opened = { item?: MediaItem; draft?: Draft } | { adding: true } | null;

export function Media() {
  const { data: items = [], isLoading } = useMedia();
  const [kind, setKind] = useState<MediaKind | "ALL">("ALL");
  const [status, setStatus] = useState<MediaStatus>("WISHLIST");
  const [opened, setOpened] = useState<Opened>(null);
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

      <div className="-mx-4 mb-3 flex gap-1.5 overflow-x-auto px-4 pb-1">
        <button className={pill(kind === "ALL")} onClick={() => setKind("ALL")}>
          Tout
        </button>
        {KIND_IDS.map((k) => (
          <button key={k} className={pill(kind === k)} onClick={() => setKind(k)}>
            {KINDS[k].icon} {KINDS[k].plural}
          </button>
        ))}
      </div>
      <div className="mb-4 flex gap-1.5">
        {STATUS_IDS.map((s) => (
          <button key={s} className={`flex-1 ${pill(status === s)}`} onClick={() => setStatus(s)}>
            {kind === "ALL" || kind === "MOVIE" ? statusLabel("MOVIE", s) : statusLabel(kind, s)} · {count(s)}
          </button>
        ))}
      </div>

      {isLoading ? (
        <p className="text-center text-ink-soft">Chargement…</p>
      ) : shown.length === 0 ? (
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
          <AddPicker onPick={(draft) => setOpened({ draft })} />
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

// choix du type, puis recherche dans la base ouverte (ou saisie à la main)
function AddPicker({ onPick }: { onPick: (draft: Draft) => void }) {
  const [kind, setKind] = useState<MediaKind>("MOVIE");
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

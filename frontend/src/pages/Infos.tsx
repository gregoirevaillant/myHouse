import { useState, type FormEvent } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Modal } from "../components/Modal";
import { api, type HouseInfo, type HouseInfoInput, type InfoCategory } from "../lib/api";
import { infosQuery } from "../lib/offline";
import { normalize } from "../lib/products";

const CATEGORIES: { id: InfoCategory; label: string; emoji: string; placeholder: string; valuePlaceholder: string }[] = [
  { id: "CODE", label: "Codes", emoji: "🔑", placeholder: "Digicode, boîte aux lettres…", valuePlaceholder: "4B27A" },
  { id: "WIFI", label: "Wi-Fi", emoji: "📶", placeholder: "Box de l'appart…", valuePlaceholder: "Mot de passe" },
  { id: "CONTACT", label: "Contacts", emoji: "📞", placeholder: "Gardien, plombier, propriétaire…", valuePlaceholder: "06 12 34 56 78" },
  { id: "MAISON", label: "Maison", emoji: "🏠", placeholder: "Poubelles, compteur, cave…", valuePlaceholder: "Mardi et vendredi soir" },
  { id: "AUTRE", label: "Autre", emoji: "📌", placeholder: "Une info à garder sous la main", valuePlaceholder: "…" },
];
const categoryInfo = (id: InfoCategory) => CATEGORIES.find((c) => c.id === id) ?? CATEGORIES[CATEGORIES.length - 1];

// un numéro de téléphone : on propose de l'appeler
const isPhone = (v: string) => /^\+?[\d\s.()-]{8,20}$/.test(v) && v.replace(/\D/g, "").length >= 8;

type Opened = { id?: string } | null;

export function Infos() {
  const { data: infos = [], isLoading } = useQuery(infosQuery);
  const [search, setSearch] = useState("");
  const [opened, setOpened] = useState<Opened>(null);

  const q = normalize(search);
  const filtered = infos.filter((i) => !q || normalize(`${i.label} ${i.value} ${i.note ?? ""}`).includes(q));
  const groups = CATEGORIES.map((c) => ({ ...c, items: filtered.filter((i) => i.category === c.id) })).filter((g) => g.items.length);
  const openedInfo = opened?.id ? infos.find((i) => i.id === opened.id) : undefined;

  return (
    <section>
      <div className="mb-4 flex items-center justify-between">
        <h2 className="flex items-center gap-2 text-lg font-extrabold">
          <span className="rounded-xl bg-lavender px-2 py-1">🔑</span> Infos utiles
        </h2>
        <button className="btn bg-lavender px-4 py-2 shadow-soft" onClick={() => setOpened({})}>
          + Ajouter
        </button>
      </div>

      {infos.length > 0 && (
        <input className="input mb-4 focus:border-lavender" placeholder="Rechercher…" value={search} onChange={(e) => setSearch(e.target.value)} />
      )}

      {isLoading ? (
        <p className="text-center text-ink-soft">Chargement…</p>
      ) : groups.length === 0 ? (
        <div className="rounded-3xl bg-lavender-soft p-8 text-center text-ink-soft">
          <p className="text-3xl">🔑</p>
          <p className="mt-2 font-semibold">{infos.length ? "Aucune info trouvée" : "Digicode, Wi-Fi, numéro du gardien, jour des poubelles… tout au même endroit, même hors ligne"}</p>
        </div>
      ) : (
        <div className="space-y-4">
          {groups.map((g) => (
            <div key={g.id} className="rounded-3xl bg-lavender-soft p-3">
              <p className="mb-2 flex items-center gap-2 px-1 font-extrabold">
                <span className="text-xl">{g.emoji}</span> {g.label}
              </p>
              <ul className="space-y-1.5">
                {g.items.map((i) => (
                  <InfoRow key={i.id} info={i} onEdit={() => setOpened({ id: i.id })} />
                ))}
              </ul>
            </div>
          ))}
        </div>
      )}

      {opened && (
        <Modal title={openedInfo ? "Modifier l'info" : "Nouvelle info"} onClose={() => setOpened(null)}>
          <InfoForm info={openedInfo} onDone={() => setOpened(null)} />
        </Modal>
      )}
    </section>
  );
}

function InfoRow({ info, onEdit }: { info: HouseInfo; onEdit: () => void }) {
  const [copied, setCopied] = useState(false);
  const mono = info.category === "CODE" || info.category === "WIFI";

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(info.value);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      // presse-papiers refusé : tant pis
    }
  };

  return (
    <li className="flex items-center gap-2 rounded-2xl bg-white px-4 py-2.5 shadow-soft">
      <button onClick={onEdit} className="min-w-0 flex-1 text-left">
        <span className="block truncate text-xs font-bold text-ink-soft">
          {info.private && "🔒 "}
          {info.label}
        </span>
        <span className={`block whitespace-pre-line break-words text-lg font-extrabold leading-snug ${mono ? "font-mono tracking-wide" : ""}`}>{info.value}</span>
        {info.note && <span className="mt-0.5 block whitespace-pre-line text-xs font-semibold text-ink-soft">{info.note}</span>}
      </button>
      {isPhone(info.value) && (
        <a href={`tel:${info.value.replace(/[^\d+]/g, "")}`} className="shrink-0 rounded-full bg-mint px-3 py-2 text-sm shadow-soft" aria-label={`Appeler ${info.label}`}>
          📞
        </a>
      )}
      <button onClick={copy} className="shrink-0 rounded-full bg-lavender px-3 py-2 text-sm font-bold shadow-soft" aria-label={`Copier ${info.label}`}>
        {copied ? "✓" : "📋"}
      </button>
    </li>
  );
}

function InfoForm({ info, onDone }: { info?: HouseInfo; onDone: () => void }) {
  const qc = useQueryClient();
  const [category, setCategory] = useState<InfoCategory>(info?.category ?? "CODE");
  const [label, setLabel] = useState(info?.label ?? "");
  const [value, setValue] = useState(info?.value ?? "");
  const [note, setNote] = useState(info?.note ?? "");
  const [isPrivate, setIsPrivate] = useState(info?.private ?? false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const cat = categoryInfo(category);

  const save = useMutation({
    mutationFn: () => {
      const body: HouseInfoInput = { category, label, value, note: note.trim() || null, private: isPrivate };
      return api<HouseInfo>(info ? `/infos/${info.id}` : "/infos", { method: info ? "PATCH" : "POST", json: body });
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["infos"] });
      onDone();
    },
  });

  const remove = useMutation({
    mutationFn: () => api(`/infos/${info!.id}`, { method: "DELETE" }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["infos"] });
      onDone();
    },
  });

  const submit = (e: FormEvent) => {
    e.preventDefault();
    save.mutate();
  };

  return (
    <form onSubmit={submit} className="space-y-4">
      <div className="flex flex-wrap gap-1.5">
        {CATEGORIES.map((c) => (
          <button
            key={c.id}
            type="button"
            onClick={() => setCategory(c.id)}
            className={`rounded-full px-3 py-1.5 text-sm font-bold shadow-soft transition active:scale-95 ${category === c.id ? "bg-lavender" : "bg-white text-ink-soft"}`}
          >
            {c.emoji} {c.label}
          </button>
        ))}
      </div>

      <div>
        <label className="label" htmlFor="info-label">Nom</label>
        <input id="info-label" className="input focus:border-lavender" placeholder={cat.placeholder} value={label} onChange={(e) => setLabel(e.target.value)} required />
      </div>

      <div>
        <label className="label" htmlFor="info-value">{category === "CONTACT" ? "Numéro" : category === "WIFI" ? "Mot de passe" : "Valeur"}</label>
        {category === "MAISON" || category === "AUTRE" ? (
          <textarea id="info-value" className="input focus:border-lavender" rows={3} placeholder={cat.valuePlaceholder} value={value} onChange={(e) => setValue(e.target.value)} required />
        ) : (
          <input
            id="info-value"
            className={`input focus:border-lavender ${category !== "CONTACT" ? "font-mono" : ""}`}
            inputMode={category === "CONTACT" ? "tel" : undefined}
            autoCapitalize="off"
            autoCorrect="off"
            spellCheck={false}
            placeholder={cat.valuePlaceholder}
            value={value}
            onChange={(e) => setValue(e.target.value)}
            required
          />
        )}
      </div>

      <div>
        <label className="label" htmlFor="info-note">Note (facultatif)</label>
        <textarea
          id="info-note"
          className="input focus:border-lavender"
          rows={2}
          placeholder={category === "WIFI" ? "Nom du réseau : Livebox-1234" : "Bâtiment B, 3e étage…"}
          value={note}
          onChange={(e) => setNote(e.target.value)}
        />
      </div>

      <label className="flex items-center gap-3 rounded-2xl bg-white px-4 py-3 font-bold shadow-soft">
        <input type="checkbox" className="h-5 w-5 accent-lavender-deep" checked={isPrivate} onChange={(e) => setIsPrivate(e.target.checked)} />
        <span>
          🔒 Rien que pour moi
          <span className="block text-xs font-semibold text-ink-soft">L'autre ne la verra pas</span>
        </span>
      </label>

      {save.error && <p className="text-sm font-bold text-rose-deep">{save.error.message}</p>}
      <button className="btn-primary w-full" disabled={save.isPending}>
        {info ? "Enregistrer" : "Ajouter"}
      </button>

      {info && (
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
              Supprimer l'info
            </button>
          )}
        </div>
      )}
    </form>
  );
}

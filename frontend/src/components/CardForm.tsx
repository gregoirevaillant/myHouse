import { useState, type FormEvent } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { api, type CardType, type LoyaltyCard } from "../lib/api";
import { CARD_COLORS } from "../lib/colors";
import { decodeQrFromFile } from "../lib/qr";
import { BARCODE_FORMATS, Barcode, QrCode } from "./Codes";

const TYPES: { value: CardType; label: string; icon: string }[] = [
  { value: "BARCODE", label: "Code-barres", icon: "▮▯▮" },
  { value: "QR", label: "QR code", icon: "▦" },
  { value: "NUMBER", label: "Numéro", icon: "#" },
];

export function CardForm({ card, onDone }: { card?: LoyaltyCard; onDone: (card: LoyaltyCard) => void }) {
  const qc = useQueryClient();
  const [name, setName] = useState(card?.name ?? "");
  const [type, setType] = useState<CardType>(card?.type ?? "BARCODE");
  const [value, setValue] = useState(card?.value ?? "");
  const [format, setFormat] = useState(card?.barcodeFormat ?? "CODE128");
  const [description, setDescription] = useState(card?.description ?? "");
  const [color, setColor] = useState(card?.color ?? CARD_COLORS[0]);
  const [image, setImage] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [qrInfo, setQrInfo] = useState<string | null>(null);

  const save = useMutation({
    mutationFn: () => {
      const fd = new FormData();
      fd.set("name", name);
      fd.set("type", type);
      fd.set("value", value.trim());
      fd.set("barcodeFormat", type === "BARCODE" ? format : "");
      fd.set("description", description);
      fd.set("color", color);
      if (type === "QR" && image) fd.set("image", image);
      if (card?.hasImage && type !== "QR") fd.set("removeImage", "true");
      return api<LoyaltyCard>(card ? `/cards/${card.id}` : "/cards", { method: card ? "PATCH" : "POST", body: fd });
    },
    onSuccess: (saved) => {
      qc.invalidateQueries({ queryKey: ["cards"] });
      qc.setQueryData(["cards", saved.id], saved);
      onDone(saved);
    },
  });

  const onPhoto = async (file: File | undefined) => {
    if (!file) return;
    setImage(file);
    setPreview(URL.createObjectURL(file));
    setQrInfo("Lecture du QR code…");
    const decoded = await decodeQrFromFile(file);
    if (decoded) {
      setValue(decoded);
      setQrInfo("QR code reconnu ✓ — il sera affiché bien net.");
    } else {
      setQrInfo("QR code non reconnu : la photo sera affichée telle quelle.");
    }
  };

  const submit = (e: FormEvent) => {
    e.preventDefault();
    save.mutate();
  };

  const canSave =
    name.trim() && (type === "QR" ? value.trim() || image || card?.hasImage : value.trim());

  return (
    <form onSubmit={submit} className="space-y-4">
      <div>
        <label className="label" htmlFor="card-name">Enseigne</label>
        <input id="card-name" className="input" placeholder="Carrefour, Sephora…" value={name} onChange={(e) => setName(e.target.value)} required />
      </div>

      <div>
        <span className="label">Type</span>
        <div className="grid grid-cols-3 gap-2">
          {TYPES.map((t) => (
            <button
              type="button"
              key={t.value}
              onClick={() => setType(t.value)}
              className={`rounded-2xl px-2 py-3 text-sm font-bold shadow-soft transition ${type === t.value ? "bg-lavender" : "bg-white"}`}
            >
              <span className="block font-mono text-lg">{t.icon}</span>
              {t.label}
            </button>
          ))}
        </div>
      </div>

      {type === "BARCODE" && (
        <>
          <div>
            <label className="label" htmlFor="card-code">Code</label>
            <input id="card-code" className="input font-mono" inputMode="numeric" value={value} onChange={(e) => setValue(e.target.value)} />
          </div>
          <div>
            <label className="label" htmlFor="card-format">Format</label>
            <select id="card-format" className="input" value={format} onChange={(e) => setFormat(e.target.value)}>
              {BARCODE_FORMATS.map((f) => (
                <option key={f.value} value={f.value}>{f.label}</option>
              ))}
            </select>
          </div>
          {value.trim() && (
            <div className="rounded-2xl bg-white p-3">
              <Barcode value={value.trim()} format={format} />
            </div>
          )}
        </>
      )}

      {type === "QR" && (
        <div className="space-y-3">
          <label className="btn-ghost w-full cursor-pointer">
            📷 {image || card?.hasImage ? "Changer la photo" : "Prendre / choisir une photo"}
            <input type="file" accept="image/*" capture="environment" className="hidden" onChange={(e) => onPhoto(e.target.files?.[0])} />
          </label>
          {qrInfo && <p className="text-center text-sm font-semibold text-ink-soft">{qrInfo}</p>}
          {value.trim() ? (
            <div className="rounded-2xl bg-white p-3"><QrCode value={value.trim()} /></div>
          ) : preview ? (
            <img src={preview} alt="" className="mx-auto max-h-56 rounded-2xl" />
          ) : card?.hasImage ? (
            <img src={`/api/cards/${card.id}/image`} alt="" className="mx-auto max-h-56 rounded-2xl" />
          ) : null}
          <details className="text-sm">
            <summary className="cursor-pointer font-bold text-ink-soft">Ou saisir le contenu du QR code</summary>
            <input className="input mt-2 font-mono" value={value} onChange={(e) => setValue(e.target.value)} />
          </details>
        </div>
      )}

      {type === "NUMBER" && (
        <div>
          <label className="label" htmlFor="card-number">Numéro de carte</label>
          <input id="card-number" className="input font-mono text-lg" inputMode="numeric" value={value} onChange={(e) => setValue(e.target.value)} />
        </div>
      )}

      <div>
        <label className="label" htmlFor="card-desc">Infos (facultatif)</label>
        <textarea
          id="card-desc"
          className="input min-h-20"
          placeholder="Titulaire, code PIN, avantages…"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
        />
      </div>

      <div>
        <span className="label">Couleur</span>
        <div className="flex flex-wrap gap-2">
          {CARD_COLORS.map((c) => (
            <button
              type="button"
              key={c}
              onClick={() => setColor(c)}
              style={{ backgroundColor: c }}
              className={`h-9 w-9 rounded-full shadow-soft transition ${color === c ? "scale-110 ring-2 ring-ink/40 ring-offset-2" : ""}`}
              aria-label={`Couleur ${c}`}
            />
          ))}
        </div>
      </div>

      {save.error && <p className="text-center text-sm font-semibold text-rose-deep">{save.error.message}</p>}
      <button className="btn-primary w-full" disabled={!canSave || save.isPending}>
        {save.isPending ? "Enregistrement…" : card ? "Enregistrer" : "Ajouter la carte"}
      </button>
    </form>
  );
}

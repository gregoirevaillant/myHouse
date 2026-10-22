import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link, useNavigate, useParams } from "react-router-dom";
import { CardForm } from "../components/CardForm";
import { Barcode, QrCode } from "../components/Codes";
import { Modal } from "../components/Modal";
import { cardsQuery } from "../lib/offline";
import { OfflineBanner } from "../components/OfflineBanner";
import { api } from "../lib/api";
import { useWakeLock } from "../lib/screen";

export function CardDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const [editing, setEditing] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [copied, setCopied] = useState(false);
  // la carte vient de la liste des cartes, gardée sur le téléphone pour le hors-ligne
  const { data: cards, isPending } = useQuery(cardsQuery);
  const card = cards?.find((c) => c.id === id);

  // en caisse : l'écran ne se met pas en veille
  useWakeLock();

  const remove = useMutation({
    mutationFn: () => api(`/cards/${id}`, { method: "DELETE" }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["cards"] });
      navigate("/cartes", { replace: true });
    },
  });

  const copy = async () => {
    if (!card?.value) return;
    await navigator.clipboard.writeText(card.value);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  if (isPending) return <div className="p-8 text-center text-ink-soft">Chargement…</div>;
  if (!card) {
    return (
      <div className="p-8 text-center">
        <p className="mb-4 text-ink-soft">Carte introuvable</p>
        <Link to="/cartes" className="btn-ghost">Retour</Link>
      </div>
    );
  }

  return (
    // fond blanc pur : l'écran paraît plus lumineux et les lecteurs de caisse lisent mieux le code
    <div className="min-h-screen bg-white">
      <header className="rounded-b-3xl px-4 pb-5 pt-[calc(1rem+env(safe-area-inset-top))]" style={{ backgroundColor: card.color }}>
        <div className="mx-auto max-w-lg">
          <div className="mb-3 flex items-center justify-between">
            <Link to="/cartes" className="rounded-full bg-white/70 px-4 py-2 font-bold shadow-soft">← Cartes</Link>
            <button onClick={() => setEditing(true)} className="rounded-full bg-white/70 px-4 py-2 font-bold shadow-soft">
              Modifier
            </button>
          </div>
          <h1 className="text-center text-3xl font-extrabold">{card.name}</h1>
        </div>
      </header>

      <div className="mx-auto max-w-lg px-4 pb-10">
        <OfflineBanner />

        <div className="py-10">
          {card.type === "BARCODE" && card.value && <Barcode value={card.value} format={card.barcodeFormat} large />}
          {card.type === "QR" &&
            (card.value ? (
              <QrCode value={card.value} large />
            ) : card.hasImage ? (
              <img src={`/api/cards/${card.id}/image`} alt="QR code" className="mx-auto max-h-[60vh] w-full object-contain" />
            ) : null)}
          {card.type === "NUMBER" && (
            <p className="break-all text-center font-mono text-5xl font-bold tracking-widest">{card.value}</p>
          )}
          {card.value && card.type !== "QR" && (
            <button onClick={copy} className="mx-auto mt-6 block text-sm font-bold text-lavender-deep">
              {copied ? "Copié ✓" : "Copier le numéro"}
            </button>
          )}
        </div>

        {card.description && (
          <div className="whitespace-pre-wrap rounded-3xl bg-ink/5 p-5 font-semibold">{card.description}</div>
        )}

        <div className="mt-8 text-center">
          {confirmDelete ? (
            <div className="flex justify-center gap-2">
              <button className="btn-ghost" onClick={() => setConfirmDelete(false)}>Annuler</button>
              <button className="btn bg-rose-deep text-white" onClick={() => remove.mutate()} disabled={remove.isPending}>
                Supprimer définitivement
              </button>
            </div>
          ) : (
            <button className="text-sm font-bold text-ink/50" onClick={() => setConfirmDelete(true)}>
              Supprimer la carte
            </button>
          )}
        </div>
      </div>

      {editing && (
        <Modal title="Modifier la carte" onClose={() => setEditing(false)}>
          <CardForm card={card} onDone={() => setEditing(false)} />
        </Modal>
      )}
    </div>
  );
}

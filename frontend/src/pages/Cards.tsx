import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link, useNavigate } from "react-router-dom";
import { CardForm } from "../components/CardForm";
import { Modal } from "../components/Modal";
import { cardsQuery } from "../lib/offline";
import { normalize } from "../lib/products";

const TYPE_LABEL = { BARCODE: "Code-barres", QR: "QR code", NUMBER: "Numéro" };

export function Cards() {
  const [adding, setAdding] = useState(false);
  const [search, setSearch] = useState("");
  const navigate = useNavigate();
  const { data: cards = [], isLoading } = useQuery({
    ...cardsQuery,
  });
  const filtered = cards.filter((c) => normalize(`${c.name} ${c.description ?? ""}`).includes(normalize(search)));

  return (
    <section>
      <div className="mb-4 flex items-center justify-between">
        <h2 className="flex items-center gap-2 text-lg font-extrabold">
          <span className="rounded-xl bg-lavender px-2 py-1">💳</span> Cartes de fidélité
        </h2>
        <button className="btn bg-lavender px-4 py-2 shadow-soft" onClick={() => setAdding(true)}>
          + Ajouter
        </button>
      </div>

      {cards.length > 0 && (
        <input
          className="input mb-4 focus:border-lavender"
          placeholder="Rechercher une carte…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
      )}

      {isLoading ? (
        <p className="text-center text-ink-soft">Chargement…</p>
      ) : cards.length === 0 ? (
        <div className="rounded-3xl bg-lavender-soft p-8 text-center text-ink-soft">
          <p className="text-3xl">💳</p>
          <p className="mt-2 font-semibold">Aucune carte pour l'instant</p>
        </div>
      ) : filtered.length === 0 ? (
        <p className="text-center text-ink-soft">Aucune carte ne correspond à « {search} »</p>
      ) : (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
          {filtered.map((card) => (
            <Link
              key={card.id}
              to={`/cartes/${card.id}`}
              style={{ backgroundColor: card.color }}
              className="theme-light flex aspect-[1.586] flex-col justify-between rounded-3xl p-4 shadow-soft transition active:scale-95"
            >
              <span className="text-xs font-bold text-ink/60">{TYPE_LABEL[card.type]}</span>
              <span className="line-clamp-2 text-lg font-extrabold leading-tight">{card.name}</span>
            </Link>
          ))}
        </div>
      )}

      {adding && (
        <Modal title="Nouvelle carte" onClose={() => setAdding(false)}>
          <CardForm onDone={(card) => navigate(`/cartes/${card.id}`)} />
        </Modal>
      )}
    </section>
  );
}

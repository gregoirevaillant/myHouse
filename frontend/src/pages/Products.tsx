import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { CoursesTabs } from "../components/CoursesTabs";
import { Modal } from "../components/Modal";
import { ProductForm } from "../components/ProductForm";
import { api, type Product } from "../lib/api";
import { normalize, useProducts } from "../lib/products";

export function Products() {
  const qc = useQueryClient();
  const { data: products = [], isLoading } = useProducts();
  const [search, setSearch] = useState("");
  const [editing, setEditing] = useState<{ product?: Product } | null>(null);

  const addToList = useMutation({
    mutationFn: (p: Product) => api("/shopping", { method: "POST", json: { label: p.name, productId: p.id } }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["shopping"] }),
  });

  const filtered = products.filter((p) => normalize(p.name).includes(normalize(search)));

  return (
    <section>
      <h2 className="mb-4 flex items-center gap-2 text-lg font-extrabold">
        <span className="rounded-xl bg-mint px-2 py-1">🛒</span> Courses
      </h2>
      <CoursesTabs />

      <div className="mb-5 flex gap-2">
        <input className="input focus:border-mint" placeholder="Rechercher un produit…" value={search} onChange={(e) => setSearch(e.target.value)} />
        <button className="btn shrink-0 bg-mint px-4 shadow-soft" onClick={() => setEditing({})}>
          + Nouveau
        </button>
      </div>

      {isLoading ? (
        <p className="text-center text-ink-soft">Chargement…</p>
      ) : filtered.length === 0 ? (
        <div className="rounded-3xl bg-mint-soft p-8 text-center text-ink-soft">
          <p className="text-3xl">🧺</p>
          <p className="mt-2 font-semibold">{products.length ? "Aucun produit trouvé" : "Ajoute tes produits habituels avec leur photo"}</p>
        </div>
      ) : (
        <ul className="space-y-2">
          {filtered.map((p) => {
            return (
              <li key={p.id} className="flex items-center gap-2 rounded-2xl bg-white py-1 pl-4 pr-1 shadow-soft">
                <button onClick={() => setEditing({ product: p })} className="flex min-w-0 flex-1 items-center gap-2 py-2 text-left">
                  <span className="truncate font-semibold">{p.name}</span>
                  {p.hasImage && <span className="text-sm" aria-label="avec photo">📷</span>}
                </button>
                <button
                  onClick={() => addToList.mutate(p)}
                  aria-label={`Ajouter ${p.name} à la liste`}
                  className="h-9 w-9 shrink-0 rounded-xl bg-mint font-bold transition active:scale-95"
                >
                  +
                </button>
              </li>
            );
          })}
        </ul>
      )}

      {editing && (
        <Modal title={editing.product ? "Modifier le produit" : "Nouveau produit"} onClose={() => setEditing(null)}>
          <ProductForm product={editing.product} onDone={() => setEditing(null)} />
        </Modal>
      )}
    </section>
  );
}

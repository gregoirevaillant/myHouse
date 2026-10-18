import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { CoursesTabs } from "../components/CoursesTabs";
import { Modal } from "../components/Modal";
import { ProductForm } from "../components/ProductForm";
import { api, type Product, type ShoppingItem } from "../lib/api";
import { normalize, productImage, useProducts } from "../lib/products";

export function Products() {
  const qc = useQueryClient();
  const { data: products = [], isLoading } = useProducts();
  const { data: items = [] } = useQuery({ queryKey: ["shopping"], queryFn: () => api<ShoppingItem[]>("/shopping") });
  const [search, setSearch] = useState("");
  const [editing, setEditing] = useState<{ product?: Product } | null>(null);

  const onList = new Set(items.filter((i) => !i.checked && i.product).map((i) => i.product!.id));

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
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
          {filtered.map((p) => {
            const added = onList.has(p.id);
            return (
              <div key={p.id} className="overflow-hidden rounded-3xl bg-white shadow-soft">
                <button onClick={() => setEditing({ product: p })} className="block w-full text-left">
                  {p.hasImage ? (
                    <img src={productImage(p)} alt="" loading="lazy" className="aspect-square w-full object-cover" />
                  ) : (
                    <div className="flex aspect-square w-full items-center justify-center bg-mint-soft text-4xl">🛍️</div>
                  )}
                  <div className="px-3 pt-2">
                    <p className="truncate font-extrabold">{p.name}</p>
                    <p className="truncate text-xs font-semibold text-ink-soft">{p.note || " "}</p>
                  </div>
                </button>
                <div className="p-2">
                  <button
                    onClick={() => addToList.mutate(p)}
                    disabled={added}
                    className={`w-full rounded-xl py-2 text-sm font-bold transition active:scale-95 ${added ? "bg-mint-soft text-mint-deep" : "bg-mint"}`}
                  >
                    {added ? "✓ Dans la liste" : "+ Ajouter à la liste"}
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {editing && (
        <Modal title={editing.product ? "Modifier le produit" : "Nouveau produit"} onClose={() => setEditing(null)}>
          <ProductForm product={editing.product} onDone={() => setEditing(null)} />
        </Modal>
      )}
    </section>
  );
}

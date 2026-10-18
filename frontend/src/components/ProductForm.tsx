import { useState, type FormEvent } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { api, type Product } from "../lib/api";
import { compressImage } from "../lib/image";
import { productImage } from "../lib/products";

export function ProductForm({ product, onDone }: { product?: Product; onDone: () => void }) {
  const qc = useQueryClient();
  const [name, setName] = useState(product?.name ?? "");
  const [note, setNote] = useState(product?.note ?? "");
  const [image, setImage] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [removeImage, setRemoveImage] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);

  const done = () => {
    qc.invalidateQueries({ queryKey: ["products"] });
    qc.invalidateQueries({ queryKey: ["shopping"] });
    onDone();
  };

  const save = useMutation({
    mutationFn: async () => {
      const fd = new FormData();
      fd.set("name", name);
      fd.set("note", note);
      if (image) fd.set("image", await compressImage(image));
      if (removeImage && !image) fd.set("removeImage", "true");
      return api<Product>(product ? `/products/${product.id}` : "/products", {
        method: product ? "PATCH" : "POST",
        body: fd,
      });
    },
    onSuccess: done,
  });

  const remove = useMutation({
    mutationFn: () => api(`/products/${product!.id}`, { method: "DELETE" }),
    onSuccess: done,
  });

  const onPhoto = (file: File | undefined) => {
    if (!file) return;
    setImage(file);
    setPreview(URL.createObjectURL(file));
    setRemoveImage(false);
  };

  const submit = (e: FormEvent) => {
    e.preventDefault();
    save.mutate();
  };

  const currentImage = preview ?? (product?.hasImage && !removeImage ? productImage(product) : null);

  return (
    <form onSubmit={submit} className="space-y-4">
      <div>
        <label className="label" htmlFor="product-name">Nom</label>
        <input id="product-name" className="input focus:border-mint" placeholder="Mouchoirs, lait, café…" value={name} onChange={(e) => setName(e.target.value)} required />
      </div>

      <div>
        <span className="label">Photo</span>
        {currentImage ? (
          <div className="relative">
            <img src={currentImage} alt="" className="mx-auto max-h-64 rounded-2xl object-contain" />
            <button
              type="button"
              onClick={() => {
                setImage(null);
                setPreview(null);
                setRemoveImage(true);
              }}
              className="absolute right-2 top-2 rounded-full bg-white/90 px-3 py-1 text-sm font-bold shadow-soft"
            >
              Retirer
            </button>
          </div>
        ) : null}
        <label className="btn-ghost mt-2 w-full cursor-pointer">
          📷 {currentImage ? "Changer la photo" : "Ajouter une photo"}
          <input type="file" accept="image/*" className="hidden" onChange={(e) => onPhoto(e.target.files?.[0])} />
        </label>
      </div>

      <div>
        <label className="label" htmlFor="product-note">Note (facultatif)</label>
        <textarea
          id="product-note"
          className="input min-h-20 focus:border-mint"
          placeholder="Marque, format, rayon…"
          value={note}
          onChange={(e) => setNote(e.target.value)}
        />
      </div>

      {save.error && <p className="text-center text-sm font-semibold text-rose-deep">{save.error.message}</p>}
      <button className="btn w-full bg-mint-deep text-white shadow-soft" disabled={!name.trim() || save.isPending}>
        {save.isPending ? "Enregistrement…" : product ? "Enregistrer" : "Créer le produit"}
      </button>

      {product && (
        <div className="text-center">
          {confirmDelete ? (
            <div className="flex justify-center gap-2">
              <button type="button" className="btn-ghost" onClick={() => setConfirmDelete(false)}>Annuler</button>
              <button type="button" className="btn bg-rose-deep text-white" onClick={() => remove.mutate()} disabled={remove.isPending}>
                Supprimer
              </button>
            </div>
          ) : (
            <button type="button" className="text-sm font-bold text-ink-soft" onClick={() => setConfirmDelete(true)}>
              Supprimer le produit
            </button>
          )}
        </div>
      )}
    </form>
  );
}

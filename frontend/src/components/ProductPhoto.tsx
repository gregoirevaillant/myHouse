import { Modal } from "./Modal";
import { productImage } from "../lib/products";
import type { Product } from "../lib/api";

// Photo d'un produit en grand
export function ProductPhoto({ product, onClose }: { product: Product; onClose: () => void }) {
  return (
    <Modal title={product.name} onClose={onClose}>
      {product.hasImage && (
        <img src={productImage(product)} alt={product.name} className="mx-auto max-h-[60vh] rounded-2xl object-contain" />
      )}
      {product.note && <p className="mt-4 whitespace-pre-wrap rounded-2xl bg-white p-4 font-semibold shadow-soft">{product.note}</p>}
    </Modal>
  );
}

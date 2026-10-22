import { useEffect } from "react";
import type { ShoppingItem } from "../lib/api";
import { productImage } from "../lib/products";

// garde l'écran allumé tant que le mode magasin est ouvert (relancé au retour dans l'app)
function useWakeLock() {
  useEffect(() => {
    let lock: WakeLockSentinel | null = null;
    let active = true;
    const request = async () => {
      try {
        const next = await navigator.wakeLock?.request("screen");
        if (!active) next?.release();
        else lock = next ?? null;
      } catch {
        // refusé (économie d'énergie…) : l'écran s'éteindra normalement
      }
    };
    const onVisible = () => document.visibilityState === "visible" && request();
    request();
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      active = false;
      document.removeEventListener("visibilitychange", onVisible);
      lock?.release().catch(() => {});
    };
  }, []);
}

// Liste plein écran à gros caractères pour le magasin : un tap coche, les cochés descendent
export function StoreMode({ items, onToggle, onClose }: { items: ShoppingItem[]; onToggle: (item: ShoppingItem) => void; onClose: () => void }) {
  useWakeLock();
  useEffect(() => {
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = "";
    };
  }, []);

  const todo = items.filter((i) => !i.checked);
  const done = items.filter((i) => i.checked);

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto bg-cream px-4 pb-[calc(2rem+env(safe-area-inset-bottom))] pt-[calc(1rem+env(safe-area-inset-top))]">
      <div className="mx-auto max-w-2xl">
        <div className="sticky top-0 z-10 -mx-4 mb-4 flex items-center gap-3 bg-cream px-4 py-2">
          <div className="flex-1">
            <p className="text-sm font-bold text-ink-soft">🏪 Mode magasin</p>
            <p className="text-2xl font-extrabold">{todo.length ? `${todo.length} à prendre` : "Tout est pris ✓"}</p>
          </div>
          <button onClick={onClose} className="btn bg-mint px-5 shadow-soft">
            Terminer
          </button>
        </div>

        <ul className="space-y-2.5">
          {[...todo, ...done].map((item) => (
            <li key={item.id}>
              <button
                onClick={() => onToggle(item)}
                className={`flex w-full items-center gap-4 rounded-3xl px-5 py-4 text-left shadow-soft transition active:scale-[0.98] ${item.checked ? "bg-white/60 opacity-50" : "bg-white"}`}
              >
                <span
                  className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-full border-[3px] text-xl font-extrabold ${
                    item.checked ? "border-mint-deep bg-mint text-mint-deep" : "border-mint"
                  }`}
                >
                  {item.checked && "✓"}
                </span>
                <span className={`min-w-0 flex-1 break-words text-2xl font-extrabold leading-tight ${item.checked ? "line-through" : ""}`}>{item.label}</span>
                {item.product?.hasImage && <img src={productImage(item.product)} alt="" className="h-14 w-14 shrink-0 rounded-2xl object-cover" />}
              </button>
              {!item.checked && item.product?.note && <p className="px-5 pt-1 text-sm font-semibold text-ink-soft">📝 {item.product.note}</p>}
            </li>
          ))}
        </ul>

        {items.length === 0 && <p className="mt-10 text-center text-xl font-bold text-ink-soft">La liste est vide 🥕</p>}
      </div>
    </div>
  );
}

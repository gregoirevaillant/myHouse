import { useState, type FormEvent } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api, type ShoppingItem } from "../lib/api";

const KEY = ["shopping"];

export function Shopping() {
  const qc = useQueryClient();
  const [label, setLabel] = useState("");
  const { data: items = [], isLoading } = useQuery({
    queryKey: KEY,
    queryFn: () => api<ShoppingItem[]>("/shopping"),
    refetchInterval: 10_000,
  });

  const refresh = () => qc.invalidateQueries({ queryKey: KEY });

  const add = useMutation({
    mutationFn: (label: string) => api<ShoppingItem>("/shopping", { method: "POST", json: { label } }),
    onSuccess: (item) => qc.setQueryData<ShoppingItem[]>(KEY, (old = []) => [item, ...old]),
  });

  const toggle = useMutation({
    mutationFn: (item: ShoppingItem) =>
      api(`/shopping/${item.id}`, { method: "PATCH", json: { checked: !item.checked } }),
    onMutate: (item) =>
      qc.setQueryData<ShoppingItem[]>(KEY, (old = []) =>
        old.map((i) => (i.id === item.id ? { ...i, checked: !i.checked } : i)),
      ),
    onSettled: refresh,
  });

  const remove = useMutation({
    mutationFn: (id: string) => api(`/shopping/${id}`, { method: "DELETE" }),
    onMutate: (id) => qc.setQueryData<ShoppingItem[]>(KEY, (old = []) => old.filter((i) => i.id !== id)),
    onSettled: refresh,
  });

  const clearChecked = useMutation({
    mutationFn: () => api("/shopping/checked", { method: "DELETE" }),
    onMutate: () => qc.setQueryData<ShoppingItem[]>(KEY, (old = []) => old.filter((i) => !i.checked)),
    onSettled: refresh,
  });

  const submit = (e: FormEvent) => {
    e.preventDefault();
    const value = label.trim();
    if (!value) return;
    add.mutate(value);
    setLabel("");
  };

  const todo = items.filter((i) => !i.checked);
  const done = items.filter((i) => i.checked);

  return (
    <section>
      <h2 className="mb-4 flex items-center gap-2 text-lg font-extrabold">
        <span className="rounded-xl bg-mint px-2 py-1">🛒</span> Liste de courses
      </h2>

      <form onSubmit={submit} className="mb-6 flex gap-2">
        <input
          className="input focus:border-mint"
          placeholder="Ajouter un article…"
          value={label}
          onChange={(e) => setLabel(e.target.value)}
          enterKeyHint="done"
        />
        <button className="btn bg-mint px-4 text-xl shadow-soft" aria-label="Ajouter">
          +
        </button>
      </form>

      {isLoading ? (
        <p className="text-center text-ink-soft">Chargement…</p>
      ) : items.length === 0 ? (
        <div className="rounded-3xl bg-mint-soft p-8 text-center text-ink-soft">
          <p className="text-3xl">🥕</p>
          <p className="mt-2 font-semibold">La liste est vide</p>
        </div>
      ) : (
        <>
          <ul className="space-y-2">
            {todo.map((item) => (
              <Item key={item.id} item={item} onToggle={() => toggle.mutate(item)} onDelete={() => remove.mutate(item.id)} />
            ))}
          </ul>

          {done.length > 0 && (
            <>
              <div className="mb-2 mt-6 flex items-center justify-between">
                <p className="text-sm font-bold text-ink-soft">Dans le panier ({done.length})</p>
                <button onClick={() => clearChecked.mutate()} className="text-sm font-bold text-mint-deep">
                  Vider les cochés
                </button>
              </div>
              <ul className="space-y-2">
                {done.map((item) => (
                  <Item key={item.id} item={item} onToggle={() => toggle.mutate(item)} onDelete={() => remove.mutate(item.id)} />
                ))}
              </ul>
            </>
          )}
        </>
      )}
    </section>
  );
}

function Item({ item, onToggle, onDelete }: { item: ShoppingItem; onToggle: () => void; onDelete: () => void }) {
  return (
    <li className={`flex items-center gap-3 rounded-2xl bg-white px-4 py-3 shadow-soft transition ${item.checked ? "opacity-60" : ""}`}>
      <button
        onClick={onToggle}
        className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full border-2 transition ${
          item.checked ? "border-mint-deep bg-mint text-mint-deep" : "border-mint"
        }`}
        aria-label={item.checked ? "Décocher" : "Cocher"}
      >
        {item.checked && "✓"}
      </button>
      <span onClick={onToggle} className={`flex-1 cursor-pointer font-semibold ${item.checked ? "line-through" : ""}`}>
        {item.label}
      </span>
      <button onClick={onDelete} className="px-2 text-ink-soft/60 hover:text-rose-deep" aria-label="Supprimer">
        ✕
      </button>
    </li>
  );
}

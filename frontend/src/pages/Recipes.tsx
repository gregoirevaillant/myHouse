import { useState, type FormEvent, type ReactNode } from "react";
import { useMutation } from "@tanstack/react-query";
import { Link, useNavigate } from "react-router-dom";
import { Modal } from "../components/Modal";
import { RecipeForm, type RecipeDraft } from "../components/RecipeForm";
import { api, type RecipeCategory } from "../lib/api";
import { normalize } from "../lib/products";
import { RECIPE_CATEGORIES, recipeCategory, recipeImage, recipeMeta, useRecipes } from "../lib/recipes";

export function Recipes() {
  const navigate = useNavigate();
  const { data: all = [], isLoading } = useRecipes(true);
  const [search, setSearch] = useState("");
  const [category, setCategory] = useState<RecipeCategory | null>(null);
  const [adding, setAdding] = useState(false);
  const recipes = all;

  const q = normalize(search);
  const filtered = recipes.filter((r) => (!category || r.category === category) && (!q || normalize(`${r.name} ${r.ingredients}`).includes(q)));
  // seulement les catégories qui ont des recettes
  const used = RECIPE_CATEGORIES.filter((c) => recipes.some((r) => r.category === c.id));

  return (
    <section>
      <div className="mb-4 flex items-center justify-between">
        <h2 className="flex items-center gap-2 text-lg font-extrabold">
          <span className="rounded-xl bg-rose px-2 py-1">📖</span> Recettes
        </h2>
        <button className="btn bg-rose px-4 py-2 shadow-soft" onClick={() => setAdding(true)}>
          + Ajouter
        </button>
      </div>

      {recipes.length > 0 && (
        <>
          <input className="input mb-3 focus:border-rose" placeholder="Une recette, un ingrédient…" value={search} onChange={(e) => setSearch(e.target.value)} />
          {used.length > 1 && (
            <div className="-mx-4 mb-4 flex gap-1.5 overflow-x-auto px-4 pb-1">
              <Chip active={!category} onClick={() => setCategory(null)}>
                Toutes
              </Chip>
              {used.map((c) => (
                <Chip key={c.id} active={category === c.id} onClick={() => setCategory(category === c.id ? null : c.id)}>
                  {c.emoji} {c.label}
                </Chip>
              ))}
            </div>
          )}
        </>
      )}

      {isLoading ? (
        <p className="text-center text-ink-soft">Chargement…</p>
      ) : filtered.length === 0 ? (
        <div className="rounded-3xl bg-rose-soft p-8 text-center text-ink-soft">
          <p className="text-3xl">📖</p>
          <p className="mt-2 font-semibold">
            {recipes.length ? "Aucun résultat" : "Vos recettes préférées, à portée de main en cuisine"}
          </p>
          {!recipes.length && (
            <button className="btn mt-4 bg-rose px-4 py-2 text-ink shadow-soft" onClick={() => setAdding(true)}>
              + Première recette
            </button>
          )}
        </div>
      ) : (
        <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3">
          {filtered.map((r) => {
            const cat = recipeCategory(r.category);
            const meta = recipeMeta(r);
            return (
              <li key={r.id}>
                <Link to={`/recettes/${r.id}`} className="block overflow-hidden rounded-3xl bg-white shadow-soft transition active:scale-95">
                  {r.hasImage ? (
                    <img src={recipeImage(r)} alt="" loading="lazy" className="aspect-[4/3] w-full object-cover" />
                  ) : (
                    <div className={`flex aspect-[4/3] items-center justify-center text-5xl ${cat.color}`}>{cat.emoji}</div>
                  )}
                  <div className="px-3 py-2.5">
                    <p className="line-clamp-2 font-extrabold leading-snug">{r.name}</p>
                    {meta && <p className="mt-0.5 truncate text-xs font-bold text-ink-soft">{meta}</p>}
                  </div>
                </Link>
              </li>
            );
          })}
        </ul>
      )}

      {adding && (
        <Modal title="Nouvelle recette" onClose={() => setAdding(false)}>
          <AddRecipe onDone={(id) => navigate(`/recettes/${id}`)} />
        </Modal>
      )}
    </section>
  );
}

function Chip({ active, onClick, children }: { active: boolean; onClick: () => void; children: ReactNode }) {
  return (
    <button
      onClick={onClick}
      className={`shrink-0 rounded-full px-3 py-1.5 text-sm font-bold shadow-soft transition active:scale-95 ${active ? "bg-rose" : "bg-white text-ink-soft"}`}
    >
      {children}
    </button>
  );
}

type Imported = Omit<RecipeDraft, "image"> & { image: string | null };

// saisie d'un lien (import) ou d'une recette à la main ; l'import pré-remplit le formulaire à relire
function AddRecipe({ onDone }: { onDone: (id: string) => void }) {
  const [link, setLink] = useState("");
  const [draft, setDraft] = useState<RecipeDraft | null>(null);
  const [manual, setManual] = useState(false);

  const load = useMutation({
    mutationFn: async () => {
      const r = await api<Imported>("/recipes/import", { method: "POST", json: { url: link } });
      const { image, ...rest } = r;
      const file = image ? new File([await (await fetch(image)).blob()], "recette", { type: image.slice(5, image.indexOf(";")) }) : null;
      return { ...rest, image: file } satisfies RecipeDraft;
    },
    onSuccess: setDraft,
  });

  if (draft || manual) return <RecipeForm draft={draft ?? undefined} onDone={(r) => onDone(r.id)} />;

  const submit = (e: FormEvent) => {
    e.preventDefault();
    load.mutate();
  };

  return (
    <form onSubmit={submit} className="space-y-4">
      <div>
        <label className="label" htmlFor="recipe-import">🔗 Importer depuis un site</label>
        <input
          id="recipe-import"
          type="url"
          className="input focus:border-rose"
          placeholder="https://marmiton.org/…"
          autoCapitalize="off"
          autoCorrect="off"
          value={link}
          onChange={(e) => setLink(e.target.value)}
        />
        <p className="mt-1 text-xs font-semibold text-ink-soft">Titre, ingrédients, étapes et photo sont repris ; vous pourrez tout relire avant d'enregistrer.</p>
      </div>
      {load.error && <p className="text-center text-sm font-semibold text-rose-deep">{load.error.message}</p>}
      <button className="btn w-full bg-rose-deep text-white shadow-soft" disabled={!link.trim() || load.isPending}>
        {load.isPending ? "Lecture de la page…" : "Importer la recette"}
      </button>
      <button type="button" className="btn-ghost w-full" onClick={() => setManual(true)}>
        ✏️ Saisir à la main
      </button>
    </form>
  );
}

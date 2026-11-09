import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { Modal } from "../components/Modal";
import { RecipeForm } from "../components/RecipeForm";
import { normalize } from "../lib/products";
import { caloriesLabel, recipeCategory, recipeImage, useRecipes } from "../lib/recipes";

// Mes recettes et aliments pour le suivi des calories : privés, hors de la liste de recettes de la famille
export function CalorieFoods() {
  const navigate = useNavigate();
  const { data: all = [], isLoading } = useRecipes(true, true);
  const [search, setSearch] = useState("");
  const [adding, setAdding] = useState(false);
  const foods = all.filter((r) => r.private);
  const q = normalize(search);
  const filtered = foods.filter((r) => !q || normalize(`${r.name} ${r.ingredients}`).includes(q));

  return (
    <section>
      <Link to="/calories" className="mb-2 inline-block text-sm font-bold text-ink-soft">
        ◀ Calories
      </Link>
      <div className="mb-4 flex items-center justify-between">
        <h2 className="flex items-center gap-2 text-lg font-extrabold">
          <span className="rounded-xl bg-peach px-2 py-1">🍲</span> Mes recettes
        </h2>
        <button className="btn bg-peach px-4 py-2 shadow-soft" onClick={() => setAdding(true)}>
          + Ajouter
        </button>
      </div>

      {foods.length > 0 && <input className="input mb-3 focus:border-peach" placeholder="Un aliment, une recette…" value={search} onChange={(e) => setSearch(e.target.value)} />}

      {isLoading ? (
        <p className="text-center text-ink-soft">Chargement…</p>
      ) : filtered.length === 0 ? (
        <div className="rounded-3xl bg-peach-soft p-8 text-center text-ink-soft">
          <p className="text-3xl">🍲</p>
          <p className="mt-2 font-semibold">{foods.length ? "Aucun résultat" : "Vos recettes et aliments habituels, juste pour suivre les calories : ajoutez-les en un geste à vos repas"}</p>
          {!foods.length && (
            <button className="btn mt-4 bg-peach px-4 py-2 text-ink shadow-soft" onClick={() => setAdding(true)}>
              + Première recette
            </button>
          )}
        </div>
      ) : (
        <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3">
          {filtered.map((r) => (
            <li key={r.id}>
              <Link to={`/calories/recettes/${r.id}`} className="block overflow-hidden rounded-3xl bg-white shadow-soft transition active:scale-95">
                {r.hasImage ? (
                  <img src={recipeImage(r)} alt="" loading="lazy" className="aspect-[4/3] w-full object-cover" />
                ) : (
                  <div className={`flex aspect-[4/3] items-center justify-center text-5xl ${recipeCategory(r.category).color}`}>{recipeCategory(r.category).emoji}</div>
                )}
                <div className="px-3 py-2.5">
                  <p className="line-clamp-2 font-extrabold leading-snug">{r.name}</p>
                  {r.calories ? <p className="mt-0.5 truncate text-xs font-bold text-ink-soft">🔥 {caloriesLabel(r)}</p> : null}
                </div>
              </Link>
            </li>
          ))}
        </ul>
      )}

      {adding && (
        <Modal title="Nouvelle recette" onClose={() => setAdding(false)}>
          <RecipeForm caloriesOnly onDone={(r) => navigate(`/calories/recettes/${r.id}`)} />
        </Modal>
      )}
    </section>
  );
}

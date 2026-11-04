import { useEffect, useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { Link, useNavigate, useParams } from "react-router-dom";
import { Modal } from "../components/Modal";
import { PlanMeal } from "../components/PlanMeal";
import { RecipeToCalories } from "../components/RecipeToCalories";
import { RecipeForm } from "../components/RecipeForm";
import { api } from "../lib/api";
import { lines, recipeCategory, recipeImage, recipeMeta, useRecipes } from "../lib/recipes";

const ACTION = "btn-ghost min-w-0 flex-1 flex-col gap-0.5 whitespace-nowrap px-2 py-2 text-xs";

export function RecipeDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { data: recipes = [], isLoading } = useRecipes();
  const recipe = recipes.find((r) => r.id === id);
  const [editing, setEditing] = useState(false);
  const [planning, setPlanning] = useState(false);
  const [logging, setLogging] = useState(false);
  const [awake, setAwake] = useState(false);
  // ingrédients cochés (à acheter) et étapes faites : juste sur cet écran
  const [picked, setPicked] = useState<Set<number>>(new Set());
  const [done, setDone] = useState<Set<number>>(new Set());
  useWakeLock(awake);

  const ingredients = lines(recipe?.ingredients ?? "");
  const steps = lines(recipe?.steps ?? "");

  const toShopping = useMutation({
    mutationFn: (labels: string[]) => api<{ added: number }>("/shopping/many", { method: "POST", json: { labels } }),
    onSuccess: () => setPicked(new Set()),
  });

  if (isLoading) return <p className="text-center text-ink-soft">Chargement…</p>;
  if (!recipe) {
    return (
      <div className="rounded-3xl bg-rose-soft p-8 text-center">
        <p className="font-semibold text-ink-soft">Cette recette n'existe plus</p>
        <Link to="/recettes" className="btn-ghost mt-4">
          Voir les recettes
        </Link>
      </div>
    );
  }

  const cat = recipeCategory(recipe.category);
  const meta = recipeMeta(recipe);
  const toggle = (set: Set<number>, i: number) => {
    const next = new Set(set);
    if (!next.delete(i)) next.add(i);
    return next;
  };
  const shoppingLabels = picked.size ? ingredients.filter((_, i) => picked.has(i)) : ingredients;

  return (
    <section className="space-y-4">
      <Link to="/recettes" className="inline-block text-sm font-bold text-ink-soft">
        ◀ Recettes
      </Link>

      {recipe.hasImage ? (
        <img src={recipeImage(recipe)} alt="" className="max-h-80 w-full rounded-3xl object-cover shadow-soft" />
      ) : null}

      <div>
        <h2 className="text-2xl font-extrabold leading-tight">{recipe.name}</h2>
        <div className="mt-2 flex flex-wrap gap-1.5 text-sm font-bold">
          <span className={`rounded-full px-3 py-1 ${cat.color}`}>
            {cat.emoji} {cat.label}
          </span>
          {meta && <span className="rounded-full bg-white px-3 py-1 shadow-soft">{meta}</span>}
        </div>
      </div>

      <div className="flex gap-2">
        <button className={ACTION} onClick={() => setPlanning((p) => !p)}>
          <span className="text-lg">📅</span> Prévoir
        </button>
        <button className={ACTION} onClick={() => setLogging((l) => !l)}>
          <span className="text-lg">🔥</span> Calories
        </button>
        {"wakeLock" in navigator && (
          <button className={`${ACTION} ${awake ? "!bg-lemon" : ""}`} onClick={() => setAwake((a) => !a)} aria-pressed={awake}>
            <span className="text-lg">🔆</span> {awake ? "Écran allumé" : "Garder allumé"}
          </button>
        )}
        {recipe.url && (
          <a className={ACTION} href={recipe.url} target="_blank" rel="noreferrer">
            <span className="text-lg">🔗</span> Source
          </a>
        )}
        <button className={ACTION} onClick={() => setEditing(true)}>
          <span className="text-lg">✏️</span> Modifier
        </button>
      </div>

      {planning && <PlanMeal title={recipe.name} text={`${cat.emoji} ${recipe.name}`} onDone={() => setPlanning(false)} />}

      {logging && <RecipeToCalories recipe={recipe} onDone={() => setLogging(false)} />}

      {ingredients.length > 0 && (
        <div className="rounded-3xl bg-rose-soft p-4">
          <p className="mb-2 flex items-baseline justify-between font-extrabold">
            Ingrédients
            <span className="text-xs font-bold text-ink-soft">{recipe.servings ? `pour ${recipe.servings}` : ""}</span>
          </p>
          <ul className="space-y-1.5">
            {ingredients.map((ing, i) => (
              <li key={i}>
                <button
                  onClick={() => setPicked(toggle(picked, i))}
                  className="flex w-full items-center gap-3 rounded-2xl bg-white px-3 py-2.5 text-left font-semibold shadow-soft transition active:scale-[0.98]"
                >
                  <span className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-md border-2 text-xs ${picked.has(i) ? "border-rose-deep bg-rose-deep text-white" : "border-ink-soft/40"}`}>
                    {picked.has(i) && "✓"}
                  </span>
                  {ing}
                </button>
              </li>
            ))}
          </ul>
          {toShopping.isSuccess && !picked.size ? (
            <p className="mt-3 rounded-2xl bg-mint px-3 py-2.5 text-center text-sm font-bold">
              {toShopping.data.added ? `✓ ${toShopping.data.added} ajouté${toShopping.data.added > 1 ? "s" : ""} aux courses` : "Tout est déjà sur la liste"}
              {" · "}
              <Link to="/courses" className="underline">
                voir
              </Link>
            </p>
          ) : (
            <button className="btn mt-3 w-full bg-mint-deep py-2.5 text-white shadow-soft" disabled={toShopping.isPending} onClick={() => toShopping.mutate(shoppingLabels)}>
              🛒 {picked.size ? `Ajouter ${picked.size} ingrédient${picked.size > 1 ? "s" : ""} aux courses` : "Tout ajouter aux courses"}
            </button>
          )}
          {toShopping.error && <p className="mt-2 text-center text-sm font-semibold text-rose-deep">{toShopping.error.message}</p>}
          {!picked.size && !toShopping.isSuccess && <p className="mt-1.5 text-center text-xs text-ink-soft">Coche ce qui manque pour n'ajouter que ça</p>}
        </div>
      )}

      {steps.length > 0 && (
        <div>
          <p className="mb-2 px-1 font-extrabold">Préparation</p>
          <ol className="space-y-2">
            {steps.map((step, i) => (
              <li key={i}>
                <button
                  onClick={() => setDone(toggle(done, i))}
                  className={`flex w-full gap-3 rounded-2xl bg-white p-3 text-left shadow-soft transition ${done.has(i) ? "opacity-50" : ""}`}
                >
                  <span className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-sm font-extrabold ${done.has(i) ? "bg-mint" : cat.color}`}>
                    {done.has(i) ? "✓" : i + 1}
                  </span>
                  <span className={`pt-0.5 font-semibold leading-snug ${done.has(i) ? "line-through" : ""}`}>{step}</span>
                </button>
              </li>
            ))}
          </ol>
        </div>
      )}

      {recipe.note && <p className="whitespace-pre-wrap rounded-3xl bg-lemon-soft p-4 font-semibold">📝 {recipe.note}</p>}

      {editing && (
        <Modal title="Modifier la recette" onClose={() => setEditing(false)}>
          <RecipeForm
            recipe={recipe}
            onDone={() => setEditing(false)}
            onDeleted={() => navigate("/recettes", { replace: true })}
          />
        </Modal>
      )}
    </section>
  );
}

// garde l'écran allumé pendant qu'on cuisine ; iOS relâche le verrou quand l'app passe en arrière-plan
function useWakeLock(on: boolean) {
  useEffect(() => {
    if (!on || !("wakeLock" in navigator)) return;
    let lock: WakeLockSentinel | null = null;
    let cancelled = false;
    const acquire = () =>
      navigator.wakeLock
        .request("screen")
        .then((l) => {
          if (cancelled) l.release();
          else lock = l;
        })
        .catch(() => {});
    const onVisible = () => document.visibilityState === "visible" && acquire();
    acquire();
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      cancelled = true;
      document.removeEventListener("visibilitychange", onVisible);
      lock?.release();
    };
  }, [on]);
}

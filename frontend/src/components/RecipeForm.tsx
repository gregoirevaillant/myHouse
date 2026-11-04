import { useState, type FormEvent } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { api, type Recipe, type RecipeCategory } from "../lib/api";
import { compressImage } from "../lib/image";
import { RECIPE_CATEGORIES, recipeImage } from "../lib/recipes";

export type RecipeDraft = Omit<Recipe, "id" | "hasImage" | "note"> & { image: File | null };

export function RecipeForm({
  recipe,
  draft,
  onDone,
  onDeleted,
}: {
  recipe?: Recipe;
  draft?: RecipeDraft; // pré-remplissage (import par lien), pour une nouvelle recette
  onDone: (saved: Recipe) => void;
  onDeleted?: () => void;
}) {
  const init = recipe ?? draft;
  const qc = useQueryClient();
  const [name, setName] = useState(init?.name ?? "");
  const [category, setCategory] = useState<RecipeCategory>(init?.category ?? "PLAT");
  const [minutes, setMinutes] = useState(init?.minutes?.toString() ?? "");
  const [servings, setServings] = useState(init?.servings?.toString() ?? "");
  const [calories, setCalories] = useState(init?.calories?.toString() ?? "");
  const [ingredients, setIngredients] = useState(init?.ingredients ?? "");
  const [steps, setSteps] = useState(init?.steps ?? "");
  const [url, setUrl] = useState(init?.url ?? "");
  const [note, setNote] = useState(recipe?.note ?? "");
  const [image, setImage] = useState<File | null>(draft?.image ?? null);
  const [preview, setPreview] = useState<string | null>(() => (draft?.image ? URL.createObjectURL(draft.image) : null));
  const [removeImage, setRemoveImage] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);

  const save = useMutation({
    mutationFn: async () => {
      const fd = new FormData();
      Object.entries({ name, category, minutes, servings, calories, ingredients, steps, url, note }).forEach(([k, v]) => fd.set(k, v));
      if (image) fd.set("image", await compressImage(image));
      if (removeImage && !image) fd.set("removeImage", "true");
      return api<Recipe>(recipe ? `/recipes/${recipe.id}` : "/recipes", { method: recipe ? "PATCH" : "POST", body: fd });
    },
    onSuccess: (saved) => {
      qc.invalidateQueries({ queryKey: ["recipes"] });
      onDone(saved);
    },
  });

  const remove = useMutation({
    mutationFn: () => api(`/recipes/${recipe!.id}`, { method: "DELETE" }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["recipes"] });
      onDeleted?.();
    },
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

  const currentImage = preview ?? (recipe?.hasImage && !removeImage ? recipeImage(recipe) : null);

  return (
    <form onSubmit={submit} className="space-y-4">
      <div>
        <label className="label" htmlFor="recipe-name">Nom</label>
        <input id="recipe-name" className="input focus:border-rose" placeholder="Lasagnes de mamie, curry de lentilles…" value={name} onChange={(e) => setName(e.target.value)} required />
      </div>

      <div className="flex flex-wrap gap-1.5">
        {RECIPE_CATEGORIES.map((c) => (
          <button
            key={c.id}
            type="button"
            onClick={() => setCategory(c.id)}
            className={`rounded-full px-3 py-1.5 text-sm font-bold shadow-soft transition active:scale-95 ${category === c.id ? c.color : "bg-white text-ink-soft"}`}
          >
            {c.emoji} {c.label}
          </button>
        ))}
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="label" htmlFor="recipe-minutes">⏱ Temps (min)</label>
          <input id="recipe-minutes" className="input focus:border-rose" inputMode="numeric" pattern="[0-9]*" placeholder="45" value={minutes} onChange={(e) => setMinutes(e.target.value.replace(/\D/g, ""))} />
        </div>
        <div>
          <label className="label" htmlFor="recipe-servings">👥 Personnes</label>
          <input id="recipe-servings" className="input focus:border-rose" inputMode="numeric" pattern="[0-9]*" placeholder="4" value={servings} onChange={(e) => setServings(e.target.value.replace(/\D/g, ""))} />
        </div>
      </div>

      <div>
        <label className="label" htmlFor="recipe-calories">🔥 Calories par portion (kcal)</label>
        <input id="recipe-calories" className="input focus:border-rose" inputMode="numeric" pattern="[0-9]*" placeholder="450" value={calories} onChange={(e) => setCalories(e.target.value.replace(/\D/g, ""))} />
      </div>

      <div>
        <label className="label" htmlFor="recipe-ingredients">Ingrédients <span className="font-semibold">· un par ligne</span></label>
        <textarea
          id="recipe-ingredients"
          className="input min-h-36 focus:border-rose"
          placeholder={"200 g de farine\n3 œufs\n50 cl de lait"}
          value={ingredients}
          onChange={(e) => setIngredients(e.target.value)}
        />
      </div>

      <div>
        <label className="label" htmlFor="recipe-steps">Étapes <span className="font-semibold">· une par ligne</span></label>
        <textarea
          id="recipe-steps"
          className="input min-h-36 focus:border-rose"
          placeholder={"Mélanger la farine et les œufs.\nAjouter le lait petit à petit.\nLaisser reposer 1 h."}
          value={steps}
          onChange={(e) => setSteps(e.target.value)}
        />
      </div>

      <div>
        <span className="label">Photo</span>
        {currentImage && (
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
        )}
        <label className="btn-ghost mt-2 w-full cursor-pointer">
          📷 {currentImage ? "Changer la photo" : "Ajouter une photo"}
          <input type="file" accept="image/*" className="hidden" onChange={(e) => onPhoto(e.target.files?.[0])} />
        </label>
      </div>

      <div>
        <label className="label" htmlFor="recipe-url">Lien (facultatif)</label>
        <input
          id="recipe-url"
          type="url"
          className="input focus:border-rose"
          placeholder="https://… (site, vidéo)"
          autoCapitalize="off"
          autoCorrect="off"
          value={url}
          onChange={(e) => setUrl(e.target.value)}
        />
      </div>

      <div>
        <label className="label" htmlFor="recipe-note">Note (facultatif)</label>
        <textarea id="recipe-note" className="input focus:border-rose" rows={2} placeholder="Moins de sucre, marche aussi au four…" value={note} onChange={(e) => setNote(e.target.value)} />
      </div>

      {save.error && <p className="text-center text-sm font-semibold text-rose-deep">{save.error.message}</p>}
      <button className="btn w-full bg-rose-deep text-white shadow-soft" disabled={!name.trim() || save.isPending}>
        {save.isPending ? "Enregistrement…" : recipe ? "Enregistrer" : "Créer la recette"}
      </button>

      {recipe && (
        <div className="text-center">
          {confirmDelete ? (
            <div className="flex justify-center gap-2">
              <button type="button" className="btn-ghost" onClick={() => setConfirmDelete(false)}>
                Annuler
              </button>
              <button type="button" className="btn bg-rose-deep text-white" onClick={() => remove.mutate()} disabled={remove.isPending}>
                Supprimer
              </button>
            </div>
          ) : (
            <button type="button" className="text-sm font-bold text-ink-soft" onClick={() => setConfirmDelete(true)}>
              Supprimer la recette
            </button>
          )}
        </div>
      )}
    </form>
  );
}

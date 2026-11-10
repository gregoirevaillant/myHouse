import { lazy, Suspense, type ReactElement } from "react";
import { Navigate, Route, Routes } from "react-router-dom";
import { Layout } from "./components/Layout";
import { useMe } from "./lib/auth";
import { Admin } from "./pages/Admin";
import { Budget } from "./pages/Budget";
import { Media } from "./pages/Media";
import { Calories } from "./pages/Calories";
import { Weight } from "./pages/Weight";
import { CalorieFoods } from "./pages/CalorieFoods";
import { CardDetail } from "./pages/CardDetail";
import { Cards } from "./pages/Cards";
import { FirstLogin } from "./pages/FirstLogin";
import { ExpenseTracker } from "./pages/ExpenseTracker";
import { Expenses } from "./pages/Expenses";
import { Home, PrivateHome } from "./pages/Home";
import { Infos } from "./pages/Infos";
import { JournalDetail } from "./pages/JournalDetail";
import { Journals } from "./pages/Journals";
import { Login } from "./pages/Login";
import { Meals } from "./pages/Meals";
import { Products } from "./pages/Products";
import { Profile } from "./pages/Profile";
import { RecipeDetail } from "./pages/RecipeDetail";
import { Recipes } from "./pages/Recipes";
import { Restaurants } from "./pages/Restaurants";
import { Shopping } from "./pages/Shopping";

// page Santé chargée à la demande : elle n'alourdit pas le premier chargement de l'application
const Sport = lazy(() => import("./pages/Sport").then((m) => ({ default: m.Sport })));
const Health = lazy(() => import("./pages/Health").then((m) => ({ default: m.Health })));

// page désactivée pour la famille : retour à l'accueil (le serveur refuse de toute façon ses données)
function Gate({ page, children }: { page: string; children: ReactElement }) {
  const me = useMe().data;
  const ok = !me?.features || me.features.includes(page) || me.privateFeatures?.includes(page);
  return ok ? children : <Navigate to="/" replace />;
}

export default function App() {
  // isPending (et non isLoading) : on attend aussi la restauration des données gardées hors ligne
  const { data: me, isPending } = useMe();

  if (isPending) {
    return <div className="flex min-h-screen items-center justify-center">
        <img src="/icon.svg" alt="" className="h-16 w-16 animate-pulse" />
      </div>;
  }
  if (!me) return <Login />;
  if (me.mustChangePassword) return <FirstLogin />;

  return (
    <Routes>
      <Route element={<Layout />}>
        <Route path="/" element={<Home />} />
        <Route path="/prive" element={<PrivateHome />} />
        <Route path="/cartes" element={<Gate page="cartes"><Cards /></Gate>} />
        <Route path="/repas" element={<Gate page="repas"><Meals /></Gate>} />
        <Route path="/recettes" element={<Gate page="recettes"><Recipes /></Gate>} />
        <Route path="/recettes/:id" element={<Gate page="recettes"><RecipeDetail /></Gate>} />
        <Route path="/courses" element={<Gate page="courses"><Shopping /></Gate>} />
        <Route path="/courses/produits" element={<Gate page="courses"><Products /></Gate>} />
        <Route path="/restos" element={<Gate page="restos"><Restaurants /></Gate>} />
        <Route path="/depenses" element={<Gate page="depenses"><Expenses /></Gate>} />
        <Route path="/depenses/:id" element={<Gate page="depenses"><ExpenseTracker /></Gate>} />
        <Route path="/journal" element={<Gate page="journal"><Journals /></Gate>} />
        <Route path="/journal/:id" element={<Gate page="journal"><JournalDetail /></Gate>} />
        <Route path="/infos" element={<Gate page="infos"><Infos /></Gate>} />
        <Route path="/budget" element={<Gate page="budget"><Budget /></Gate>} />
        <Route path="/media" element={<Gate page="media"><Media /></Gate>} />
        <Route path="/sante" element={<Gate page="sante"><Suspense fallback={<p className="py-8 text-center text-ink-soft">Chargement…</p>}><Health /></Suspense></Gate>} />
        <Route path="/sport" element={<Gate page="sport"><Suspense fallback={<p className="py-8 text-center text-ink-soft">Chargement…</p>}><Sport /></Suspense></Gate>} />
        <Route path="/poids" element={<Gate page="poids"><Weight /></Gate>} />
        <Route path="/calories" element={<Gate page="calories"><Calories /></Gate>} />
        <Route path="/calories/recettes" element={<Gate page="calories"><CalorieFoods /></Gate>} />
        <Route path="/calories/recettes/:id" element={<Gate page="calories"><RecipeDetail /></Gate>} />
        <Route path="/profil" element={<Profile />} />
        <Route path="/admin" element={<Admin />} />
      </Route>
      <Route path="/cartes/:id" element={<Gate page="cartes"><CardDetail /></Gate>} />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}

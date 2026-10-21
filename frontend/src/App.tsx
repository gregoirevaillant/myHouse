import { Navigate, Route, Routes, useLocation } from "react-router-dom";
import { Layout } from "./components/Layout";
import { useMe } from "./lib/auth";
import { Bank } from "./pages/Bank";
import { Budget } from "./pages/Budget";
import { CardDetail } from "./pages/CardDetail";
import { Cards } from "./pages/Cards";
import { ExpenseTracker } from "./pages/ExpenseTracker";
import { Expenses } from "./pages/Expenses";
import { Home } from "./pages/Home";
import { JournalDetail } from "./pages/JournalDetail";
import { Journals } from "./pages/Journals";
import { Login } from "./pages/Login";
import { Meals } from "./pages/Meals";
import { Products } from "./pages/Products";
import { Profile } from "./pages/Profile";
import { Recurring } from "./pages/Recurring";
import { Restaurants } from "./pages/Restaurants";
import { Shopping } from "./pages/Shopping";

export default function App() {
  // isPending (et non isLoading) : on attend aussi la restauration des données gardées hors ligne
  const { data: me, isPending } = useMe();

  if (isPending) {
    return <div className="flex min-h-screen items-center justify-center">
        <img src="/icon.svg" alt="" className="h-16 w-16 animate-pulse" />
      </div>;
  }
  if (!me) return <Login />;

  return (
    <Routes>
      <Route element={<Layout />}>
        <Route path="/" element={<Home />} />
        <Route path="/cartes" element={<Cards />} />
        <Route path="/repas" element={<Meals />} />
        <Route path="/courses" element={<Shopping />} />
        <Route path="/courses/produits" element={<Products />} />
        <Route path="/restos" element={<Restaurants />} />
        <Route path="/depenses" element={<Expenses />} />
        <Route path="/depenses/:id" element={<ExpenseTracker />} />
        <Route path="/journal" element={<Journals />} />
        <Route path="/journal/:id" element={<JournalDetail />} />
        <Route path="/budget" element={<Budget />} />
        <Route path="/budget/recurrent" element={<Recurring />} />
        <Route path="/budget/banque" element={<Bank />} />
        <Route path="/bank/callback" element={<BankCallback />} />
        <Route path="/profil" element={<Profile />} />
      </Route>
      <Route path="/cartes/:id" element={<CardDetail />} />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}

// URL de retour déclarée sur Enable Banking : on renvoie vers la page Banque en gardant ?code&state
function BankCallback() {
  const { search } = useLocation();
  return <Navigate to={{ pathname: "/budget/banque", search }} replace />;
}

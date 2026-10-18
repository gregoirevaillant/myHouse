import { Navigate, Route, Routes } from "react-router-dom";
import { Layout } from "./components/Layout";
import { useMe } from "./lib/auth";
import { CardDetail } from "./pages/CardDetail";
import { Cards } from "./pages/Cards";
import { Expenses } from "./pages/Expenses";
import { Login } from "./pages/Login";
import { Meals } from "./pages/Meals";
import { Products } from "./pages/Products";
import { Profile } from "./pages/Profile";
import { Shopping } from "./pages/Shopping";

export default function App() {
  const { data: me, isLoading } = useMe();

  if (isLoading) {
    return <div className="flex min-h-screen items-center justify-center">
        <img src="/icon.svg" alt="" className="h-16 w-16 animate-pulse" />
      </div>;
  }
  if (!me) return <Login />;

  return (
    <Routes>
      <Route element={<Layout />}>
        <Route path="/cartes" element={<Cards />} />
        <Route path="/repas" element={<Meals />} />
        <Route path="/courses" element={<Shopping />} />
        <Route path="/courses/produits" element={<Products />} />
        <Route path="/depenses" element={<Expenses />} />
        <Route path="/profil" element={<Profile />} />
      </Route>
      <Route path="/cartes/:id" element={<CardDetail />} />
      <Route path="*" element={<Navigate to="/courses" replace />} />
    </Routes>
  );
}

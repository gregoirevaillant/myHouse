import { NavLink } from "react-router-dom";

const tabs = [
  { to: "/budget", label: "Mois" },
  { to: "/budget/recurrent", label: "Récurrent" },
  { to: "/budget/banque", label: "Banque" },
];

export function BudgetTabs() {
  return (
    <div className="mb-5 grid grid-cols-3 gap-1 rounded-2xl bg-white p-1 shadow-soft">
      {tabs.map((t) => (
        <NavLink
          key={t.to}
          to={t.to}
          end
          className={({ isActive }) =>
            `rounded-xl py-2 text-center text-sm font-bold transition ${isActive ? "bg-rose text-ink" : "text-ink-soft"}`
          }
        >
          {t.label}
        </NavLink>
      ))}
    </div>
  );
}

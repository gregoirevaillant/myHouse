import { NavLink } from "react-router-dom";

const tabs = [
  { to: "/courses", label: "Liste" },
  { to: "/courses/produits", label: "Produits" },
];

export function CoursesTabs() {
  return (
    <div className="mb-5 grid grid-cols-2 gap-1 rounded-2xl bg-white p-1 shadow-soft">
      {tabs.map((t) => (
        <NavLink
          key={t.to}
          to={t.to}
          end
          className={({ isActive }) =>
            `rounded-xl py-2 text-center text-sm font-bold transition ${isActive ? "bg-mint text-ink" : "text-ink-soft"}`
          }
        >
          {t.label}
        </NavLink>
      ))}
    </div>
  );
}

import { useState } from "react";
import { Forme } from "../components/health/Forme";
import { Sport } from "../components/health/Sport";
import { Summary } from "../components/health/Summary";
import { useGarminActivities, useGarminForme, useGarminOverview } from "../lib/garmin";

const TABS = [
  { id: "resume", label: "Résumé" },
  { id: "sport", label: "Sport" },
  { id: "forme", label: "Forme" },
] as const;
type TabId = (typeof TABS)[number]["id"];

const Loading = () => <p className="py-8 text-center text-ink-soft">Chargement…</p>;

function Problem({ message }: { message: string }) {
  return <p className="rounded-3xl bg-rose-soft p-4 text-center text-sm font-bold">{message}</p>;
}

export function Health() {
  const [tab, setTab] = useState<TabId>("resume");
  // chaque onglet ne charge ses données que lorsqu'on l'ouvre
  const overview = useGarminOverview(tab !== "sport");
  const activities = useGarminActivities(tab === "sport");
  const forme = useGarminForme(tab === "forme");

  return (
    <section>
      <div className="mb-4 flex items-center justify-between">
        <h2 className="flex items-center gap-2 text-lg font-extrabold">
          <span className="rounded-xl bg-mint px-2 py-1">❤️</span> Santé
        </h2>
        <span className="text-xs font-bold text-ink-soft">⌚ Garmin</span>
      </div>

      <div className="mb-4 grid grid-cols-3 gap-1 rounded-2xl bg-white p-1 shadow-soft" role="tablist">
        {TABS.map((t) => (
          <button
            key={t.id}
            role="tab"
            aria-selected={tab === t.id}
            onClick={() => setTab(t.id)}
            className={`rounded-xl py-2 text-sm font-extrabold transition ${tab === t.id ? "bg-mint" : "text-ink-soft"}`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {tab === "resume" &&
        (overview.isLoading ? <Loading /> : overview.error ? <Problem message={overview.error.message} /> : overview.data && <Summary data={overview.data} />)}
      {tab === "sport" &&
        (activities.isLoading ? <Loading /> : activities.error ? <Problem message={activities.error.message} /> : activities.data && <Sport activities={activities.data} />)}
      {tab === "forme" &&
        (forme.isLoading || overview.isLoading ? <Loading /> : forme.error ? <Problem message={forme.error.message} /> : forme.data && <Forme fitness={overview.data?.fitness ?? null} forme={forme.data} />)}
    </section>
  );
}

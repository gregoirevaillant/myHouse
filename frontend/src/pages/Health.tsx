import { RefreshButton } from "../components/health/RefreshButton";
import { useState } from "react";
import { Forme } from "../components/health/Forme";
import { Sport } from "../components/health/Sport";
import { Summary } from "../components/health/Summary";
import { useGarminActivities, useGarminForme, useGarminOverview } from "../lib/garmin";
import { hasHealth, useHealth } from "../lib/health";

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
  const health = useHealth();
  const overview = useGarminOverview(tab === "forme");
  const activities = useGarminActivities(tab === "sport");
  const forme = useGarminForme(tab === "forme");

  return (
    <section>
      <div className="mb-4 flex items-center justify-between">
        <h2 className="flex items-center gap-2 text-lg font-extrabold">
          <span className="rounded-xl bg-mint px-2 py-1">❤️</span> Santé
        </h2>
        <RefreshButton />
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
        (health.isLoading ? <Loading /> : health.error ? <Problem message={health.error.message} /> : !hasHealth(health.data) ? (
          <div className="rounded-3xl bg-white p-6 text-center shadow-soft">
            <p className="text-3xl">📭</p>
            <p className="mt-2 font-extrabold">Pas encore de données</p>
            <p className="mt-1 text-sm font-semibold text-ink-soft">Sur l'ordinateur, lance <code className="rounded bg-cream px-1.5 py-0.5">scripts/garmin/refresh.sh --full</code> puis recharge cette page.</p>
          </div>
        ) : <Summary s={health.data} />)}
      {tab === "sport" &&
        (activities.isLoading ? <Loading /> : activities.error ? <Problem message={activities.error.message} /> : activities.data && <Sport activities={activities.data} />)}
      {tab === "forme" &&
        (forme.isLoading || overview.isLoading ? <Loading /> : forme.error ? <Problem message={forme.error.message} /> : forme.data && <Forme fitness={overview.data?.fitness ?? null} forme={forme.data} />)}
    </section>
  );
}

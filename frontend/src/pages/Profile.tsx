import { useState, type FormEvent } from "react";
import { useMutation } from "@tanstack/react-query";
import { api, type NotificationType } from "../lib/api";
import { useLogout, useMe, useUpdatePreferences } from "../lib/auth";
import { usePushStatus } from "../lib/push";
import { tabs } from "../lib/tabs";

export function Profile() {
  const { data: me } = useMe();
  const logout = useLogout();
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const change = useMutation({
    mutationFn: () => api("/auth/password", { method: "POST", json: { current, next } }),
    onSuccess: () => {
      setCurrent("");
      setNext("");
    },
  });

  const submit = (e: FormEvent) => {
    e.preventDefault();
    change.mutate();
  };

  return (
    <section className="space-y-6">
      <div className="rounded-3xl bg-rose-soft p-6">
        <p className="text-lg font-extrabold">{me?.name}</p>
        <p className="text-sm text-ink-soft">{me?.email}</p>
      </div>

      <MenuSettings />

      <NotificationSettings />

      <form onSubmit={submit} className="space-y-3 rounded-3xl bg-white p-6 shadow-soft">
        <h2 className="font-extrabold">Changer mon mot de passe</h2>
        <input
          className="input"
          type="password"
          placeholder="Mot de passe actuel"
          autoComplete="current-password"
          value={current}
          onChange={(e) => setCurrent(e.target.value)}
          required
        />
        <input
          className="input"
          type="password"
          placeholder="Nouveau mot de passe (6 caractères min.)"
          autoComplete="new-password"
          minLength={6}
          value={next}
          onChange={(e) => setNext(e.target.value)}
          required
        />
        {change.error && <p className="text-sm font-semibold text-rose-deep">{change.error.message}</p>}
        {change.isSuccess && <p className="text-sm font-semibold text-mint-deep">Mot de passe modifié ✓</p>}
        <button className="btn-primary w-full" disabled={change.isPending}>
          Enregistrer
        </button>
      </form>

      <button className="btn-ghost w-full text-rose-deep" onClick={() => logout.mutate()}>
        Se déconnecter
      </button>
    </section>
  );
}

function MenuSettings() {
  const { data: me } = useMe();
  const save = useUpdatePreferences();
  const hidden = me?.hiddenTabs ?? [];
  const showNavBar = me?.showNavBar ?? true;

  const toggle = (to: string) =>
    save.mutate({ hiddenTabs: hidden.includes(to) ? hidden.filter((t) => t !== to) : [...hidden, to] });

  return (
    <div className="space-y-3 rounded-3xl bg-white p-6 shadow-soft">
      <h2 className="font-extrabold">Menu</h2>
      <label className="flex items-center justify-between gap-3 rounded-2xl bg-cream px-3 py-3 font-bold">
        <span>
          Barre de menu en bas
          <span className="block text-xs font-semibold text-ink-soft">Sinon, on passe par l'accueil</span>
        </span>
        <input
          type="checkbox"
          role="switch"
          className="peer sr-only"
          checked={showNavBar}
          onChange={() => save.mutate({ showNavBar: !showNavBar })}
        />
        <span
          aria-hidden
          className="relative h-7 w-12 shrink-0 rounded-full bg-ink-soft/30 transition peer-checked:bg-lavender-deep peer-focus-visible:ring-2 peer-focus-visible:ring-lavender after:absolute after:left-1 after:top-1 after:h-5 after:w-5 after:rounded-full after:bg-white after:shadow after:transition peer-checked:after:translate-x-5"
        />
      </label>

      <p className="pt-2 text-sm font-bold text-ink-soft">Pages affichées (accueil et barre de menu)</p>
      <div className="space-y-2">
        {tabs.map((t) => {
          const shown = !hidden.includes(t.to);
          // au moins une page doit rester visible
          const last = shown && tabs.every((o) => o.to === t.to || hidden.includes(o.to));
          return (
            <label key={t.to} className={`flex items-center gap-3 rounded-2xl px-3 py-2 font-bold ${shown ? t.active : "bg-cream text-ink-soft"}`}>
              <input
                type="checkbox"
                className="h-5 w-5 accent-lavender-deep"
                checked={shown}
                disabled={last}
                onChange={() => toggle(t.to)}
              />
              <span className="text-xl">{t.icon}</span>
              {t.label}
            </label>
          );
        })}
      </div>
      {save.error && <p className="text-sm font-semibold text-rose-deep">{save.error.message}</p>}
    </div>
  );
}

const NOTIFICATIONS: { type: NotificationType; icon: string; label: string; hint: string }[] = [
  { type: "SHOPPING", icon: "🛒", label: "Courses", hint: "Articles ajoutés par l'autre" },
  { type: "MEALS", icon: "🍽️", label: "Repas", hint: "Menu d'aujourd'hui ou de demain modifié" },
  { type: "EXPENSES", icon: "💶", label: "Dépenses", hint: "Nouvelle dépense ajoutée" },
  { type: "BUDGET", icon: "📊", label: "Budget", hint: "Prélèvements du lendemain, accès banque à renouveler" },
  { type: "DIGEST", icon: "🏠", label: "Résumé du dimanche", hint: "La semaine qui vient, le dimanche à 19 h" },
];

const PUSH_MESSAGES: Partial<Record<ReturnType<typeof usePushStatus>["state"], string>> = {
  unsupported: "Ce navigateur ne gère pas les notifications.",
  "ios-install": "Sur iPhone, ajoute Maison à l'écran d'accueil (Partager → Sur l'écran d'accueil) puis ouvre-la depuis l'icône pour activer les notifications.",
  denied: "Les notifications sont bloquées pour Maison : autorise-les dans les réglages du téléphone ou du navigateur.",
};

function NotificationSettings() {
  const { data: me } = useMe();
  const save = useUpdatePreferences();
  const push = usePushStatus();
  // ?? [] : une session gardée hors ligne avant l'ajout de la préférence n'a pas le champ
  const muted = me?.mutedNotifications ?? [];
  const device = useMutation({ mutationFn: () => (push.state === "on" ? push.disable() : push.enable()) });
  const test = useMutation({ mutationFn: () => api("/push/test", { method: "POST" }) });

  const toggle = (type: NotificationType) =>
    save.mutate({ mutedNotifications: muted.includes(type) ? muted.filter((t) => t !== type) : [...muted, type] });

  const message = PUSH_MESSAGES[push.state];
  const canToggle = push.state === "on" || push.state === "off";

  return (
    <div className="space-y-3 rounded-3xl bg-white p-6 shadow-soft">
      <h2 className="font-extrabold">Notifications</h2>
      {message ? (
        <p className="rounded-2xl bg-lemon-soft px-3 py-3 text-sm font-semibold">{message}</p>
      ) : (
        <label className="flex items-center justify-between gap-3 rounded-2xl bg-cream px-3 py-3 font-bold">
          <span>
            Sur cet appareil
            <span className="block text-xs font-semibold text-ink-soft">À activer sur chaque téléphone</span>
          </span>
          <input
            type="checkbox"
            role="switch"
            className="peer sr-only"
            checked={push.state === "on"}
            disabled={!canToggle || device.isPending}
            onChange={() => device.mutate()}
          />
          <span
            aria-hidden
            className="relative h-7 w-12 shrink-0 rounded-full bg-ink-soft/30 transition peer-checked:bg-lavender-deep peer-focus-visible:ring-2 peer-focus-visible:ring-lavender after:absolute after:left-1 after:top-1 after:h-5 after:w-5 after:rounded-full after:bg-white after:shadow after:transition peer-checked:after:translate-x-5"
          />
        </label>
      )}
      {device.error && <p className="text-sm font-semibold text-rose-deep">{device.error.message}</p>}

      <p className="pt-2 text-sm font-bold text-ink-soft">Me prévenir pour</p>
      <div className="space-y-2">
        {NOTIFICATIONS.map((n) => {
          const on = !muted.includes(n.type);
          return (
            <label key={n.type} className={`flex items-center gap-3 rounded-2xl px-3 py-2 font-bold ${on ? "bg-lavender-soft" : "bg-cream text-ink-soft"}`}>
              <input type="checkbox" className="h-5 w-5 accent-lavender-deep" checked={on} onChange={() => toggle(n.type)} />
              <span className="text-xl">{n.icon}</span>
              <span>
                {n.label}
                <span className="block text-xs font-semibold text-ink-soft">{n.hint}</span>
              </span>
            </label>
          );
        })}
      </div>
      {save.error && <p className="text-sm font-semibold text-rose-deep">{save.error.message}</p>}

      {push.state === "on" && (
        <>
          <button className="btn-ghost w-full" onClick={() => test.mutate()} disabled={test.isPending}>
            Envoyer une notification de test
          </button>
          {test.error && <p className="text-sm font-semibold text-rose-deep">{test.error.message}</p>}
          {test.isSuccess && <p className="text-sm font-semibold text-mint-deep">Envoyée ✓</p>}
        </>
      )}
    </div>
  );
}

import { useCallback, useEffect, useState } from "react";
import { api } from "./api";

export type PushState = "loading" | "unsupported" | "ios-install" | "denied" | "off" | "on";

const supported = () => "serviceWorker" in navigator && "PushManager" in window && "Notification" in window;

// sur iPhone, les notifications n'existent que pour l'app ajoutée à l'écran d'accueil
const isIos = () => /iPhone|iPad|iPod/.test(navigator.userAgent);

// pas de service worker en développement (vite dev) : getRegistration renvoie undefined
const registration = () => navigator.serviceWorker.getRegistration();

function base64ToBytes(base64: string) {
  const b64 = (base64 + "=".repeat((4 - (base64.length % 4)) % 4)).replace(/-/g, "+").replace(/_/g, "/");
  return Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
}

const save = (sub: PushSubscription) => api("/push/subscriptions", { method: "POST", json: sub.toJSON() });

// état des notifications sur cet appareil
export function usePushStatus() {
  const [state, setState] = useState<PushState>("loading");

  const refresh = useCallback(async () => {
    if (!supported()) return setState(isIos() ? "ios-install" : "unsupported");
    if (Notification.permission === "denied") return setState("denied");
    const sub = await (await registration())?.pushManager.getSubscription();
    // renvoyé à chaque ouverture : l'abonnement peut avoir changé, ou une autre personne s'être connectée ici
    if (sub) save(sub).catch(() => {});
    setState(sub ? "on" : "off");
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const enable = async () => {
    // doit venir d'un clic : sinon iOS refuse de demander la permission
    if ((await Notification.requestPermission()) !== "granted") return refresh();
    const reg = await registration();
    if (!reg) throw new Error("Service worker indisponible (l'app doit être installée ou en production)");
    const { publicKey } = await api<{ publicKey: string }>("/push/key");
    const sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: base64ToBytes(publicKey) });
    await save(sub);
    await refresh();
  };

  const disable = async () => {
    const sub = await (await registration())?.pushManager.getSubscription();
    if (sub) {
      await api("/push/subscriptions", { method: "DELETE", json: { endpoint: sub.endpoint } }).catch(() => {});
      await sub.unsubscribe();
    }
    await refresh();
  };

  return { state, enable, disable };
}

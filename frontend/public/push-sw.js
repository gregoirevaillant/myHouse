// Chargé par le service worker généré (workbox.importScripts dans vite.config.ts)

self.addEventListener("push", (event) => {
  const data = event.data ? event.data.json() : {};
  event.waitUntil(
    self.registration.showNotification(data.title || "Maison", {
      body: data.body,
      icon: "/icon-192.png",
      badge: "/icon-192.png",
      tag: data.tag,
      // même tag : la nouvelle notification remplace l'ancienne, mais refait vibrer le téléphone
      renotify: !!data.tag,
      data: { url: data.url || "/" },
    }),
  );
});

// clic : on réutilise une fenêtre de l'app déjà ouverte, sinon on en ouvre une
self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const url = event.notification.data?.url || "/";
  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((windows) => {
      const client = windows[0];
      if (client) return client.focus().then((c) => c.navigate(url)).catch(() => self.clients.openWindow(url));
      return self.clients.openWindow(url);
    }),
  );
});

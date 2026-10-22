import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { MutationCache, QueryCache, QueryClient } from "@tanstack/react-query";
import { createSyncStoragePersister } from "@tanstack/query-sync-storage-persister";
import { PersistQueryClientProvider } from "@tanstack/react-query-persist-client";
import { BrowserRouter } from "react-router-dom";
import App from "./App";
import { ApiError } from "./lib/api";
import "./index.css";

const OFFLINE_MAX_AGE = 1000 * 60 * 60 * 24 * 30;

// 401 : on revérifie la session (/auth/me) ; si elle a vraiment expiré, l'écran de connexion s'affiche
const onError = (error: Error) => {
  if (error instanceof ApiError && error.status === 401) queryClient.invalidateQueries({ queryKey: ["me"] });
};

const queryClient = new QueryClient({
  queryCache: new QueryCache({ onError }),
  mutationCache: new MutationCache({ onError }),
  // gcTime infini : les données gardées pour le hors-ligne ne doivent pas être purgées de la mémoire
  // (une durée > ~24,8 jours ferait déborder le minuteur du navigateur et purgerait tout aussitôt)
  defaultOptions: { queries: { retry: 1, refetchOnWindowFocus: true, gcTime: Infinity } },
});

// Hors ligne : seules la session, la liste de courses et les cartes sont gardées sur le téléphone
const OFFLINE_KEYS = ["me", "shopping", "cards", "infos"];

const persister = createSyncStoragePersister({ storage: window.localStorage, key: "maison-offline" });

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <PersistQueryClientProvider
      client={queryClient}
      persistOptions={{
        persister,
        maxAge: OFFLINE_MAX_AGE,
        dehydrateOptions: {
          // hors ligne, le rafraîchissement échoue : on garde quand même la dernière donnée connue
          shouldDehydrateQuery: (q) => q.state.data !== undefined && OFFLINE_KEYS.includes(String(q.queryKey[0])),
        },
      }}
    >
      <BrowserRouter>
        <App />
      </BrowserRouter>
    </PersistQueryClientProvider>
  </StrictMode>,
);

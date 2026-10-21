import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api, ApiError, type User } from "./api";

export function useMe() {
  return useQuery({
    queryKey: ["me"],
    queryFn: () =>
      api<User>("/auth/me").catch((e) => {
        if (e instanceof ApiError && e.status === 401) return null;
        throw e;
      }),
    staleTime: Infinity,
  });
}

export function useLogin() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: { email: string; password: string }) => api<User>("/auth/login", { method: "POST", json: body }),
    onSuccess: (user) => qc.setQueryData(["me"], user),
  });
}

export function useLogout() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => api("/auth/logout", { method: "POST" }),
    onSuccess: () => {
      qc.clear();
      qc.setQueryData(["me"], null);
    },
  });
}

export type Preferences = Pick<User, "hiddenTabs" | "showNavBar" | "mutedNotifications">;

// appliqué tout de suite à l'écran, puis confirmé par le serveur
export function useUpdatePreferences() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (prefs: Partial<Preferences>) => api<User>("/auth/preferences", { method: "PATCH", json: prefs }),
    onMutate: (prefs) => {
      const me = qc.getQueryData<User>(["me"]);
      if (me) qc.setQueryData<User>(["me"], { ...me, ...prefs });
    },
    onSuccess: (user) => qc.setQueryData(["me"], user),
    onError: () => qc.invalidateQueries({ queryKey: ["me"] }),
  });
}

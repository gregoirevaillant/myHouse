import { useQuery } from "@tanstack/react-query";
import { api, type Member } from "./api";

export function useMembers() {
  return useQuery({ queryKey: ["members"], queryFn: () => api<Member[]>("/users"), staleTime: Infinity });
}

import { useQuery } from "@tanstack/react-query";
import { api, type Product } from "./api";

export function useProducts() {
  return useQuery({ queryKey: ["products"], queryFn: () => api<Product[]>("/products") });
}

export const productImage = (p: Pick<Product, "id">) => `/api/products/${p.id}/image`;

// même normalisation que le serveur, pour la recherche
export const normalize = (s: string) =>
  s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().trim().replace(/\s+/g, " ");

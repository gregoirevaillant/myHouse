import { useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { useMe } from "./auth";
import { api, type HouseInfo, type LoyaltyCard, type ShoppingItem } from "./api";
import { productImage } from "./products";

export const shoppingQuery = { queryKey: ["shopping"], queryFn: () => api<ShoppingItem[]>("/shopping") };
export const cardsQuery = { queryKey: ["cards"], queryFn: () => api<LoyaltyCard[]>("/cards") };
export const infosQuery = { queryKey: ["infos"], queryFn: () => api<HouseInfo[]>("/infos") };

const preload = (src: string) => {
  new Image().src = src;
};

// À l'ouverture de l'app : rafraîchit la liste, les cartes et les infos et charge les photos,
// pour qu'elles soient disponibles hors ligne même sans avoir visité ces pages
export function useOfflineWarmup() {
  // seulement les pages activées pour la famille (les autres répondraient 403)
  const features = useMe().data?.features;
  const on = (page: string) => !features || features.includes(page);
  const { data: items } = useQuery({ ...shoppingQuery, enabled: on("courses") });
  const { data: cards } = useQuery({ ...cardsQuery, enabled: on("cartes") });
  useQuery({ ...infosQuery, enabled: on("infos") });

  useEffect(() => {
    items?.forEach((i) => i.product?.hasImage && preload(productImage(i.product)));
  }, [items]);

  useEffect(() => {
    cards?.forEach((c) => c.hasImage && preload(`/api/cards/${c.id}/image`));
  }, [cards]);
}

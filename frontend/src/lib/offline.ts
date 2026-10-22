import { useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
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
  const { data: items } = useQuery(shoppingQuery);
  const { data: cards } = useQuery(cardsQuery);
  useQuery(infosQuery);

  useEffect(() => {
    items?.forEach((i) => i.product?.hasImage && preload(productImage(i.product)));
  }, [items]);

  useEffect(() => {
    cards?.forEach((c) => c.hasImage && preload(`/api/cards/${c.id}/image`));
  }, [cards]);
}

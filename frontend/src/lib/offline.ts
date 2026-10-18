import { useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { api, type LoyaltyCard, type ShoppingItem } from "./api";
import { productImage } from "./products";

export const shoppingQuery = { queryKey: ["shopping"], queryFn: () => api<ShoppingItem[]>("/shopping") };
export const cardsQuery = { queryKey: ["cards"], queryFn: () => api<LoyaltyCard[]>("/cards") };

const preload = (src: string) => {
  new Image().src = src;
};

// À l'ouverture de l'app : rafraîchit la liste et les cartes et charge leurs photos,
// pour qu'elles soient disponibles hors ligne même sans avoir visité ces pages
export function useOfflineWarmup() {
  const { data: items } = useQuery(shoppingQuery);
  const { data: cards } = useQuery(cardsQuery);

  useEffect(() => {
    items?.forEach((i) => i.product?.hasImage && preload(productImage(i.product)));
  }, [items]);

  useEffect(() => {
    cards?.forEach((c) => c.hasImage && preload(`/api/cards/${c.id}/image`));
  }, [cards]);
}

import { useQuery } from "@tanstack/react-query";
import { api, type MediaItem, type MediaKind, type MediaStatus } from "./api";

// verbes propres à chaque type : « à voir / vu », « à lire / lu »…
export const KINDS: Record<MediaKind, { icon: string; label: string; plural: string; wish: string; doing: string; done: string; creator: string; searchable: boolean; source: string }> = {
  MOVIE: { icon: "🎬", label: "Film", plural: "Films", wish: "À voir", doing: "En cours", done: "Vu", creator: "Réalisateur", searchable: true, source: "TMDB" },
  SERIES: { icon: "📺", label: "Série", plural: "Séries", wish: "À voir", doing: "En cours", done: "Vue", creator: "Créateur / chaîne", searchable: true, source: "TMDB" },
  GAME: { icon: "🎮", label: "Jeu", plural: "Jeux", wish: "À jouer", doing: "En cours", done: "Terminé", creator: "Studio", searchable: true, source: "IGDB" },
  BOOK: { icon: "📚", label: "Livre", plural: "Livres", wish: "À lire", doing: "En cours", done: "Lu", creator: "Auteur", searchable: true, source: "Open Library" },
};
export const KIND_IDS = Object.keys(KINDS) as MediaKind[];
export const STATUS_IDS: MediaStatus[] = ["WISHLIST", "IN_PROGRESS", "DONE"];

export const statusLabel = (kind: MediaKind, status: MediaStatus) => {
  const k = KINDS[kind];
  return status === "WISHLIST" ? k.wish : status === "IN_PROGRESS" ? k.doing : k.done;
};

export const useMedia = (enabled = true) => useQuery({ queryKey: ["media"], queryFn: () => api<MediaItem[]>("/media"), enabled });
export const mediaImage = (m: Pick<MediaItem, "id">) => `/api/media/${m.id}/image`;

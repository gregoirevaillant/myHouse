import "leaflet/dist/leaflet.css";
import L from "leaflet";
import { MapContainer, Marker, Popup, TileLayer } from "react-leaflet";
import type { Restaurant } from "../lib/api";
import { cuisineInfo, districtLabel, priceLabel } from "../lib/restaurants";

// centre de Paris quand aucun resto n'est encore placé
const PARIS: [number, number] = [48.8566, 2.3522];

// marqueur emoji : évite les icônes PNG de Leaflet, mal résolues par Vite
const icon = (r: Restaurant) =>
  L.divIcon({
    className: "",
    html: `<div class="resto-pin${r.wishlist ? " resto-pin-todo" : ""}">${cuisineInfo(r.cuisine).emoji}</div>`,
    iconSize: [36, 36],
    iconAnchor: [18, 18],
    popupAnchor: [0, -16],
  });

export default function RestaurantMap({ restaurants, onOpen }: { restaurants: Restaurant[]; onOpen: (r: Restaurant) => void }) {
  const placed = restaurants.filter((r): r is Restaurant & { lat: number; lng: number } => r.lat != null && r.lng != null);
  const bounds = placed.length > 1 ? L.latLngBounds(placed.map((r) => [r.lat, r.lng])).pad(0.15) : undefined;

  return (
    // isolate : les calques Leaflet (z-index 400+) restent sous les fenêtres de l'app
    <div className="isolate overflow-hidden rounded-3xl shadow-soft">
      <MapContainer
        bounds={bounds}
        center={bounds ? undefined : placed[0] ? [placed[0].lat, placed[0].lng] : PARIS}
        zoom={bounds ? undefined : placed[0] ? 15 : 12}
        className="h-[60vh] w-full"
        scrollWheelZoom
      >
        <TileLayer
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        />
        {placed.map((r) => (
          <Marker key={r.id} position={[r.lat, r.lng]} icon={icon(r)}>
            <Popup>
              <p className="!m-0 font-extrabold">{r.name}</p>
              <p className="!m-0 text-ink-soft">
                {cuisineInfo(r.cuisine).label} · {districtLabel(r)} {r.price ? `· ${priceLabel(r.price)}` : ""}
              </p>
              <p className="!m-0 text-peach-deep">{r.rating ? "★".repeat(r.rating) : r.wishlist ? "✨ À tester" : ""}</p>
              <button onClick={() => onOpen(r)} className="mt-1 rounded-xl bg-peach px-3 py-1 font-bold">
                Voir la fiche
              </button>
            </Popup>
          </Marker>
        ))}
      </MapContainer>
    </div>
  );
}

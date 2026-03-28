"use client";

/**
 * F96 — Map field editor with OpenStreetMap + Leaflet
 *
 * Stores: { lat, lng, address, zoom }
 * Uses Nominatim for geocoding (free, no API key).
 * Renders Leaflet map with draggable marker.
 */
import { useState, useEffect, useRef, useCallback } from "react";
import { MapPin, Search, Loader2 } from "lucide-react";
import dynamic from "next/dynamic";

// Dynamically import Leaflet components (no SSR)
const LeafletMap = dynamic(() => import("./map-leaflet"), { ssr: false });

export interface MapValue {
  lat: number;
  lng: number;
  address: string;
  zoom: number;
}

interface Props {
  value: MapValue | null;
  onChange: (val: MapValue) => void;
  defaultCenter?: { lat: number; lng: number };
  defaultZoom?: number;
  locked?: boolean;
}

const DEFAULT_CENTER = { lat: 55.676, lng: 12.568 }; // Copenhagen
const DEFAULT_ZOOM = 14;

export function MapEditor({ value, onChange, defaultCenter, defaultZoom, locked }: Props) {
  const [address, setAddress] = useState(value?.address ?? "");
  const [searching, setSearching] = useState(false);
  const [error, setError] = useState("");
  const searchTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);

  const center = value
    ? { lat: value.lat, lng: value.lng }
    : defaultCenter ?? DEFAULT_CENTER;
  const zoom = value?.zoom ?? defaultZoom ?? DEFAULT_ZOOM;

  const handleSearch = useCallback(async (query: string) => {
    if (!query.trim() || locked) return;
    setSearching(true);
    setError("");
    try {
      const res = await fetch(
        `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(query)}&limit=1`,
        { headers: { "User-Agent": "webhouse-cms/1.0" } },
      );
      const results = await res.json();
      if (results.length > 0) {
        const r = results[0];
        const newVal: MapValue = {
          lat: parseFloat(r.lat),
          lng: parseFloat(r.lon),
          address: r.display_name,
          zoom: value?.zoom ?? defaultZoom ?? DEFAULT_ZOOM,
        };
        onChange(newVal);
        setAddress(r.display_name);
      } else {
        setError("No results found");
      }
    } catch {
      setError("Geocoding failed");
    }
    setSearching(false);
  }, [locked, onChange, value?.zoom, defaultZoom]);

  function handleAddressKeyDown(e: React.KeyboardEvent) {
    if (e.key === "Enter") {
      e.preventDefault();
      handleSearch(address);
    }
  }

  function handleMarkerDrag(lat: number, lng: number) {
    if (locked) return;
    // Reverse geocode
    onChange({ lat, lng, address: value?.address ?? "", zoom: value?.zoom ?? zoom });
    // Async reverse geocode to update address
    fetch(
      `https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lng}`,
      { headers: { "User-Agent": "webhouse-cms/1.0" } },
    )
      .then((r) => r.json())
      .then((data) => {
        if (data.display_name) {
          setAddress(data.display_name);
          onChange({ lat, lng, address: data.display_name, zoom: value?.zoom ?? zoom });
        }
      })
      .catch(() => {});
  }

  function handleZoomChange(newZoom: number) {
    if (locked || !value) return;
    onChange({ ...value, zoom: newZoom });
  }

  const inputStyle: React.CSSProperties = {
    width: "100%", padding: "0.35rem 0.5rem", borderRadius: "6px",
    border: "1px solid var(--border)", background: "var(--background)",
    color: "var(--foreground)", fontSize: "0.8rem", outline: "none",
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "0.5rem" }}>
      {/* Address search */}
      <div style={{ display: "flex", gap: "0.25rem" }}>
        <div style={{ position: "relative", flex: 1 }}>
          <MapPin style={{ position: "absolute", left: 8, top: "50%", transform: "translateY(-50%)", width: 14, height: 14, color: "var(--muted-foreground)" }} />
          <input
            type="text"
            value={address}
            onChange={(e) => setAddress(e.target.value)}
            onKeyDown={handleAddressKeyDown}
            placeholder="Search address..."
            disabled={locked}
            style={{ ...inputStyle, paddingLeft: "1.75rem" }}
          />
        </div>
        <button
          type="button"
          onClick={() => handleSearch(address)}
          disabled={searching || !address.trim() || locked}
          style={{
            display: "flex", alignItems: "center", gap: "0.2rem",
            padding: "0.35rem 0.6rem", borderRadius: "6px", border: "none",
            background: address.trim() ? "#F7BB2E" : "var(--border)",
            color: address.trim() ? "#0D0D0D" : "var(--muted-foreground)",
            cursor: address.trim() && !locked ? "pointer" : "default",
            fontSize: "0.75rem", fontWeight: 600, flexShrink: 0,
          }}
        >
          {searching ? <Loader2 style={{ width: 12, height: 12, animation: "spin 1s linear infinite" }} /> : <Search style={{ width: 12, height: 12 }} />}
        </button>
      </div>

      {error && (
        <p style={{ fontSize: "0.7rem", color: "#f87171", margin: 0 }}>{error}</p>
      )}

      {/* Map */}
      <div style={{ height: 280, borderRadius: "8px", overflow: "hidden", border: "1px solid var(--border)" }}>
        <LeafletMap
          lat={center.lat}
          lng={center.lng}
          zoom={zoom}
          hasMarker={!!value}
          onMarkerDrag={handleMarkerDrag}
          onZoomChange={handleZoomChange}
          locked={locked}
        />
      </div>

      {/* Coordinates (read-only) */}
      {value && (
        <div style={{ display: "flex", gap: "0.5rem", fontSize: "0.65rem", color: "var(--muted-foreground)", fontFamily: "monospace" }}>
          <span>lat: {value.lat.toFixed(6)}</span>
          <span>lng: {value.lng.toFixed(6)}</span>
          <span>zoom: {value.zoom}</span>
        </div>
      )}
    </div>
  );
}

"use client";

import { useEffect, useRef } from "react";

interface MapEmbedProps {
  lat: number;
  lng: number;
  address?: string;
  zoom?: number;
}

/**
 * OpenStreetMap embed using Leaflet (loaded dynamically).
 * No API key required.
 */
export function MapEmbed({ lat, lng, address, zoom = 13 }: MapEmbedProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<unknown>(null);

  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;

    // Load Leaflet CSS
    if (!document.querySelector('link[href*="leaflet"]')) {
      const link = document.createElement("link");
      link.rel = "stylesheet";
      link.href = "https://unpkg.com/leaflet@1.9.4/dist/leaflet.css";
      document.head.appendChild(link);
    }

    // Load Leaflet JS
    const script = document.createElement("script");
    script.src = "https://unpkg.com/leaflet@1.9.4/dist/leaflet.js";
    script.onload = () => {
      const L = (window as unknown as Record<string, unknown>).L as {
        map: (el: HTMLElement) => {
          setView: (
            latlng: [number, number],
            zoom: number
          ) => { addLayer: (layer: unknown) => void };
        };
        tileLayer: (
          url: string,
          opts: Record<string, unknown>
        ) => unknown;
        marker: (latlng: [number, number]) => {
          addTo: (map: unknown) => { bindPopup: (html: string) => { openPopup: () => void } };
        };
      };

      if (!L || !containerRef.current) return;

      const map = L.map(containerRef.current).setView([lat, lng], zoom);
      mapRef.current = map;

      map.addLayer(
        L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
          attribution:
            '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
          maxZoom: 19,
        })
      );

      if (address) {
        L.marker([lat, lng])
          .addTo(map)
          .bindPopup(address)
          .openPopup();
      }
    };

    document.head.appendChild(script);
  }, [lat, lng, address, zoom]);

  return (
    <div
      ref={containerRef}
      className="mt-6 rounded-lg overflow-hidden border border-border"
      style={{ height: 400, width: "100%" }}
    />
  );
}

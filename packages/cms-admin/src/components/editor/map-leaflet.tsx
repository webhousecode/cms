"use client";

/**
 * F96 — Leaflet map component (client-only, no SSR)
 * Uses OpenStreetMap tiles — free, no API key required.
 */
import { useEffect, useRef } from "react";
import L from "leaflet";
import "leaflet/dist/leaflet.css";

// Fix Leaflet default icon issue with bundlers
const defaultIcon = L.icon({
  iconUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png",
  iconRetinaUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png",
  shadowUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png",
  iconSize: [25, 41],
  iconAnchor: [12, 41],
  popupAnchor: [1, -34],
  shadowSize: [41, 41],
});

interface Props {
  lat: number;
  lng: number;
  zoom: number;
  hasMarker: boolean;
  onMarkerDrag: (lat: number, lng: number) => void;
  onZoomChange: (zoom: number) => void;
  locked?: boolean;
}

export default function MapLeaflet({ lat, lng, zoom, hasMarker, onMarkerDrag, onZoomChange, locked }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<L.Map | null>(null);
  const markerRef = useRef<L.Marker | null>(null);

  // Initialize map
  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;

    const map = L.map(containerRef.current, {
      center: [lat, lng],
      zoom,
      zoomControl: true,
      attributionControl: true,
    });

    L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
      maxZoom: 19,
    }).addTo(map);

    map.on("zoomend", () => {
      onZoomChange(map.getZoom());
    });

    // Click to place/move marker
    if (!locked) {
      map.on("click", (e: L.LeafletMouseEvent) => {
        const { lat: clickLat, lng: clickLng } = e.latlng;
        if (markerRef.current) {
          markerRef.current.setLatLng([clickLat, clickLng]);
        } else {
          const marker = L.marker([clickLat, clickLng], { icon: defaultIcon, draggable: true }).addTo(map);
          marker.on("dragend", () => {
            const pos = marker.getLatLng();
            onMarkerDrag(pos.lat, pos.lng);
          });
          markerRef.current = marker;
        }
        onMarkerDrag(clickLat, clickLng);
      });
    }

    mapRef.current = map;

    return () => {
      map.remove();
      mapRef.current = null;
      markerRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Update map center when lat/lng changes
  useEffect(() => {
    if (!mapRef.current) return;
    mapRef.current.setView([lat, lng], zoom, { animate: true });

    if (hasMarker) {
      if (markerRef.current) {
        markerRef.current.setLatLng([lat, lng]);
      } else {
        const marker = L.marker([lat, lng], { icon: defaultIcon, draggable: !locked }).addTo(mapRef.current);
        marker.on("dragend", () => {
          const pos = marker.getLatLng();
          onMarkerDrag(pos.lat, pos.lng);
        });
        markerRef.current = marker;
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lat, lng, zoom, hasMarker]);

  return <div ref={containerRef} style={{ width: "100%", height: "100%" }} />;
}

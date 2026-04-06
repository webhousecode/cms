"use client";

import { Heart } from "lucide-react";
import { useFavorites } from "@/lib/hooks/use-favorites";
import type { Favorite } from "@/lib/user-state";

interface Props extends Omit<Favorite, "id" | "addedAt"> {
  size?: number;
}

/**
 * F94 — Heart toggle button.
 * Click to add/remove the current item from favorites.
 */
export function FavoriteToggle({ type, label, path, icon, collection, slug, size = 16 }: Props) {
  const { isFavorite, toggle } = useFavorites();
  const active = isFavorite(path);

  return (
    <button
      type="button"
      onClick={() => toggle({ type, label, path, icon, collection, slug })}
      title={active ? "Remove from favorites" : "Add to favorites"}
      aria-label={active ? "Remove from favorites" : "Add to favorites"}
      style={{
        background: "none",
        border: "none",
        cursor: "pointer",
        padding: "0.25rem",
        display: "inline-flex",
        alignItems: "center",
        color: active ? "#ef4444" : "var(--muted-foreground)",
        transition: "color 0.15s",
      }}
      onMouseEnter={(e) => {
        if (!active) (e.currentTarget as HTMLButtonElement).style.color = "#ef4444";
      }}
      onMouseLeave={(e) => {
        if (!active) (e.currentTarget as HTMLButtonElement).style.color = "var(--muted-foreground)";
      }}
    >
      <Heart
        style={{ width: size, height: size }}
        fill={active ? "#ef4444" : "none"}
        strokeWidth={active ? 0 : 1.75}
      />
    </button>
  );
}

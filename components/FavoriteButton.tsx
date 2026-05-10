"use client";
import { Heart } from "lucide-react";
import { useFavorites } from "@/lib/favorites";

type Props = {
  slug: string;
  className?: string;
  size?: "sm" | "md";
};

export function FavoriteButton({ slug, className = "", size = "md" }: Props) {
  const { isFavorite, toggle } = useFavorites();
  const fav = isFavorite(slug);
  const dim = size === "sm" ? "size-8" : "size-10";
  const icon = size === "sm" ? "size-4" : "size-5";
  return (
    <button
      type="button"
      aria-label={fav ? "Remove from favorites" : "Add to favorites"}
      aria-pressed={fav}
      onClick={(e) => {
        e.preventDefault();
        e.stopPropagation();
        toggle(slug);
      }}
      className={`grid place-items-center ${dim} rounded-full bg-black/55 backdrop-blur text-white active:scale-90 transition ${className}`}
    >
      <Heart className={`${icon} transition`} fill={fav ? "#ef4444" : "none"} stroke={fav ? "#ef4444" : "currentColor"} />
    </button>
  );
}

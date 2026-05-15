"use client";
import { Snowflake, Check } from "lucide-react";
import { useActiveResort } from "@/lib/active-resort";

export function ActiveResortButton({ slug, className = "" }: { slug: string; className?: string }) {
  const { isActive, toggle } = useActiveResort();
  const active = isActive(slug);
  return (
    <button
      onClick={() => toggle(slug)}
      aria-pressed={active}
      aria-label={active ? "Unset ski mode" : "Set ski mode"}
      title={active ? "Ski mode active" : "Set ski mode"}
      className={`grid place-items-center size-10 rounded-full shadow-lg backdrop-blur transition active:scale-95 ${
        active ? "bg-[color:var(--accent)] text-white" : "bg-black/55 text-white"
      } ${className}`}
    >
      {active ? <Check className="size-5" /> : <Snowflake className="size-5" />}
    </button>
  );
}

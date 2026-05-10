"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Compass, Search, Heart } from "lucide-react";
import { cn } from "@/lib/utils";

const items = [
  { href: "/", label: "Explore", icon: Compass },
  { href: "/search", label: "Search", icon: Search },
  { href: "/saved", label: "Saved", icon: Heart },
];

export function BottomNav() {
  const pathname = usePathname();
  return (
    <nav
      className="fixed bottom-0 left-1/2 -translate-x-1/2 w-full max-w-[540px] z-40"
      style={{ paddingBottom: "env(safe-area-inset-bottom)" }}
    >
      <div className="mx-3 mb-3 rounded-2xl bg-[color:var(--card)]/85 backdrop-blur-xl border border-[color:var(--border)] shadow-[0_8px_30px_rgba(2,6,23,0.25)]">
        <ul className="grid grid-cols-3">
          {items.map(({ href, label, icon: Icon }) => {
            const active =
              href === "/"
                ? pathname === "/" || pathname?.startsWith("/resort")
                : pathname === href || pathname?.startsWith(href);
            return (
              <li key={href}>
                <Link
                  href={href}
                  className={cn(
                    "flex flex-col items-center gap-1 py-3 text-xs font-medium transition-colors",
                    active ? "text-[color:var(--accent)]" : "text-[color:var(--muted-foreground)] hover:text-[color:var(--foreground)]",
                  )}
                >
                  <Icon className="size-5" strokeWidth={2.2} />
                  <span>{label}</span>
                </Link>
              </li>
            );
          })}
        </ul>
      </div>
    </nav>
  );
}

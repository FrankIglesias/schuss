"use client";
import { useSyncExternalStore } from "react";

const KEY = "piste:active-resort";

function read(): string | null {
  if (typeof window === "undefined") return null;
  try {
    return localStorage.getItem(KEY);
  } catch {
    return null;
  }
}

const listeners = new Set<() => void>();
function emit() {
  for (const l of listeners) l();
}

function subscribe(fn: () => void) {
  listeners.add(fn);
  const onStorage = (e: StorageEvent) => {
    if (e.key === KEY) fn();
  };
  window.addEventListener("storage", onStorage);
  return () => {
    listeners.delete(fn);
    window.removeEventListener("storage", onStorage);
  };
}

let cache: string | null | undefined = undefined;
function getSnapshot(): string | null {
  if (cache === undefined) cache = read();
  return cache;
}

function write(next: string | null) {
  cache = next;
  try {
    if (next) localStorage.setItem(KEY, next);
    else localStorage.removeItem(KEY);
  } catch {}
  emit();
}

export function useActiveResort() {
  const slug = useSyncExternalStore(subscribe, getSnapshot, () => null);
  return {
    activeSlug: slug,
    isActive: (s: string) => slug === s,
    setActive: (s: string | null) => write(s),
    toggle: (s: string) => write(getSnapshot() === s ? null : s),
  };
}

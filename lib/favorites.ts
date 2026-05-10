"use client";
import { useSyncExternalStore } from "react";

const KEY = "piste:favorites";

function read(): Set<string> {
  if (typeof window === "undefined") return new Set();
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return new Set();
    const arr = JSON.parse(raw) as unknown;
    return Array.isArray(arr) ? new Set(arr.filter((v): v is string => typeof v === "string")) : new Set();
  } catch {
    return new Set();
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

let cache: Set<string> | null = null;
function getSnapshot(): Set<string> {
  if (!cache) cache = read();
  return cache;
}

function write(next: Set<string>) {
  cache = next;
  try {
    localStorage.setItem(KEY, JSON.stringify([...next]));
  } catch {}
  emit();
}

const EMPTY = new Set<string>();

export function useFavorites() {
  const set = useSyncExternalStore(subscribe, getSnapshot, () => EMPTY);
  return {
    favorites: set,
    isFavorite: (slug: string) => set.has(slug),
    toggle: (slug: string) => {
      const next = new Set(getSnapshot());
      if (next.has(slug)) next.delete(slug);
      else next.add(slug);
      write(next);
    },
  };
}

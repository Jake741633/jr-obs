"use client";

import { useCallback, useEffect, useRef, useState } from "react";

export function makeId(prefix: string) {
  return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

export function useLocalStorageCollection<T>(key: string, initialValue: T[] = []) {
  const initialValueRef = useRef(initialValue);
  const [items, setItems] = useState<T[]>(initialValue);
  const [isReady, setIsReady] = useState(false);

  useEffect(() => {
    try {
      const saved = window.localStorage.getItem(key);
      setItems(saved ? (JSON.parse(saved) as T[]) : initialValueRef.current);
    } catch {
      setItems(initialValueRef.current);
    } finally {
      setIsReady(true);
    }
  }, [key]);

  useEffect(() => {
    if (!isReady) return;
    window.localStorage.setItem(key, JSON.stringify(items));
  }, [items, isReady, key]);

  const remove = useCallback((predicate: (item: T) => boolean) => {
    setItems((current) => current.filter((item) => !predicate(item)));
  }, []);

  return { items, setItems, remove, isReady };
}

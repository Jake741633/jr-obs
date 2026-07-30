"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { createCollectionRepository, type RepositoryRecord } from "./cloud/adapter";
import { collectionCloudTarget } from "./cloud/collections";
import { useCloudIdentity } from "./cloud/useCloudIdentity";

export function makeId(prefix: string) {
  return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

function readLocal<T>(key: string, fallback: T[]) {
  try {
    const saved = window.localStorage.getItem(key);
    return saved ? (JSON.parse(saved) as T[]) : fallback;
  } catch {
    return fallback;
  }
}

function recordId(value: unknown) {
  return typeof value === "object" && value !== null && "id" in value && typeof (value as { id?: unknown }).id === "string"
    ? (value as { id: string }).id
    : null;
}

export function useLocalStorageCollection<T>(key: string, initialValue: T[] = []) {
  const initialValueRef = useRef(initialValue);
  const [items, setItems] = useState<T[]>(initialValue);
  const [isReady, setIsReady] = useState(false);
  const previousRef = useRef<T[]>(initialValue);
  const suppressSyncRef = useRef(true);
  const { identity, isReady: identityReady, mode } = useCloudIdentity();
  const target = collectionCloudTarget(key);

  useEffect(() => {
    if (!identityReady) return;
    let active = true;
    suppressSyncRef.current = true;
    setIsReady(false);

    void (async () => {
      const local = readLocal(key, initialValueRef.current);
      let loaded = local;
      if (target && identity) {
        const repository = createCollectionRepository<RepositoryRecord>({
          storageKey: key,
          table: target.table,
          collectionKey: target.collectionKey,
          organisationId: identity.organisationId,
          userId: identity.userId,
        });
        loaded = await repository.list() as T[];
      }
      if (!active) return;
      previousRef.current = loaded;
      setItems(loaded);
      setIsReady(true);
      queueMicrotask(() => { suppressSyncRef.current = false; });
    })();

    return () => { active = false; };
  }, [identity, identityReady, key, mode, target?.collectionKey, target?.table]);

  useEffect(() => {
    if (!isReady) return;
    window.localStorage.setItem(key, JSON.stringify(items));
    if (suppressSyncRef.current || !target || !identity || mode === "local") {
      previousRef.current = items;
      return;
    }

    const previous = previousRef.current;
    const previousById = new Map(previous.map((item) => [recordId(item), item]).filter(([id]) => Boolean(id)) as [string, T][]);
    const nextById = new Map(items.map((item) => [recordId(item), item]).filter(([id]) => Boolean(id)) as [string, T][]);
    const repository = createCollectionRepository<RepositoryRecord>({
      storageKey: key,
      table: target.table,
      collectionKey: target.collectionKey,
      organisationId: identity.organisationId,
      userId: identity.userId,
    });

    for (const [id, item] of nextById) {
      const before = previousById.get(id);
      if (!before || JSON.stringify(before) !== JSON.stringify(item)) repository.save(item as RepositoryRecord);
    }
    for (const id of previousById.keys()) {
      if (!nextById.has(id)) repository.remove(id);
    }
    previousRef.current = items;
  }, [identity, isReady, items, key, mode, target]);

  const remove = useCallback((predicate: (item: T) => boolean) => {
    setItems((current) => current.filter((item) => !predicate(item)));
  }, []);

  return { items, setItems, remove, isReady };
}

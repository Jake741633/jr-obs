"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
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

export function useCloudLocalCollection<T>(key: string, initialValue: T[] = []) {
  const initialValueRef = useRef(initialValue);
  const [items, setItems] = useState<T[]>(initialValue);
  const [isReady, setIsReady] = useState(false);
  const previousRef = useRef<T[]>(initialValue);
  const suppressSyncRef = useRef(true);
  const { identity, isReady: identityReady, mode } = useCloudIdentity();
  const target = useMemo(() => collectionCloudTarget(key), [key]);
  const organisationId = identity?.organisationId;
  const userId = identity?.userId;

  useEffect(() => {
    if (!identityReady) return;
    let active = true;
    suppressSyncRef.current = true;

    async function loadCollection() {
      const local = readLocal(key, initialValueRef.current);
      let loaded = local;

      if (target && organisationId && userId) {
        const repository = createCollectionRepository<RepositoryRecord>({
          storageKey: key,
          table: target.table,
          collectionKey: target.collectionKey,
          organisationId,
          userId,
        });
        loaded = await repository.list() as T[];
      }

      if (!active) return;
      previousRef.current = loaded;
      setItems(loaded);
      setIsReady(true);
      queueMicrotask(() => {
        suppressSyncRef.current = false;
      });
    }

    void loadCollection();
    return () => {
      active = false;
    };
  }, [identityReady, key, mode, organisationId, target, userId]);

  useEffect(() => {
    if (!isReady) return;
    window.localStorage.setItem(key, JSON.stringify(items));

    if (suppressSyncRef.current || !target || !organisationId || !userId || mode === "local") {
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
      organisationId,
      userId,
    });

    for (const [id, item] of nextById) {
      const before = previousById.get(id);
      if (!before || JSON.stringify(before) !== JSON.stringify(item)) repository.save(item as unknown as RepositoryRecord);
    }
    for (const id of previousById.keys()) {
      if (!nextById.has(id)) repository.remove(id);
    }
    previousRef.current = items;
  }, [isReady, items, key, mode, organisationId, target, userId]);

  const remove = useCallback((predicate: (item: T) => boolean) => {
    setItems((current) => current.filter((item) => !predicate(item)));
  }, []);

  return { items, setItems, remove, isReady };
}

export const useLocalStorageCollection = useCloudLocalCollection;

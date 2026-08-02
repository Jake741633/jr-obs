"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createCollectionRepository, organisationStorageKey, type RepositoryRecord } from "./cloud/adapter";
import { collectionCloudTarget } from "./cloud/collections";
import { cloudSafeFileRecord, usePrivateFileCollectionBridge } from "./cloud/privateFiles";
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
  const activeStorageKey = organisationId ? organisationStorageKey(key, organisationId) : key;

  useEffect(() => {
    if (!identityReady) return;
    let active = true;
    suppressSyncRef.current = true;
    setIsReady(false);

    async function loadCollection() {
      let loaded = readLocal(activeStorageKey, initialValueRef.current);

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
  }, [activeStorageKey, identityReady, key, mode, organisationId, target, userId]);

  useEffect(() => {
    if (!isReady) return;
    window.localStorage.setItem(activeStorageKey, JSON.stringify(items));

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
      if (!before || JSON.stringify(before) !== JSON.stringify(item)) {
        repository.save(cloudSafeFileRecord(key, item as unknown as object) as RepositoryRecord);
      }
    }
    for (const id of previousById.keys()) {
      if (!nextById.has(id)) repository.remove(id);
    }
    previousRef.current = items;
  }, [activeStorageKey, isReady, items, key, mode, organisationId, target, userId]);

  const displayItems = usePrivateFileCollectionBridge({ storageKey: activeStorageKey, items, setItems, isReady, identity, mode });

  const remove = useCallback((predicate: (item: T) => boolean) => {
    setItems((current) => current.filter((item) => !predicate(item)));
  }, []);

  return { items: displayItems, setItems, remove, isReady };
}

export const useLocalStorageCollection = useCloudLocalCollection;

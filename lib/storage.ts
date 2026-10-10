"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { accountStorageKey, createCollectionRepository, type RecordCreatorMap, type RepositoryRecord } from "./cloud/adapter";
import { collectionCloudTarget } from "./cloud/collections";
import { cloudSafeFileRecord, usePrivateFileCollectionBridge } from "./cloud/privateFiles";
import { purgeCustomerNetworkOnlyCollectionCaches, purgeElectricianNetworkOnlyCollectionCaches, purgeRoleProjectionCacheStorage, roleProjectionCachePolicy } from "./cloud/roleProjectionCache-core.mjs";
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
  const [createdBySourceId, setCreatedBySourceId] = useState<RecordCreatorMap>({});
  const [isReady, setIsReady] = useState(false);
  const previousRef = useRef<T[]>(initialValue);
  const suppressSyncRef = useRef(true);
  const { identity, isReady: identityReady, mode } = useCloudIdentity();
  const target = useMemo(() => collectionCloudTarget(key), [key]);
  const organisationId = identity?.organisationId;
  const userId = identity?.userId;
  const cacheUserId = userId;
  const cacheRole = identity?.role;
  const cacheCustomerSourceId = identity?.customerSourceId;
  const activeStorageKey = organisationId ? accountStorageKey(key, organisationId, cacheUserId, cacheRole, cacheCustomerSourceId) : key;
  const networkOnly = roleProjectionCachePolicy({ storageKey: key, role: cacheRole, mode }) === "network-only";

  useEffect(() => {
    if (identityReady) return;
    suppressSyncRef.current = true;
    previousRef.current = initialValueRef.current;
    setItems(initialValueRef.current);
    setCreatedBySourceId({});
    setIsReady(false);
  }, [identityReady]);

  useEffect(() => {
    if (!identityReady) return;
    let active = true;
    suppressSyncRef.current = true;

    async function loadCollection() {
      await Promise.resolve();
      if (!active) return;
      setIsReady(false);

      let loaded = readLocal(activeStorageKey, initialValueRef.current);
      let loadedCreators: RecordCreatorMap = {};

      if (target && organisationId && userId) {
        const repository = createCollectionRepository<RepositoryRecord>({
          storageKey: key,
          table: target.table,
          collectionKey: target.collectionKey,
          organisationId,
          userId,
          cacheUserId,
          cacheRole,
          cacheCustomerSourceId,
        });
        loaded = await repository.list() as T[];
        loadedCreators = repository.recordCreators();
      }

      if (!active) return;
      previousRef.current = loaded;
      setItems(loaded);
      setCreatedBySourceId(loadedCreators);
      setIsReady(true);
      queueMicrotask(() => {
        suppressSyncRef.current = false;
      });
    }

    void loadCollection();
    return () => {
      active = false;
    };
  }, [activeStorageKey, cacheCustomerSourceId, cacheRole, cacheUserId, identityReady, key, mode, organisationId, target, userId]);

  useEffect(() => {
    if (!isReady) return;
    if (mode !== "local" && userId && cacheRole) {
      purgeCustomerNetworkOnlyCollectionCaches(window.localStorage, key);
      purgeElectricianNetworkOnlyCollectionCaches(window.localStorage, key);
    }
    if (networkOnly) {
      purgeRoleProjectionCacheStorage(window.localStorage, activeStorageKey);
      previousRef.current = items;
      return;
    }
    if (suppressSyncRef.current || !target || !organisationId || !userId || mode === "local") {
      window.localStorage.setItem(activeStorageKey, JSON.stringify(items));
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
      cacheUserId,
      cacheRole,
      cacheCustomerSourceId,
    });
    let creatorMetadataChanged = false;

    for (const [id, item] of nextById) {
      const before = previousById.get(id);
      if (!before || JSON.stringify(before) !== JSON.stringify(item)) {
        repository.save(
          cloudSafeFileRecord(key, item as unknown as object) as RepositoryRecord,
          before ? undefined : 0,
        );
        if (!before) creatorMetadataChanged = true;
      }
    }
    for (const id of previousById.keys()) {
      if (!nextById.has(id)) {
        repository.remove(id);
        creatorMetadataChanged = true;
      }
    }
    if (creatorMetadataChanged) setCreatedBySourceId(repository.recordCreators());
    // Each changed record is already durable. Mirror render ordering only after
    // every required queue write succeeds, using the same file-safe payloads.
    try {
      window.localStorage.setItem(activeStorageKey, JSON.stringify(items.map((item) => cloudSafeFileRecord(key, item as unknown as object))));
    } catch { /* Keep the repository's persisted records if this ordering write fails. */ }
    previousRef.current = items;
  }, [activeStorageKey, cacheCustomerSourceId, cacheRole, cacheUserId, isReady, items, key, mode, networkOnly, organisationId, target, userId]);

  useEffect(() => {
    function reconcileCloudCache(event: Event) {
      const detail = (event as CustomEvent<{ storageKey?: string; sourceId?: string; payload?: T }>).detail;
      if (!detail || detail.storageKey !== activeStorageKey || !detail.sourceId || !detail.payload) return;
      suppressSyncRef.current = true;
      setItems((current) => {
        const index = current.findIndex((item) => recordId(item) === detail.sourceId);
        const next = index < 0
          ? [detail.payload as T, ...current]
          : current.map((item, itemIndex) => itemIndex === index ? detail.payload as T : item);
        previousRef.current = next;
        return next;
      });
      queueMicrotask(() => { suppressSyncRef.current = false; });
    }

    window.addEventListener("jr-os-cloud-cache-reconciled", reconcileCloudCache);
    return () => window.removeEventListener("jr-os-cloud-cache-reconciled", reconcileCloudCache);
  }, [activeStorageKey]);

  const { items: displayItems } = usePrivateFileCollectionBridge({ storageKey: key, items, setItems, isReady, identity, mode });

  const remove = useCallback((predicate: (item: T) => boolean) => {
    setItems((current) => current.filter((item) => !predicate(item)));
  }, []);

  const createItem = useCallback((item: T) => {
    const id = recordId(item);
    if (!isReady) throw new Error("Collection is not ready for record creation.");
    if (!id) throw new Error("A new collection record requires a stable id.");
    if (networkOnly) throw new Error("This live capability collection is read-only and cannot be stored on this device.");

    const current = previousRef.current;
    if (current.some((record) => recordId(record) === id)) {
      throw new Error("A collection record with this id already exists.");
    }
    const next = [item, ...current];

    if (target && organisationId && userId) {
      const repository = createCollectionRepository<RepositoryRecord>({
        storageKey: key,
        table: target.table,
        collectionKey: target.collectionKey,
        organisationId,
        userId,
        cacheUserId,
        cacheRole,
        cacheCustomerSourceId,
      });
      repository.save(cloudSafeFileRecord(key, item as unknown as object) as RepositoryRecord, 0);
      setCreatedBySourceId(repository.recordCreators());
    } else {
      window.localStorage.setItem(activeStorageKey, JSON.stringify(next));
    }

    previousRef.current = next;
    setItems(next);
    return item;
  }, [activeStorageKey, cacheCustomerSourceId, cacheRole, cacheUserId, isReady, key, networkOnly, organisationId, target, userId]);

  const updateItem = useCallback((id: string, update: (current: T) => T) => {
    if (!isReady) throw new Error("Collection is not ready for record updates.");
    if (networkOnly) throw new Error("This live capability collection is read-only and cannot be stored on this device.");
    const current = previousRef.current;
    const index = current.findIndex((record) => recordId(record) === id);
    if (!id || index < 0) throw new Error("The collection record is no longer available. Reload and review it before retrying.");
    const item = update(current[index]);
    if (recordId(item) !== id) throw new Error("A record update must retain its existing id.");
    if (item === current[index]) return item;
    const next = current.map((record, recordIndex) => recordIndex === index ? item : record);

    if (target && organisationId && userId) {
      const repository = createCollectionRepository<RepositoryRecord>({ storageKey: key, table: target.table, collectionKey: target.collectionKey, organisationId, userId, cacheUserId, cacheRole, cacheCustomerSourceId });
      repository.save(cloudSafeFileRecord(key, item as unknown as object) as RepositoryRecord);
    } else {
      window.localStorage.setItem(activeStorageKey, JSON.stringify(next));
    }
    previousRef.current = next;
    setItems(next);
    return item;
  }, [activeStorageKey, cacheCustomerSourceId, cacheRole, cacheUserId, isReady, key, networkOnly, organisationId, target, userId]);

  const removeItem = useCallback((id: string, validate?: (current: T) => void) => {
    if (!isReady) throw new Error("Collection is not ready for record deletion.");
    if (networkOnly) throw new Error("This live capability collection is read-only and cannot be stored on this device.");
    const current = previousRef.current;
    const item = current.find((record) => recordId(record) === id);
    if (!id || !item) throw new Error("The collection record is no longer available. Reload and review it before retrying.");
    validate?.(item);
    const next = current.filter((record) => recordId(record) !== id);
    if (target && organisationId && userId) {
      const repository = createCollectionRepository<RepositoryRecord>({ storageKey: key, table: target.table, collectionKey: target.collectionKey, organisationId, userId, cacheUserId, cacheRole, cacheCustomerSourceId });
      repository.remove(id);
      setCreatedBySourceId(repository.recordCreators());
    } else {
      window.localStorage.setItem(activeStorageKey, JSON.stringify(next));
    }
    previousRef.current = next;
    setItems(next);
    return item;
  }, [activeStorageKey, cacheCustomerSourceId, cacheRole, cacheUserId, isReady, key, networkOnly, organisationId, target, userId]);

  return { items: displayItems, setItems, createItem, updateItem, removeItem, remove, isReady, createdBySourceId };
}

export const useLocalStorageCollection = useCloudLocalCollection;

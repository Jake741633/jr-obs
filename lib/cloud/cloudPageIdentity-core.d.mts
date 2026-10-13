import type { CloudIdentity } from "./useCloudIdentity";
import type { SupabaseSession } from "../supabase/client";

export interface CloudAccountUser {
  id: string;
  email?: string;
}

export interface CloudPageIdentity extends CloudIdentity {
  key: string;
}

export interface CloudPageOperation {
  token: number;
  action: string;
  ownerKey?: string | null;
}

export interface CloudPageOperationCoordinator {
  begin(action: string, ownerKey?: string | null): CloudPageOperation | null;
  current(): CloudPageOperation | null;
  isCurrent(expected: CloudPageOperation | null): boolean;
  finish(expected: CloudPageOperation): boolean;
  invalidate(): CloudPageOperation | null;
}

export interface OwnedCloudPageValue<T> {
  ownerKey: string;
  value: T;
}

export function cloudPageIdentityKey(identity: CloudIdentity | null): string | null;
export function normalCloudPageSessionUserId(session: SupabaseSession | null): string | null;
export function matchedCloudPageIdentity(identity: CloudIdentity | null, accountUser: CloudAccountUser | null, session: SupabaseSession | null): CloudPageIdentity | null;
export function canRetainSettledCloudIdentity(settled: CloudPageIdentity | null, isReady: boolean, session: SupabaseSession | null): boolean;
export function clearSubmittedValue(current: string, submitted: string, currentRevision: number, submittedRevision: number): string;
export function activeCloudPageOperationMatches(current: CloudPageOperation | null, expected: CloudPageOperation | null): boolean;
export function createCloudPageOperationCoordinator(): CloudPageOperationCoordinator;
export function ownedCloudPageValue<T>(owned: OwnedCloudPageValue<T> | null, ownerKey: string | null, fallback: T): T;
export function assertCloudPageOperationCurrent(isCurrent?: (() => boolean) | null): void;

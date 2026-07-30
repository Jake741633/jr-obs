"use client";

import { cloudUpsert } from "./client";

export type AuditedAction = "quote_approved" | "certificate_issued" | "payment_changed" | "user_permission_changed" | "record_deleted";

export async function writeAuditEvent(input: {
  businessId: string;
  action: AuditedAction;
  entityTable: string;
  sourceId?: string;
  beforeData?: unknown;
  afterData?: unknown;
}) {
  const id = `audit_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  return cloudUpsert("audit_log", [{
    id,
    business_id: input.businessId,
    source_id: id,
    action: input.action,
    entity_table: input.entityTable,
    entity_source_id: input.sourceId,
    before_data: input.beforeData,
    after_data: input.afterData,
  }]);
}

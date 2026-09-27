"use client";

import { cloudInsert } from "./client";

export type AuditedAction = "quote_approved" | "certificate_issued" | "payment_changed" | "user_permission_changed" | "record_deleted";

export async function writeAuditEvent(input: {
  organisationId: string;
  action: AuditedAction;
  entityTable: string;
  sourceId?: string;
  beforeData?: unknown;
  afterData?: unknown;
}) {
  return cloudInsert("audit_log", [{
    organisation_id: input.organisationId,
    action: input.action,
    entity_table: input.entityTable,
    source_id: input.sourceId,
    before_data: input.beforeData,
    after_data: input.afterData,
  }]);
}

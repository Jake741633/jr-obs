export type FieldMutationBaseIntent = "create" | "update" | "unknown";

export type CloudMutationRoute =
  | { kind: "direct" }
  | { kind: "deny" }
  | {
      kind: "rpc";
      functionName: "jr_field_update_job_status" | "jr_field_save_collection";
      resource: "jobs" | "cloud_collections";
      allowedIntents: FieldMutationBaseIntent[];
    };

export function collectionCloudMutationRoute(
  table: string,
  role?: string,
  collectionKey?: string,
): CloudMutationRoute;

export function fieldMutationRouteAllows(
  route: CloudMutationRoute,
  operation: "upsert" | "delete",
  baseIntent?: FieldMutationBaseIntent,
): boolean;

export function normaliseFieldRequestedJobStatus(status: unknown): unknown;

export function isServerAuthoredFieldTimeline(
  table: string,
  role: string | undefined,
  collectionKey: string | undefined,
  payload: unknown,
): boolean;

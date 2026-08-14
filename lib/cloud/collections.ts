import {
  isGenericCloudCollectionStorageKey,
  typedCollectionTables,
} from "./migrationStoragePolicy-core.mjs";
export { collectionCloudMutationRoute, fieldMutationRouteAllows, isServerAuthoredFieldTimeline, normaliseFieldRequestedJobStatus } from "./fieldMutationPolicy-core.mjs";

export { typedCollectionTables };

const roleReadTables: Record<string, Record<string, string>> = {
  customer: {
    certificates: "customer_certificates",
    customers: "portal_customers",
    invoices: "customer_invoices",
    jobs: "customer_jobs",
    payments: "customer_payments",
    pricing_documents: "customer_pricing_documents",
  },
  electrician: {
    builders: "field_builders",
    cloud_collections: "field_cloud_collections",
    customers: "field_customers",
    jobs: "field_jobs",
    materials: "field_materials",
    purchase_lists: "field_purchase_lists",
    stock_items: "field_stock_items",
    team_members: "field_team_members",
  },
};

const roleCollectionReadTables: Record<string, Record<string, string>> = {
  customer: {
    "jr-os-deposit-requirements": "customer_deposit_requirements",
    "jr-os-job-timeline": "customer_job_timeline",
    "jr-os-portal-payment-links": "customer_portal_payment_links",
  },
};

export function collectionCloudTarget(storageKey: string) {
  const typedTable = typedCollectionTables[storageKey];
  if (typedTable) return { table: typedTable };
  if (isGenericCloudCollectionStorageKey(storageKey)) return { table: "cloud_collections", collectionKey: storageKey };
  return null;
}

export function collectionCloudReadTable(table: string, role?: string, collectionKey?: string) {
  const collectionReadTable = role && collectionKey ? roleCollectionReadTables[role]?.[collectionKey] : undefined;
  return collectionReadTable ?? (role ? roleReadTables[role]?.[table] ?? table : table);
}

export const typedCollectionTables: Record<string, string> = {
  "jr-os-customers": "customers",
  "jr-os-builders": "builders",
  "jr-os-jobs": "jobs",
  "jr-os-pricing-documents": "pricing_documents",
  "jr-os-invoices": "invoices",
  "jr-os-payments": "payments",
  "jr-os-expenses": "expenses",
  "jr-os-materials": "materials",
  "jr-os-stock-items": "stock_items",
  "jr-os-stock-movements": "stock_movements",
  "jr-os-purchase-lists": "purchase_lists",
  "jr-os-planner": "planner_entries",
  "jr-os-team": "team_members",
  "jr-os-timesheets": "timesheets",
  "jr-os-certificates": "certificates",
  "jr-os-electrical-testing-records": "electrical_testing_records",
  "jr-os-job-documents": "job_documents",
  "jr-os-portal-approvals": "portal_approvals",
  "jr-os-portal-requests": "portal_requests",
  "jr-os-ai-recommendation-evidence": "ai_recommendation_evidence",
};

const roleReadTables: Record<string, Record<string, string>> = {
  customer: {
    customers: "portal_customers",
    jobs: "customer_jobs",
    pricing_documents: "customer_pricing_documents",
  },
  electrician: {
    cloud_collections: "field_cloud_collections",
    customers: "field_customers",
    jobs: "field_jobs",
    materials: "field_materials",
    purchase_lists: "field_purchase_lists",
    stock_items: "field_stock_items",
    team_members: "field_team_members",
  },
};

export function collectionCloudTarget(storageKey: string) {
  const typedTable = typedCollectionTables[storageKey];
  if (typedTable) return { table: typedTable };
  if (storageKey.startsWith("jr-os-")) return { table: "cloud_collections", collectionKey: storageKey };
  return null;
}

export function collectionCloudReadTable(table: string, role?: string) {
  return role ? roleReadTables[role]?.[table] ?? table : table;
}

export type JrRole = "owner" | "admin" | "office" | "electrician" | "customer";

const rolePages: Record<JrRole, string[]> = {
  owner: ["*"],
  admin: ["*"],
  office: ["/", "/menu", "/customers", "/builders", "/jobs", "/quotes", "/estimates", "/invoices", "/payments", "/expenses", "/materials", "/stock", "/purchases", "/planner", "/team", "/surveys", "/certificates", "/job-finance", "/finance-director", "/ai", "/cloud"],
  electrician: ["/", "/menu", "/jobs", "/planner", "/field", "/site-management", "/surveys", "/certificates", "/materials", "/stock", "/purchases", "/cloud"],
  customer: ["/customer-portal", "/cloud"],
};

export function canAccessPath(role: JrRole | undefined, path: string) {
  if (!role) return false;
  const allowed = rolePages[role];
  return allowed.includes("*") || allowed.some((entry) => path === entry || path.startsWith(`${entry}/`));
}

export function canManageUsers(role: JrRole | undefined) { return role === "owner" || role === "admin"; }
export function canDeleteRecords(role: JrRole | undefined) { return role === "owner" || role === "admin"; }
export function canEditFinance(role: JrRole | undefined) { return role === "owner" || role === "admin" || role === "office"; }
export function canEditFieldRecords(role: JrRole | undefined) { return role !== "customer" && Boolean(role); }

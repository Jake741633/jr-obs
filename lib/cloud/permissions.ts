export type JrRole = "owner" | "admin" | "office" | "electrician" | "customer";

const jrRoles = ["owner", "admin", "office", "electrician", "customer"] as const;

const rolePages: Record<JrRole, string[]> = {
  owner: ["*"],
  admin: ["*"],
  office: ["/", "/menu", "/customers", "/builders", "/crm", "/leads", "/jobs", "/quotes", "/price-book", "/room-estimator", "/estimates", "/invoices", "/payments", "/expenses", "/materials", "/stock", "/purchases", "/planner", "/team", "/surveys", "/certificates", "/job-finance", "/finance-director", "/ai", "/cloud"],
  electrician: ["/", "/menu", "/jobs", "/planner", "/field", "/site-management", "/surveys", "/certificates", "/materials", "/stock", "/purchases", "/cloud"],
  customer: ["/customer-portal", "/cloud"],
};

const operatorOnlyPaths = ["/release-readiness", "/cloud/cutover", "/cloud/queue"] as const;

function operatorEmails() {
  return (process.env.NEXT_PUBLIC_JR_OS_OPERATOR_EMAILS || "")
    .split(",")
    .map((email) => email.trim().toLowerCase())
    .filter(Boolean);
}

export function isJrRole(role: unknown): role is JrRole {
  return typeof role === "string" && jrRoles.includes(role as JrRole);
}

export function isOperatorOnlyPath(path: string) {
  return operatorOnlyPaths.some((entry) => path === entry || path.startsWith(`${entry}/`));
}

export function isJrOsOperator(role: JrRole | undefined, email?: string) {
  if (!isJrRole(role) || role !== "owner" || !email) return false;
  return operatorEmails().includes(email.trim().toLowerCase());
}

export function canAccessPath(role: JrRole | undefined, path: string, email?: string) {
  if (!isJrRole(role)) return false;
  if (isOperatorOnlyPath(path) && !isJrOsOperator(role, email)) return false;
  const allowed = rolePages[role];
  return allowed.includes("*") || allowed.some((entry) => path === entry || path.startsWith(`${entry}/`));
}

export function canManageUsers(role: JrRole | undefined) {
  return isJrRole(role) && (role === "owner" || role === "admin");
}

export function canDeleteRecords(role: JrRole | undefined) {
  return isJrRole(role) && (role === "owner" || role === "admin");
}

export function canEditFinance(role: JrRole | undefined) {
  return isJrRole(role) && (role === "owner" || role === "admin" || role === "office");
}

export function canEditFieldRecords(role: JrRole | undefined) {
  return isJrRole(role) && role !== "customer";
}

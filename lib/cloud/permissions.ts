export type JrRole = "owner" | "admin" | "office" | "electrician" | "customer";

const jrRoles = ["owner", "admin", "office", "electrician", "customer"] as const;

const rolePages: Record<JrRole, string[]> = {
  owner: ["*"],
  admin: ["*"],
  office: ["/", "/menu", "/customers", "/builders", "/crm", "/leads", "/jobs", "/quotes", "/price-book", "/room-estimator", "/estimates", "/invoices", "/payments", "/expenses", "/materials", "/stock", "/purchases", "/planner", "/team", "/surveys", "/certificates", "/job-finance", "/finance-director", "/ai", "/cloud"],
  electrician: ["/menu", "/jobs", "/field", "/surveys", "/cloud"],
  customer: ["/customer-portal", "/cloud"],
};

const operatorOnlyPaths = ["/release-readiness", "/cloud/cutover", "/cloud/queue"] as const;

type DeniedRouteHandoff = {
  deniedPath: string;
  href: string;
  title: string;
  description: string;
  actionLabel: string;
};

const electricianDeniedRouteHandoffs: DeniedRouteHandoff[] = [
  {
    deniedPath: "/planner",
    href: "/field/day-planner",
    title: "Use the engineer day planner",
    description: "Office controls recurring bookings, dispatch, staff assignments and vehicles. Open your assigned visits in the field-safe day planner instead.",
    actionLabel: "Open engineer day planner",
  },
  {
    deniedPath: "/materials",
    href: "/field/material-lookup",
    title: "Use field material lookup",
    description: "The Materials Library contains office-controlled catalogue and pricing changes. Search supplier stock codes from the read-only field lookup instead.",
    actionLabel: "Open field material lookup",
  },
  {
    deniedPath: "/stock",
    href: "/field/materials",
    title: "Use Mobile Materials",
    description: "Canonical stock adjustments are office-controlled. Review assigned field stock and material information in Mobile Materials instead.",
    actionLabel: "Open Mobile Materials",
  },
  {
    deniedPath: "/purchases",
    href: "/field/materials",
    title: "Use Mobile Materials",
    description: "Purchase-list changes are office-controlled. Review low-stock and material information in the field-safe Mobile Materials workspace instead.",
    actionLabel: "Open Mobile Materials",
  },
  {
    deniedPath: "/certificates",
    href: "/field/testing",
    title: "Use the electrical testing workspace",
    description: "Certificate authoring and issue are office-controlled. Capture assigned-job testing evidence in the field testing workspace instead.",
    actionLabel: "Open electrical testing",
  },
];

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

export function canUseLocalWorkspaceWithoutIdentity(
  mode: "local" | "cloud" | "migration",
  path: string,
) {
  return (mode === "local" || mode === "migration") && !isOperatorOnlyPath(path);
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

export function roleDeniedRouteHandoff(role: JrRole | undefined, path: string) {
  if (role !== "electrician") return null;
  return electricianDeniedRouteHandoffs.find((entry) => path === entry.deniedPath || path.startsWith(`${entry.deniedPath}/`)) ?? null;
}

export function roleLandingPath(role: JrRole | undefined) {
  if (role === "customer") return "/customer-portal";
  if (role === "electrician") return "/field";
  return "/";
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

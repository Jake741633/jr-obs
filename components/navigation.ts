import { BriefcaseBusiness, Building2, LayoutDashboard, Settings, Users } from "lucide-react";

export const primaryNavigation = [
  { label: "Command Centre", href: "/", icon: LayoutDashboard },
  { label: "Customers", href: "/customers", icon: Users },
  { label: "Builders", href: "/builders", icon: Building2 },
  { label: "Jobs", href: "/jobs", icon: BriefcaseBusiness },
  { label: "Settings", href: "/settings", icon: Settings },
];

export const secondaryNavigation = [
  ["Leads & Pipeline", "/leads"], ["CRM & Customer Care", "/crm"], ["Quotes", "/quotes"], ["Estimates", "/estimates"], ["Invoices", "/invoices"], ["Expenses & Receipts", "/expenses"], ["Job Finance", "/job-finance"], ["Materials", "/materials"], ["Stock Control", "/stock"], ["Purchase Lists", "/purchases"],
  ["Site Management", "/site-management"], ["RAMS & Risk Assessments", "/rams"], ["Resource Planner", "/planner"], ["Team & Timesheets", "/team"], ["Fleet & Assets", "/assets"], ["Surveys", "/surveys"], ["Certificates", "/certificates"], ["Job Packs", "/job-packs"], ["JR AI", "/ai"], ["Business", "/business"], ["Cloud & Account", "/cloud"],
] as const;
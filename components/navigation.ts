import { BriefcaseBusiness, Building2, LayoutDashboard, Settings, Users } from "lucide-react";

export const primaryNavigation = [
  { label: "Command Centre", href: "/", icon: LayoutDashboard },
  { label: "Customers", href: "/customers", icon: Users },
  { label: "Builders", href: "/builders", icon: Building2 },
  { label: "Jobs", href: "/jobs", icon: BriefcaseBusiness },
  { label: "Settings", href: "/settings", icon: Settings },
];

export const secondaryNavigation = [
  ["Quotes", "/quotes"], ["Estimates", "/estimates"], ["Invoices", "/invoices"], ["Job Finance", "/job-finance"], ["Materials", "/materials"], ["Purchase Lists", "/purchases"],
  ["Site Management", "/site-management"], ["Team & Timesheets", "/team"], ["Surveys", "/surveys"], ["Certificates", "/certificates"], ["Job Packs", "/job-packs"], ["JR AI", "/ai"], ["Business", "/business"], ["Cloud & Account", "/cloud"],
] as const;
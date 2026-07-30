import { BriefcaseBusiness, Building2, LayoutDashboard, Settings, Users } from "lucide-react";

export const primaryNavigation = [
  { label: "Command Centre", href: "/", icon: LayoutDashboard },
  { label: "Customers", href: "/customers", icon: Users },
  { label: "Builders", href: "/builders", icon: Building2 },
  { label: "Jobs", href: "/jobs", icon: BriefcaseBusiness },
  { label: "Settings", href: "/settings", icon: Settings },
];

export const secondaryNavigation = [
  ["Leads & Pipeline", "/leads"], ["CRM & Customer Care", "/crm"], ["Customer Portal", "/customer-portal"], ["Quotes", "/quotes"], ["Estimates", "/estimates"], ["Invoices", "/invoices"], ["Labour & Costs", "/labour-costs"], ["Expenses & Receipts", "/expenses"], ["Job Finance", "/job-finance"], ["Starter Library", "/starter-library"], ["Materials", "/materials"], ["Stock Control", "/stock"], ["Purchase Lists", "/purchases"],
  ["Site Management", "/site-management"], ["RAMS & Risk Assessments", "/rams"], ["Test Equipment & Compliance", "/test-equipment"], ["Resource Planner", "/planner"], ["Team & Timesheets", "/team"], ["Fleet & Assets", "/assets"], ["Surveys", "/surveys"], ["Certificates", "/certificates"], ["Job Packs", "/job-packs"], ["JR AI", "/ai"], ["AI Daily Briefing", "/ai/daily-briefing"], ["AI Quote Review", "/ai/quote-review"], ["AI Job Review", "/ai/job-review"], ["Business", "/business"], ["Release Readiness", "/release-readiness"], ["Cloud & Account", "/cloud"],
] as const;


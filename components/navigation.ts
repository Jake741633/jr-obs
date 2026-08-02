import { BriefcaseBusiness, Building2, LayoutDashboard, Settings, Users } from "lucide-react";

export const primaryNavigation = [
  { label: "Command Centre", href: "/", icon: LayoutDashboard },
  { label: "Customers", href: "/customers", icon: Users },
  { label: "Builders", href: "/builders", icon: Building2 },
  { label: "Jobs", href: "/jobs", icon: BriefcaseBusiness },
  { label: "Settings", href: "/settings", icon: Settings },
];

export const secondaryNavigation = [
  ["Leads & Pipeline", "/leads"], ["CRM & Customer Care", "/crm"], ["Follow-up Centre", "/crm/follow-ups"], ["Customer Portal", "/customer-portal"], ["Quotes", "/quotes"], ["Mobile Quick Quotes", "/quotes/mobile"], ["Quote Presentation", "/quotes/presentation"], ["Electrical Price Book", "/price-book"], ["Mobile Room Estimator", "/room-estimator"], ["Estimates", "/estimates"], ["Invoices", "/invoices"], ["Payments & Cash Flow", "/payments"], ["AI Finance Director", "/finance-director"], ["Labour & Costs", "/labour-costs"], ["Expenses & Receipts", "/expenses"], ["Job Finance", "/job-finance"], ["Starter Library", "/starter-library"], ["Materials", "/materials"], ["Stock Control", "/stock"], ["Purchase Lists", "/purchases"],
  ["Mobile Workspace", "/field"], ["Mobile Job Control", "/field/jobs"], ["Mobile Materials", "/field/materials"], ["Mobile Testing", "/field/testing"], ["Completion Packs", "/completion-packs"], ["Site Management", "/site-management"], ["RAMS & Risk Assessments", "/rams"], ["Test Equipment & Compliance", "/test-equipment"], ["Resource Planner", "/planner"], ["Team & Timesheets", "/team"], ["Fleet & Assets", "/assets"], ["Surveys", "/surveys"], ["Certificates", "/certificates"], ["Job Packs", "/job-packs"], ["AI Command Centre", "/ai"], ["AI Quote Builder", "/ai/quote-builder"], ["AI Materials Assistant", "/ai/materials"], ["AI Pricing Assistant", "/ai/pricing"], ["AI Business Coach", "/ai/business-coach"], ["AI Daily Briefing", "/ai/daily-briefing"], ["AI Quote Review", "/ai/quote-review"], ["AI Job Review", "/ai/job-review"], ["Business", "/business"], ["Release Readiness", "/release-readiness"], ["Cloud & Account", "/cloud"], ["Cloud Cutover Check", "/cloud/cutover"], ["Sync Queue Diagnostics", "/cloud/queue"],
] as const;

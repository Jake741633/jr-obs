import { BookOpen, BriefcaseBusiness, CalendarDays, Camera, ClipboardCheck, ClipboardList, FileText, LayoutGrid, ListChecks, Package, PoundSterling, Search, ShieldCheck, Sparkles, Users, type LucideIcon } from "lucide-react";

const workspaceIcons: Record<string, LucideIcon> = {
  "/jobs": BriefcaseBusiness,
  "/quotes": FileText,
  "/quotes/mobile": FileText,
  "/customers": Users,
  "/planner": CalendarDays,
  "/materials": Package,
  "/invoices": PoundSterling,
  "/ai/assistant": Sparkles,
  "/surveys": ClipboardList,
  "/field": BriefcaseBusiness,
  "/field/jobs": BriefcaseBusiness,
  "/field/day-planner": CalendarDays,
  "/field/site-diary": Camera,
  "/field/materials": Package,
  "/field/material-lookup": Search,
  "/field/testing": ClipboardCheck,
  "/field/snags": ListChecks,
  "/field/qa": ShieldCheck,
  "/job-packs": BookOpen,
};

export function WorkspaceIcon({ href, className = "size-6" }: { href: string; className?: string }) {
  const Icon = workspaceIcons[href] ?? LayoutGrid;
  return <Icon aria-hidden="true" className={className} />;
}

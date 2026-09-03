"use client";

import Link from "next/link";
import { useState } from "react";
import { ArrowRight, Search, Settings } from "lucide-react";
import { Card } from "../../components/ui/Card";
import { PageHeader } from "../../components/ui/PageHeader";
import { secondaryNavigation } from "../../components/navigation";
import { canAccessPath, isOperatorOnlyPath } from "../../lib/cloud/permissions";
import { useCloudIdentity } from "../../lib/cloud/useCloudIdentity";

type NavigationItem = (typeof secondaryNavigation)[number];
type WorkspaceSectionId = "sales" | "quotes" | "jobs" | "money" | "materials" | "compliance" | "ai" | "system";

const officeDailyHrefs = ["/crm/follow-ups", "/quotes/mobile", "/planner", "/invoices", "/surveys", "/field"] as const;
const electricianDailyHrefs = ["/field/day-planner", "/field/jobs", "/field/site-diary", "/field/materials", "/field/snags", "/field/testing"] as const;

const workspaceSections: Array<{ id: WorkspaceSectionId; title: string; description: string }> = [
  { id: "sales", title: "Customers & sales", description: "Leads, follow-ups and customer-facing work." },
  { id: "quotes", title: "Quotes & pricing", description: "Build, review and present profitable work." },
  { id: "jobs", title: "Jobs & field", description: "Plan jobs and open mobile site workspaces." },
  { id: "money", title: "Money & business", description: "Invoices, payments, costs and business control." },
  { id: "materials", title: "Materials & assets", description: "Materials, stock, purchasing and company assets." },
  { id: "compliance", title: "Testing & compliance", description: "Certificates, RAMS, completion and test records." },
  { id: "ai", title: "JR AI", description: "Focused assistants for daily decisions and reviews." },
  { id: "system", title: "Account & system", description: "Cloud account, release checks and diagnostics." },
];

function workspaceSectionFor(href: string): WorkspaceSectionId {
  if (href === "/leads" || href.startsWith("/crm") || href === "/customer-portal") return "sales";
  if (href.startsWith("/quotes") || href === "/price-book" || href === "/electrical-calculators" || href === "/room-estimator" || href.startsWith("/estimates")) return "quotes";
  if (href.startsWith("/field") || href === "/site-management" || href === "/planner" || href === "/team" || href === "/surveys" || href === "/job-packs") return "jobs";
  if (href === "/invoices" || href.startsWith("/payments") || href === "/finance-director" || href === "/labour-costs" || href === "/expenses" || href === "/job-finance" || href === "/starter-library" || href === "/business") return "money";
  if (href === "/materials" || href === "/stock" || href === "/purchases" || href === "/assets") return "materials";
  if (href === "/completion-packs" || href === "/rams" || href === "/test-equipment" || href === "/certificates") return "compliance";
  if (href.startsWith("/ai")) return "ai";
  return "system";
}

function WorkspaceLink({ item, prominent = false }: { item: NavigationItem; prominent?: boolean }) {
  const [label, href] = item;
  return (
    <Link
      href={href}
      className={`flex min-h-14 items-center justify-between gap-3 rounded-xl border px-4 py-3 text-sm font-semibold transition active:scale-[.99] ${prominent ? "border-cyan-500/30 bg-cyan-500/5 text-cyan-100" : "border-slate-800 bg-slate-950/60 text-slate-200 hover:border-slate-700 hover:bg-slate-900"}`}
    >
      <span className="min-w-0 truncate">{label}</span>
      <ArrowRight className="size-4 shrink-0 text-cyan-300" />
    </Link>
  );
}

export default function MenuPage() {
  const { identity, mode } = useCloudIdentity();
  const [query, setQuery] = useState("");
  const unrestricted = mode === "local" || (mode === "migration" && !identity);
  const permitted = (href: string) => {
    if (href === "/cloud") return true;
    if (isOperatorOnlyPath(href)) return canAccessPath(identity?.role, href, identity?.email);
    return unrestricted || canAccessPath(identity?.role, href, identity?.email);
  };
  const visibleNavigation = secondaryNavigation.filter(([, href]) => permitted(href));
  const normalizedQuery = query.trim().toLowerCase();
  const searchResults = normalizedQuery
    ? visibleNavigation.filter(([label, href]) => `${label} ${href}`.toLowerCase().includes(normalizedQuery))
    : [];
  const dailyHrefs = identity?.role === "electrician" ? electricianDailyHrefs : officeDailyHrefs;
  const dailyNavigation = dailyHrefs
    .map((href) => visibleNavigation.find(([, itemHref]) => itemHref === href))
    .filter((item): item is NavigationItem => item !== undefined);
  const groupedNavigation = workspaceSections
    .map((section) => ({ ...section, items: visibleNavigation.filter(([, href]) => workspaceSectionFor(href) === section.id) }))
    .filter((section) => section.items.length > 0);
  const settingsPermitted = unrestricted || canAccessPath(identity?.role, "/settings", identity?.email);

  return (
    <main className="space-y-6">
      <PageHeader
        eyebrow="JR OS"
        title="All workspaces"
        description="Find the next daily action quickly, or search every workspace available to this account."
      />

      <Card className="space-y-3">
        <label htmlFor="workspace-search" className="text-sm font-semibold text-slate-200">Find a workspace</label>
        <div className="relative">
          <Search aria-hidden="true" className="pointer-events-none absolute left-3 top-1/2 size-5 -translate-y-1/2 text-slate-500" />
          <input
            id="workspace-search"
            type="search"
            inputMode="search"
            autoComplete="off"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search quotes, invoices, testing…"
            aria-label="Search workspaces"
            className="min-h-12 w-full rounded-xl border border-slate-800 bg-slate-950 pl-11 pr-4 text-base text-white outline-none transition placeholder:text-slate-600 focus:border-cyan-500/60 focus:ring-2 focus:ring-cyan-500/20"
          />
        </div>
        <p className="text-xs text-slate-500">Only workspaces permitted for the active account are shown.</p>
      </Card>

      {normalizedQuery ? (
        <section aria-labelledby="workspace-results-heading" className="space-y-3">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wider text-cyan-400">Search</p>
            <h2 id="workspace-results-heading" className="mt-1 text-xl font-bold">{searchResults.length} {searchResults.length === 1 ? "workspace" : "workspaces"} found</h2>
          </div>
          {searchResults.length ? (
            <div className="grid gap-3 sm:grid-cols-2">{searchResults.map((item) => <WorkspaceLink key={item[1]} item={item} />)}</div>
          ) : (
            <Card><p className="text-sm text-slate-300">No permitted workspace matches “{query.trim()}”.</p></Card>
          )}
        </section>
      ) : (
        <>
          {dailyNavigation.length ? (
            <section aria-labelledby="daily-tools-heading" className="space-y-3">
              <div>
                <p className="text-xs font-semibold uppercase tracking-wider text-cyan-400">Day to day</p>
                <h2 id="daily-tools-heading" className="mt-1 text-xl font-bold">Daily tools</h2>
                <p className="mt-1 text-sm text-slate-500">The quickest routes for the active account and role.</p>
              </div>
              <div className="grid gap-3 sm:grid-cols-2">{dailyNavigation.map((item) => <WorkspaceLink key={item[1]} item={item} prominent />)}</div>
            </section>
          ) : null}

          <div className="space-y-6">
            {groupedNavigation.map((section) => (
              <section key={section.id} aria-labelledby={`workspace-section-${section.id}`} className="space-y-3">
                <div>
                  <h2 id={`workspace-section-${section.id}`} className="text-lg font-bold">{section.title}</h2>
                  <p className="mt-1 text-sm text-slate-500">{section.description}</p>
                </div>
                <div className="grid gap-3 sm:grid-cols-2">{section.items.map((item) => <WorkspaceLink key={item[1]} item={item} />)}</div>
              </section>
            ))}
          </div>
        </>
      )}

      {settingsPermitted ? <Link
        href="/settings"
        className="flex min-h-14 items-center justify-between rounded-xl border border-slate-800 bg-slate-900 px-4 py-3 text-sm font-semibold text-slate-200"
      >
        <span className="flex items-center gap-2"><Settings className="size-4 text-cyan-300" />Settings</span>
        <ArrowRight className="size-4 text-cyan-300" />
      </Link> : null}
    </main>
  );
}

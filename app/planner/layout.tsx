"use client";

import Link from "next/link";
import type { ReactNode } from "react";
import { CalendarClock, LockKeyhole } from "lucide-react";
import { Card } from "../../components/ui/Card";
import { useCloudIdentity } from "../../lib/cloud/useCloudIdentity";

export default function PlannerLayout({ children }: { children: ReactNode }) {
  const { identity, isReady, mode } = useCloudIdentity();
  const fieldCloudMode = mode !== "local" && identity?.role === "electrician";

  if (!isReady) return <Card>Checking scheduling access…</Card>;

  if (fieldCloudMode) {
    return (
      <main className="grid min-h-[60vh] place-items-center">
        <Card className="max-w-xl border-amber-400/30 text-center">
          <LockKeyhole className="mx-auto size-8 text-amber-300" />
          <h1 className="mt-4 text-2xl font-bold">Office scheduling is read-only for field accounts</h1>
          <p className="mt-2 text-sm text-slate-400">
            The Resource Planner can create recurring bookings, assign other staff and vehicles, and move office-managed visits. Those actions are not part of the electrician mutation contract.
          </p>
          <p className="mt-3 text-sm text-slate-300">
            Your assigned visits remain available in the engineer day planner, where arrival, departure and job-linked time are bound to your active field identity.
          </p>
          <Link href="/field/day-planner" className="mt-5 inline-flex min-h-11 items-center rounded-xl bg-cyan-400 px-4 text-sm font-semibold text-slate-950">
            <CalendarClock className="mr-2 size-4" />Open engineer day planner
          </Link>
        </Card>
      </main>
    );
  }

  return children;
}

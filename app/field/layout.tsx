import type { ReactNode } from "react";
import { FieldWorkspaceNav } from "../../components/FieldWorkspaceNav";
import { ScheduleOverview } from "../../components/ScheduleOverview";

export default function FieldLayout({ children }: { children: ReactNode }) {
  return <div className="space-y-6"><ScheduleOverview mobile /><FieldWorkspaceNav />{children}</div>;
}

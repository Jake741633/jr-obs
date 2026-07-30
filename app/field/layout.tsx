import type { ReactNode } from "react";
import { ScheduleOverview } from "../../components/ScheduleOverview";

export default function FieldLayout({ children }: { children: ReactNode }) {
  return <div className="space-y-6"><ScheduleOverview mobile />{children}</div>;
}

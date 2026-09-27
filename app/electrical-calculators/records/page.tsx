"use client";

import { SavedCalculationRecords } from "../../../components/calculators/CalculationRecords";
import { PageHeader } from "../../../components/ui/PageHeader";

export default function CalculationRecordsPage() {
  return <main className="space-y-6"><PageHeader eyebrow="Electrical Calculators" title="Calculation records" description="Review saved inputs, results and design evidence across your jobs and standalone notes." /><SavedCalculationRecords /></main>;
}

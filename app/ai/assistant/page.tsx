import { AssistantBriefing } from "../../../components/ai/AssistantBriefing";
import { PageHeader } from "../../../components/ui/PageHeader";

export default function AssistantPage() {
  return <main className="mx-auto max-w-3xl space-y-5">
    <PageHeader eyebrow="JR AI" title="Your daily assistant" description="Know what to do next, why it matters and where to act." />
    <AssistantBriefing />
  </main>;
}

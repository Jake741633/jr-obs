import { redirect } from "next/navigation";

export default async function EstimateDetailRedirect({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  redirect(`/quotes/${encodeURIComponent(id)}`);
}

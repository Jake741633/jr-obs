function text(value) {
  return typeof value === "string" ? value.trim() : "";
}

function item({ entry, kind, title, detail, priority, href }) {
  return {
    id: `${entry.id}:${kind}`,
    jobId: entry.jobId,
    sourceId: entry.id,
    sourceType: "SiteDiaryEntry",
    kind,
    title,
    detail,
    priority,
    dueDate: entry.workDate || entry.updatedAt?.slice(0, 10) || "",
    href: href || `/jobs/${entry.jobId}`,
    createdAt: entry.updatedAt || entry.createdAt || "",
  };
}

export function siteDiaryAttentionItems(entries) {
  return entries.flatMap((entry) => {
    const items = [];
    const materials = text(entry.materialsRequired);
    const followUp = text(entry.followUpActions);
    const delays = text(entry.delays);
    const safety = text(entry.issuesAndRisks);
    const customer = text(entry.customerInstructions || entry.customerRequests);
    const builder = text(entry.builderInstructions);

    if (materials) items.push(item({ entry, kind: "Materials", title: "Materials required", detail: materials, priority: "High", href: "/purchases" }));
    if (followUp) items.push(item({ entry, kind: "Follow-up", title: "Site follow-up action", detail: followUp, priority: "High" }));
    if (delays) items.push(item({ entry, kind: "Delay", title: "Site delay recorded", detail: delays, priority: "Urgent" }));
    if (safety) items.push(item({ entry, kind: "Safety", title: "H&S observation", detail: safety, priority: "Urgent", href: "/rams" }));
    if (customer) items.push(item({ entry, kind: "Customer", title: "Customer instruction", detail: customer, priority: "Normal", href: "/crm/follow-ups" }));
    if (builder) items.push(item({ entry, kind: "Builder", title: "Builder instruction", detail: builder, priority: "Normal", href: "/crm/follow-ups" }));

    return items;
  }).sort((left, right) => {
    const priority = { Urgent: 3, High: 2, Normal: 1 };
    return (priority[right.priority] - priority[left.priority]) || right.createdAt.localeCompare(left.createdAt);
  });
}

export function siteDiaryAttentionSummary(entries) {
  const items = siteDiaryAttentionItems(entries);
  return {
    total: items.length,
    urgent: items.filter((item) => item.priority === "Urgent").length,
    high: items.filter((item) => item.priority === "High").length,
    materials: items.filter((item) => item.kind === "Materials").length,
    customerActions: items.filter((item) => item.kind === "Customer").length,
    builderActions: items.filter((item) => item.kind === "Builder").length,
    items,
  };
}

function validListId(value: unknown): value is string {
  return typeof value === "string" && Boolean(value.trim()) && value.length <= 300;
}

export function purchaseListReviewHref(listId: string) {
  return validListId(listId) ? `/purchases?list=${encodeURIComponent(listId)}` : "/purchases";
}

/** Selects only a saved list; other query parameters never run purchase actions. */
export function purchaseListFromLink(search: string): { listId: string | null } | null {
  const ids = new URLSearchParams(search).getAll("list");
  if (!ids.length) return null;
  return { listId: ids.length === 1 && validListId(ids[0]) ? ids[0] : null };
}

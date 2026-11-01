const fields = ["title", "summary", "scope", "questions", "exclusions"];
const boundedText = (value, limit) => typeof value === "string" && value.trim().length > 0 && value.length <= limit;

export function parseQuoteScope(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)
    || Object.keys(value).length !== fields.length || fields.some(key => !Object.hasOwn(value, key))) return null;
  if (!boundedText(value.title, 120) || !boundedText(value.summary, 600)) return null;
  for (const [key, count, length] of [["scope", 12, 500], ["questions", 12, 300], ["exclusions", 8, 300]]) {
    if (!Array.isArray(value[key]) || value[key].length > count || value[key].some(item => !boundedText(item, length))) return null;
  }
  return { title: value.title, summary: value.summary, scope: [...value.scope], questions: [...value.questions], exclusions: [...value.exclusions] };
}

export function quoteScopeNotes(value) {
  return [value.title, value.summary, "Proposed scope", ...value.scope.map(item => `- ${item}`), "Questions to confirm", ...value.questions.map(item => `- ${item}`), "Exclusions", ...value.exclusions.map(item => `- ${item}`)].join("\n");
}

const text = maxLength => ({ type: "string", minLength: 1, maxLength });
const list = (maxItems, maxLength) => ({ type: "array", maxItems, items: text(maxLength) });
export const quoteScopeSchema = {
  type: "object", additionalProperties: false, required: fields,
  properties: { title: text(120), summary: text(600), scope: list(12, 500), questions: list(12, 300), exclusions: list(8, 300) },
};

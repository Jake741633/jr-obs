import type { CrmFollowUpSettings } from "./models";
import { defaultCrmFollowUpSettings } from "./crmPro";
import { hasSavedIdentity } from "./assistantIdentity";

export const followUpRuleFields = ["quoteAgeDays", "noResponseDays", "lostOpportunityDays", "highValueThreshold"] as const;
export type FollowUpRuleForm = Record<typeof followUpRuleFields[number], string>;

export function resolveFollowUpSettings(items: CrmFollowUpSettings[]) {
  const error = items.length > 1 ? "Multiple follow-up rule records need review. Resolve them before saving rules or using this queue."
    : items.length === 1 && !hasSavedIdentity(items[0].id) ? "The saved follow-up rules have no usable identity. Review the record before continuing." : "";
  return { settings: items[0] ?? defaultCrmFollowUpSettings, exists: items.length > 0, error };
}

export function followUpRulesError(settings: CrmFollowUpSettings) {
  for (const key of followUpRuleFields.slice(0, 3)) {
    if (!Number.isSafeInteger(settings[key]) || settings[key] < 1 || settings[key] > 3650) return "Follow-up day windows must be whole numbers from 1 to 3650.";
  }
  const value = settings.highValueThreshold;
  if (typeof value !== "number" || !Number.isFinite(value) || value < 0 || !Number.isSafeInteger(Math.round(value * 100)) || Math.abs(value * 100 - Math.round(value * 100)) > 0.000001) return "The high value threshold must be a finite, non-negative amount with at most two decimal places.";
  return "";
}

export function followUpRuleForm(settings: CrmFollowUpSettings): FollowUpRuleForm {
  return Object.fromEntries(followUpRuleFields.map(key => [key, String(settings[key] ?? "")])) as FollowUpRuleForm;
}

export function parseFollowUpRules(form: FollowUpRuleForm) {
  for (const key of followUpRuleFields) {
    const pattern = key === "highValueThreshold" ? /^\d+(?:\.\d{1,2})?$/ : /^\d+$/;
    if (!pattern.test(form[key].trim())) throw new Error(key === "highValueThreshold" ? "Enter a high value threshold in pounds, with at most two decimal places." : "Enter each day window as a whole number from 1 to 3650.");
  }
  const values = Object.fromEntries(followUpRuleFields.map(key => [key, Number(form[key])])) as Pick<CrmFollowUpSettings, typeof followUpRuleFields[number]>;
  const error = followUpRulesError({ ...defaultCrmFollowUpSettings, ...values });
  if (error) throw new Error(error);
  return values;
}

export function followUpRulesSnapshot(settings: CrmFollowUpSettings) {
  return JSON.stringify([settings.id, ...followUpRuleFields.map(key => [typeof settings[key], String(settings[key])]), settings.updatedAt]);
}

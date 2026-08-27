import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const jobPage = readFileSync(new URL("../app/jobs/[id]/page.tsx", import.meta.url), "utf8");
const workspace = readFileSync(new URL("../app/jobs/[id]/workspace/page.tsx", import.meta.url), "utf8");
const jobProjection = readFileSync(
  new URL("../supabase/migrations/20260813230319_protect_field_job_confidentiality.sql", import.meta.url),
  "utf8",
);
const variationProjection = readFileSync(
  new URL("../supabase/migrations/20260826144606_redact_field_job_progress_finance.sql", import.meta.url),
  "utf8",
);

function section(source, startText, endText) {
  const start = source.indexOf(startText);
  assert.ok(start >= 0, `Missing section start: ${startText}`);
  const end = source.indexOf(endText, start);
  assert.ok(end > start, `Missing section end: ${endText}`);
  return source.slice(start, end);
}

test("field projections omit every amount used by the assigned-job finance tiles", () => {
  const fieldJobPayload = section(
    jobProjection,
    "create or replace function private.jr_field_job_payload",
    "revoke execute on function private.jr_field_job_payload",
  );
  const fieldVariationPayload = section(
    variationProjection,
    "when 'jr-os-job-variations' then",
    "when 'jr-os-job-timeline' then",
  );

  assert.doesNotMatch(fieldJobPayload, /'value'|originalContractValue|quoteSnapshot/i);
  for (const key of ["fixedPrice", "labourHours", "labourRate", "materialCharge", "otherCharge"]) {
    assert.doesNotMatch(fieldVariationPayload, new RegExp(`'${key}'`, "i"));
  }
});

test("job detail never substitutes a redacted contract value with zero", () => {
  assert.match(
    jobPage,
    /const financeRestricted = identityState\.mode !== "local" && !canEditFinance\(identityState\.identity\?\.role\)/,
  );
  const valueBranch = section(
    jobPage,
    "{!financeRestricted ? <p",
    "</p> : null}",
  );
  assert.match(valueBranch, /<WalletCards/);
  assert.match(valueBranch, /Intl\.NumberFormat[\s\S]*\.format\(job\.value \|\| 0\)/);
  assert.equal((jobPage.match(/job\.value \|\| 0/g) ?? []).length, 1);
  assert.doesNotMatch(jobPage, /const formattedValue\s*=/);
});

test("workspace computes and renders commercial totals only with positive finance authority", () => {
  assert.match(
    workspace,
    /const showOfficeFinance = identityState\.mode === "local" \|\| canEditFinance\(identityState\.identity\?\.role\)/,
  );

  const variationTotal = section(
    workspace,
    "const acceptedVariationValue = showOfficeFinance",
    "const jobDocuments",
  );
  assert.match(variationTotal, /\? jobVariations[\s\S]*\.reduce\(/);
  assert.match(variationTotal, /:\s*0;/);

  assert.match(
    workspace,
    /\{showOfficeFinance \? <>[\s\S]*Contract value[\s\S]*money\.format\(job\.value \|\| 0\)[\s\S]*Variations[\s\S]*money\.format\(acceptedVariationValue\)[\s\S]*<\/> : null\}/,
  );
  assert.equal((workspace.match(/money\.format\(job\.value \|\| 0\)/g) ?? []).length, 1);
  assert.equal((workspace.match(/money\.format\(acceptedVariationValue\)/g) ?? []).length, 1);

  const metrics = section(
    workspace,
    '<div className={`mt-5 grid grid-cols-2 gap-3',
    "\n      </div>\n    </Card>",
  );
  assert.match(metrics, /showOfficeFinance \? "sm:grid-cols-4" : "sm:grid-cols-2"/);
  const financeBranchEnd = metrics.indexOf("</> : null}");
  assert.ok(financeBranchEnd > 0, "finance-only metrics must have a bounded fragment");
  for (const operationalMetric of [
    "counts.outstanding",
    "progressValue.overall",
  ]) {
    assert.ok(
      metrics.indexOf(operationalMetric) > financeBranchEnd,
      `${operationalMetric} must remain visible outside the finance-only fragment`,
    );
  }
});

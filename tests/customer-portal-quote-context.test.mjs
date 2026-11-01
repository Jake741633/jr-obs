import assert from "node:assert/strict";
import test from "node:test";
import { loadLocalTs } from "./helpers/load-local-ts.mjs";
import { nodes, text } from "./helpers/customer-page-harness.mjs";

const { depositAmount } = loadLocalTs(new URL("../lib/payments.ts", import.meta.url));
const quote = (patch = {}) => ({ id: "quote-1", number: "Q-1", type: "Quote", status: "Sent", documentVersion: 3, customerId: "customer-1", title: "Rewire", items: [{ id: "line", description: "PRIVATE BREAKDOWN", category: "Materials", quantity: 2, unitPrice: 100, unitCost: 50 }], profitability: { sellingPrice: 300 }, vatEnabled: true, vatRate: 20, notes: "Replace the consumer unit", exclusions: "Decorating excluded", terms: "Payment within seven days", paymentTerms: { mode: "On completion" }, updatedAt: "2026-11-01T10:00:00Z", ...patch });
function harness(document, mode = "cloud") {
  let cursor = 0;
  const identity = { role: "customer", customerSourceId: "customer-1", organisationId: "org", userId: "user" };
  let cleanup, mounted = false, effectCursor = 0;
  const effects = [], slots = [], data = { "jr-os-pricing-documents": [document], "jr-os-deposit-requirements": [{ pricingDocumentId: document.id, mode: "Percentage", value: 25, dueRule: "On acceptance" }] }, writes = [];
  const jsx = (type, props) => ({ type, props });
  const overrides = {
    "react/jsx-runtime": { jsx, jsxs: jsx },
    react: { useState(value) { const i = cursor++; if (!(i in slots)) slots[i] = typeof value === "function" ? value() : value; return [slots[i], next => { slots[i] = typeof next === "function" ? next(slots[i]) : next; }]; }, useRef(value) { const i = cursor++; if (!(i in slots)) slots[i] = { current: value }; return slots[i]; }, useMemo: fn => fn(), useEffect(effect) { if (effectCursor++ === 0 && !mounted) effects.push(() => { cleanup = effect(); mounted = true; }); }, useLayoutEffect(effect) { effects.push(effect); } },
    "../../components/quotes/PortalQuoteSummary": { PortalQuoteSummary: "PortalQuoteSummary" }, "next/image": { default: "Image" }, "lucide-react": {},
    "../../components/ui/Button": { Button: "Button" }, "../../components/ui/Card": { Card: "Card" }, "../../components/ui/FormField": { InputField: "InputField", TextareaField: "TextareaField" }, "../../components/ui/PageHeader": { PageHeader: "PageHeader" },
    "../../lib/cloud/useCloudIdentity": { useCloudIdentity: () => ({ mode, identity }) },
    "../../lib/storage": { makeId: () => "approval", useLocalStorageCollection: key => ({ items: data[key] ?? [], isReady: true, setItems(update) { const next = update(data[key] ?? []); data[key] = next; writes.push({ key, next }); } }) },
    "../../lib/cloud/repository": { getSyncQueue: () => [], activeSyncAuthorizationMatches: () => true },
    "../../lib/cloud/customerCertificateCapability": {}, "../../lib/cloud/portalPaymentLinkCapability": {},
  };
  const Page = loadLocalTs(new URL("../app/customer-portal/page.tsx", import.meta.url), overrides).default;
  const render = () => { cursor = 0; effectCursor = 0; const view = Page(); effects.splice(0).forEach(effect => effect()); return view; };
  const button = label => nodes(render()).find(n => n.type === "Button" && text(n) === label);
  return { render, button, writes, data, identity, unmount() { cleanup(); }, summary() { return nodes(render()).find(n => n.type === "PortalQuoteSummary"); }, review() { button("Review decision").props.onClick(); }, fill() { nodes(render()).find(n => n.props.label === "Approval name").props.onChange({ target: { value: "Customer" } }); nodes(render()).find(n => n.type === "input" && n.props.type === "checkbox").props.onChange({ target: { checked: true } }); } };
}

test("percentage deposits use the full saved quote selling amount with VAT", () => {
  assert.equal(depositAmount(quote(), { mode: "Percentage", value: 25 }), 90);
  assert.equal(depositAmount(quote(), { mode: "Fixed", value: 40 }), 40);
});

test("local portal quote and deposit agree with the saved selling amount", () => {
  const h = harness(quote(), "local");
  assert.equal(h.summary()?.props.grossTotal, 360);
  assert.match(h.summary().props.depositText, /£90.00/);
});

test("cloud portal passes verified price and customer document context to the summary before approval", () => {
  const h = harness(quote({ customerNetTotal: 350 }));
  assert.equal(h.summary()?.props.grossTotal, 420);
  assert.match(h.summary().props.depositText, /£105.00/);
  assert.equal(h.summary().props.document.notes, "Replace the consumer unit");
  assert.equal(h.summary().props.document.terms, "Payment within seven days");
  assert.doesNotMatch(text(h.render()), /PRIVATE BREAKDOWN|Internal cost/);
  h.review(); h.fill(); h.button("Approve").props.onClick();
  assert.equal(h.writes[0].next[0].decision, "Accepted");
});

test("cloud portal withholds unverified amounts and acceptance including a retained handler", () => {
  for (const invalid of [undefined, null, -1, NaN, Infinity, "350"]) {
    const document = quote({ customerNetTotal: 350 }), h = harness(document);
    h.review(); h.fill();
    const retained = h.button("Approve").props.onClick;
    h.data["jr-os-pricing-documents"] = [{ ...document, customerNetTotal: invalid }];
    assert.doesNotMatch(text(h.render()), /£/);
    assert.equal(h.summary().props.grossTotal, null);
    assert.equal(h.summary().props.depositText, undefined);
    assert.equal(h.button("Approve")?.props.disabled, true);
    retained();
    assert.equal(h.writes.length, 0);
  }
});

test("zero is a verified customer amount", () => {
  const h = harness(quote({ customerNetTotal: 0 }));
  assert.equal(h.summary()?.props.grossTotal, 0);
  h.review(); h.fill(); assert.equal(Boolean(h.button("Approve").props.disabled), false);
});


test("approval requires re-review when price or terms change but survives equivalent refresh", () => {
  for (const patch of [{ customerNetTotal: 400 }, { terms: "Changed terms" }, { documentVersion: 4 }]) {
    const document = quote({ customerNetTotal: 350 }), h = harness(document);
    h.review(); h.fill();
    h.data["jr-os-pricing-documents"] = [{ ...document }];
    assert.equal(Boolean(h.button("Approve").props.disabled), false);
    h.data["jr-os-pricing-documents"] = [{ ...document, ...patch }];
    assert.equal(h.button("Approve").props.disabled, true);
    h.button("Approve").props.onClick(); assert.equal(h.writes.length, 0);
    h.review();
    assert.equal(nodes(h.render()).find(n => n.props.label === "Approval name").props.value, "");
    assert.equal(nodes(h.render()).find(n => n.type === "input" && n.props.type === "checkbox").props.checked, false);
  }
});

test("retained approval callbacks fail after account change unmount or duplicate identity", () => {
  for (const change of ["account", "unmount", "duplicate"]) {
    const document = quote({ customerNetTotal: 350 }), h = harness(document);
    h.review(); h.fill(); const retained = h.button("Approve").props.onClick;
    if (change === "account") { h.identity.userId = "other-user"; h.render(); }
    if (change === "unmount") h.unmount();
    if (change === "duplicate") { h.data["jr-os-pricing-documents"] = [document, { ...document }]; h.render(); }
    retained(); assert.equal(h.writes.length, 0, change);
  }
});

test("switching quote review resets consent and approval name", () => {
  const h = harness(quote({ customerNetTotal: 350 }));
  h.review(); h.fill(); h.data["jr-os-pricing-documents"].push(quote({ id: "quote-2", customerNetTotal: 80 }));
  const buttons = nodes(h.render()).filter(n => n.type === "Button" && text(n) === "Review decision"); buttons[1].props.onClick();
  assert.equal(nodes(h.render()).find(n => n.props.label === "Approval name").props.value, "");
  assert.equal(nodes(h.render()).find(n => n.type === "input" && n.props.type === "checkbox").props.checked, false);
});

test("malformed tax settings and invalid local totals withhold approval", () => {
  for (const patch of [{ vatEnabled: "false" }, { vatRate: "20" }, { vatRate: NaN }, { vatRate: -2 }]) {
    const h = harness(quote({ customerNetTotal: 350, ...patch })); assert.equal(h.summary().props.grossTotal, null);
  }
  for (const sellingPrice of [NaN, Infinity, -1]) {
    const h = harness(quote({ profitability: { sellingPrice }, items: [], pricingSettings: { travelPrice: sellingPrice } }), "local");
    assert.equal(h.summary().props.grossTotal, null);
  }
});


test("malformed deposit requirements never publish payable deposit text", () => {
  for (const value of [NaN, Infinity, -1, "25", 101]) {
    const h = harness(quote({ customerNetTotal: 350 }));
    h.data["jr-os-deposit-requirements"][0].value = value;
    assert.equal(h.summary().props.depositText, undefined);
  }
});

test("deposit and status changes invalidate consent on the same document version", () => {
  for (const patch of [{ value: 40 }, { dueRule: "Specified date", dueDate: "2026-12-01" }, { remove: true }, { status: "Expired" }]) {
    const h = harness(quote({ customerNetTotal: 350 }));
    h.review(); h.fill(); const retained = h.button("Approve").props.onClick;
    if (patch.status) h.data["jr-os-pricing-documents"] = [{ ...h.data["jr-os-pricing-documents"][0], status: patch.status }];
    else if (patch.remove) h.data["jr-os-deposit-requirements"] = [];
    else h.data["jr-os-deposit-requirements"] = [{ ...h.data["jr-os-deposit-requirements"][0], ...patch }];
    assert.equal(h.button("Approve").props.disabled, true);
    retained(); assert.equal(h.writes.length, 0);
    h.button("Approve").props.onClick(); assert.equal(h.writes.length, 0);
  }
});

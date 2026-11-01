import assert from "node:assert/strict";
import test from "node:test";
import * as contactLinks from "../lib/contactLinks.ts";
import { harness as customerHarness, nodes, text, customer } from "./helpers/customer-page-harness.mjs";

const harness = initial => customerHarness(initial, true);
const cards = view => nodes(nodes(view).find(n => n.props["aria-label"] === "Customer records")).filter(n => n.type === "Card");

test("phone customers reveal eight at a time and retain an open draft through search and clear", () => {
  const h = harness(Array.from({ length: 19 }, (_, i) => customer({ id: `c${i}`, name: `Customer ${i}` })));
  assert.equal(cards(h.render()).length, 8); assert.match(text(h.render()), /Showing 8 of 19 matching customer records/);
  h.click("Show more customers"); assert.equal(cards(h.render()).length, 16); h.click("Show more customers"); assert.equal(cards(h.render()).length, 19);
  h.openForm(); h.field("Customer name", "Retained draft"); h.search("customer"); assert.equal(cards(h.render()).length, 8);
  h.click("Show more customers"); h.click("Clear customer search"); assert.equal(cards(h.render()).length, 8);
  assert.equal(nodes(h.render()).find(n => n.props.label === "Customer name").props.value, "Retained draft");
  assert.equal(nodes(h.render()).find(n => n.props.label === "Phone").props.type, "tel");
  h.enter(); assert.equal(h.blurred(), 1);
});

test("customer search matches words across visible contact details and formatted phone numbers without searching notes", () => {
  const saved = [customer(), customer({ id: "other", name: "Warehouse customer", phone: "+44 (7700) 900456", address: "2 Station Road" })], before = JSON.stringify(saved), h = harness(saved);
  h.search(" STREET  EXAMPLE "); assert.equal(cards(h.render()).length, 1); assert.match(text(cards(h.render())), /Example customer/);
  h.search("+447700900456"); assert.equal(cards(h.render()).length, 1); assert.match(text(cards(h.render())), /Warehouse customer/);
  h.search("07700900123"); assert.equal(cards(h.render()).length, 1);
  h.search("warehouse station"); assert.equal(cards(h.render()).length, 1);
  for (const query of ["Private note", "undefined", "missing person"]) { h.search(query); assert.equal(cards(h.render()).length, 0); }
  assert.equal(JSON.stringify(saved), before);
});

test("customer review links preserve the exact id and linked-job counts wait for loaded records", () => {
  const id = "customer /?#+ &", h = harness([customer({ id })]); h.data.jobsReady = false;
  assert.match(text(cards(h.render())), /Linked jobs loading/); assert.doesNotMatch(text(cards(h.render())), /0 linked job/);
  assert.equal(nodes(cards(h.render())).find(n => n.type === "Link").props.href, `/customers/${encodeURIComponent(id)}`);
  h.data.jobs = [{ id: "job-1", customerId: id }, { id: "job-2", customerId: "other" }]; h.data.jobsReady = true;
  assert.match(text(cards(h.render())), /1 linked job record/);
  h.data.ready = false; assert.equal(cards(h.render()).length, 0); assert.match(text(h.render()), /Loading customers/);
  h.data.ready = true; assert.equal(cards(h.render()).length, 1);
});

test("phone contact actions use large labelled targets and keep unsupported formats visible for review", () => {
  const h = harness([customer()]), actions = nodes(cards(h.render())).filter(n => n.type === "a");
  assert.equal(actions.length, 2); assert.equal(actions[0].props.href, "tel:07700900123"); assert.equal(actions[1].props.href, "mailto:customer@example.test");
  assert.match(actions[0].props["aria-label"], /Call Example customer on 07700 900123/); assert.match(actions[1].props["aria-label"], /Email Example customer/);
  for (const control of nodes(cards(h.render())).filter(n => ["a", "Link", "button"].includes(n.type))) assert.match(control.props.className, /min-h-12/);
  const unsupported = harness([customer({ phone: "07700 900123 ext 4", email: "customer@example.test?bcc=someone@example.test" })]);
  assert.equal(nodes(cards(unsupported.render())).filter(n => n.type === "a").length, 0);
  assert.match(text(cards(unsupported.render())), /Review phone format to call/); assert.match(text(cards(unsupported.render())), /Review email format to compose/);
});

test("contact URLs reject ambiguous dialing and encode recipient delimiters without adding message headers", () => {
  assert.equal(contactLinks.contactPhoneHref(" +44 7700-900123 "), "tel:+447700900123");
  for (const value of ["+44 (0)7700 900123", "07700 900123 ext 4", "07700;123", "++447700900123", "123", "1".repeat(16), "javascript:alert(1)", null]) assert.equal(contactLinks.contactPhoneHref(value), null);
  assert.equal(contactLinks.contactEmailHref(" first+quotes@example.test "), "mailto:first%2Bquotes@example.test");
  assert.equal(contactLinks.contactEmailHref("first?ref=work@example.test"), "mailto:first%3Fref%3Dwork@example.test");
  for (const value of ["first@example.test?subject=Hello", "first@example.test\r\nBcc:other@example.test", "first@example.test,second@example.test", "Display Name <first@example.test>", "missing-at", null]) assert.equal(contactLinks.contactEmailHref(value), null);
});

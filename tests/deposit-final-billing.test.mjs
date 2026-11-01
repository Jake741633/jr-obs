import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import test from 'node:test';
import ts from 'typescript';
import * as variations from '../lib/jobManagement-core.mjs';
const load = (path, dependencies = {}) => {
  const loadedModule = { exports: {} };
  vm.runInNewContext(ts.transpileModule(readFileSync(new URL(path, import.meta.url), 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText,
    { module: loadedModule, exports: loadedModule.exports, require: (name) => dependencies[name] });
  return loadedModule.exports;
};
const billing = await import('../lib/depositBilling-core.mjs');
const business = load('../lib/businessSettings.ts');
const workflow = load('../lib/workflow.ts', { './businessSettings': business, './jobManagement-core.mjs': variations, './depositBilling-core.mjs': billing });
let sequence = 0;
const createId = (prefix) => `${prefix}-${++sequence}`;
const now = '2026-11-01T12:00:00Z';
const document = { id: 'quote', number: 'Q-1', type: 'Quote', status: 'Accepted', title: 'Works', customerId: 'customer', vatEnabled: true, vatRate: 20, items: [{ id: 'line', description: 'Works', category: 'Labour', quantity: 1, unitPrice: 203 }] };
const requirement = { id: 'rule', pricingDocumentId: 'quote', mode: 'Percentage', value: 25, dueRule: 'On acceptance' };
const deposit = (patch = {}) => ({ id: 'deposit', number: 'INV-0001', purpose: 'Deposit', depositRequirementId: 'rule', status: 'Sent', customerId: 'customer', quoteId: 'quote', vatEnabled: true, vatRate: 20, items: [{ quantity: 1, unitPrice: 50.75 }], amountPaid: 0, ...patch });
const final = (invoices = [], extra = {}) => workflow.createInvoiceFromCompletedJob({ job: { id: 'job', title: 'Works', sourceQuoteId: 'quote', customerId: 'customer', status: 'Complete', value: 243.6 }, quote: document, invoices, invoiceId: 'final', now, createId, ...extra }).invoice;

test('deposit builder preserves quote VAT and explicit source identity', () => {
  assert.equal(typeof workflow.createDepositInvoiceFromQuote, 'function');
  const invoice = workflow.createDepositInvoiceFromQuote({ document, requirement, grossAmount: 60.9, invoices: [], invoiceId: 'deposit', now, createId });
  assert.equal(invoice.purpose, 'Deposit');
  assert.equal(invoice.depositRequirementId, 'rule');
  assert.equal(invoice.items[0].unitPrice, 50.75);
  assert.equal(workflow.invoiceTotal(invoice), 60.9);
});

test('final deducts issued deposit once even before job conversion and with no receipt', () => {
  const invoice = final([deposit()]);
  assert.equal(invoice.purpose, 'Final');
  assert.equal(workflow.invoiceTotal(invoice), 182.7);
  assert.equal(invoice.amountPaid, 0);
  assert.deepEqual(Array.from(invoice.appliedDepositInvoiceIds), ['deposit']);
  assert.equal(invoice.items[1].unitPrice, -50.75);
  assert.match(invoice.items[1].description, /INV-0001/);
});

test('final blocks ambiguous, conflicting, draft, duplicate, excessive and VAT inconsistent deposit evidence', () => {
  for (const invoices of [
    [deposit({ status: 'Draft' })], [deposit({ purpose: undefined })], [deposit({ purpose: 'Final' })],
    [deposit({ customerId: 'other' })], [deposit({ jobId: 'other' })], [deposit({ vatRate: 5 })],
    [deposit(), deposit()], [deposit({ items: [{ quantity: 1, unitPrice: 204 }] })],
    [deposit({ items: [{ quantity: 1, unitPrice: NaN }] })],
    [deposit(), { ...deposit({ id: 'elsewhere', quoteId: 'elsewhere', purpose: 'Final' }), appliedDepositInvoiceIds: ['deposit'] }],
  ]) assert.throws(() => final(invoices), /review|draft|already|VAT|deposit/i);
});

test('cancelled and unlinked historically named invoices do not reduce the final', () => {
  const invoice = final([deposit({ status: 'Cancelled' }), deposit({ id: 'old', purpose: undefined, quoteId: undefined, title: 'Deposit - Works' })]);
  assert.equal(workflow.invoiceTotal(invoice), 243.6);
  assert.equal(invoice.appliedDepositInvoiceIds.length, 0);
});

test('deposit deduction preserves accepted variation scope', () => {
  const invoice = final([deposit()], { variations: [{ id: 'variation', jobId: 'job', status: 'Accepted', title: 'Additional work', sellingPrice: 10, customerPrice: 10, amount: 10 }] });
  assert.equal(invoice.variationIds[0], 'variation');
  assert.equal(invoice.items.at(-1).unitPrice, -50.75);
});

test('issued deposits are deducted regardless of saved paid amounts or receipt status', () => {
  for (const status of ['Sent', 'Part paid', 'Paid', 'Overdue']) {
    assert.equal(workflow.invoiceTotal(final([deposit({ status, amountPaid: status === 'Paid' ? 60.9 : 0 })])), 182.7);
  }
});

test('builder uses supplied validated gross without reapplying percentage and ignores cancelled predecessors', () => {
  const invoice = workflow.createDepositInvoiceFromQuote({ document, requirement, grossAmount: 48, invoices: [deposit({ status: 'Cancelled', number: 'INV-0012' })], invoiceId: 'replacement', now, createId });
  assert.equal(workflow.invoiceTotal(invoice), 48);
  assert.equal(invoice.number, 'INV-0013');
});

test('builder rejects invalid amounts, requirements, links and existing final invoices', () => {
  for (const patch of [
    { grossAmount: NaN }, { grossAmount: 244 }, { grossAmount: -1 },
    { requirement: { ...requirement, value: 101 } },
    { requirement: { ...requirement, pricingDocumentId: 'other' } },
    { invoices: [deposit()] }, { invoices: [deposit({ purpose: 'Final' })] },
    { invoices: [deposit({ purpose: undefined })] },
    { invoices: [deposit({ customerId: 'other' })] },
    { document: { ...document, status: 'Draft' } },
  ]) assert.throws(() => workflow.createDepositInvoiceFromQuote({ document, requirement, grossAmount: 60.9, invoices: [], invoiceId: 'new', now, createId, ...patch }), /review/i);
});

test('multiple distinct deposit invoices retain separate traceable deductions', () => {
  const invoice = final([deposit(), deposit({ id: 'second', depositRequirementId: 'other-rule', number: 'INV-0002', items: [{ quantity: 1, unitPrice: 10 }] })]);
  assert.equal(workflow.invoiceTotal(invoice).toFixed(2), '170.70');
  assert.deepEqual(Array.from(invoice.appliedDepositInvoiceIds), ['deposit', 'second']);
});

test('final rejects multiple issued deposits with the same requirement identity', () => {
  assert.throws(() => final([deposit({ depositRequirementId: 'rule' }), deposit({ id: 'second', depositRequirementId: 'rule' })]), /review|duplicate/i);
});


test('fractional percentage deposits and remaining scope sum to contract payable pennies', () => {
  const quote = { ...document, vatEnabled: false, vatRate: 0, items: [{ quantity: 1, unitPrice: 10.01 }] };
  const invoice = workflow.createDepositInvoiceFromQuote({ document: quote, requirement: { ...requirement, value: 50 }, grossAmount: 5.005, invoices: [], invoiceId: 'deposit', now, createId });
  assert.equal(workflow.invoiceTotal(invoice), 5.01);
  const balance = final([{ ...invoice, status: 'Sent' }], { quote });
  assert.equal(workflow.invoiceTotal(balance).toFixed(2), '5.00');
});

test('zero payable deposits and malformed explicit deposit identities require review', () => {
  assert.throws(() => workflow.createDepositInvoiceFromQuote({ document, requirement, grossAmount: 0.004, invoices: [], invoiceId: 'tiny', now, createId }), /review/i);
  for (const patch of [{ depositRequirementId: undefined }, { quoteId: undefined, jobId: 'job' }, { id: '' }, { items: [{ quantity: 1, unitPrice: 5.005 / 1.2 }] }]) {
    assert.throws(() => final([deposit(patch)]), /review/i);
  }
});

test('builder validates persisted due-date rules and actual calendar dates', () => {
  for (const rule of [{ dueRule: 'Unknown' }, { dueRule: 'Specified date', dueDate: '2026-02-30' }, { dueRule: 'Specified date', dueDate: '' }]) {
    assert.throws(() => workflow.createDepositInvoiceFromQuote({ document, requirement: { ...requirement, ...rule }, grossAmount: 60.9, invoices: [], invoiceId: 'new', now, createId }), /review/i);
  }
});

test('100 percent VAT deposit leaves a zero payable final while preserving penny contract totals', () => {
  const quote = { ...document, items: [{ quantity: 1, unitPrice: 10.01 / 1.2 }] };
  const invoice = workflow.createDepositInvoiceFromQuote({ document: quote, requirement: { ...requirement, value: 100 }, grossAmount: 10.01, invoices: [], invoiceId: 'full-deposit', now, createId });
  const balance = final([{ ...invoice, status: 'Sent' }], { quote });
  assert.equal(new Intl.NumberFormat('en-GB', { minimumFractionDigits: 2 }).format(workflow.invoiceTotal(balance)), '0.00');
});

test('final payable pennies follow invoiceTotal VAT operation order at the half penny', () => {
  const quote = { ...document, vatRate: 5, items: [{ quantity: 1, unitPrice: 0.21428571428571427 }] };
  const invoice = final([deposit({ vatRate: 5, items: [{ quantity: 1, unitPrice: 0.1 / 1.05 }] })], { quote });
  assert.equal(new Intl.NumberFormat('en-GB', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(workflow.invoiceTotal(invoice)), '0.12');
});

test('fractional scope already displaying the correct final pennies has no rounding charge', () => {
  const quote = { ...document, items: [{ quantity: 1, unitPrice: 203.001 }] };
  const invoice = final([deposit()], { quote });
  assert.equal(invoice.items.length, 2);
  assert.equal(new Intl.NumberFormat('en-GB', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(workflow.invoiceTotal(invoice)), '182.70');
});

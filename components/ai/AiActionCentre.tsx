"use client";

import Link from "next/link";
import { useState } from "react";
import {
  ArrowRight,
  BriefcaseBusiness,
  FilePlus2,
  Mail,
  MessageCircle,
  PackageCheck,
  Phone,
  ReceiptText,
} from "lucide-react";
import type { Customer, CustomerProfile, Job, PricingDocument } from "../../lib/models";
import { Button } from "../ui/Button";
import { Card } from "../ui/Card";

function phoneForWhatsApp(value: string) {
  const digits = value.replace(/\D/g, "");
  if (digits.startsWith("0")) return `44${digits.slice(1)}`;
  return digits;
}

function contactLink(customer: Customer | undefined, profile: CustomerProfile | undefined) {
  if (!customer) return { href: "/crm", label: "Choose customer", icon: MessageCircle };
  if (profile?.preferredContact === "Email" && customer.email) {
    return {
      href: `mailto:${customer.email}?subject=${encodeURIComponent("JR Electrical Services")}`,
      label: `Email ${customer.name}`,
      icon: Mail,
    };
  }
  if (profile?.preferredContact === "WhatsApp" && customer.phone) {
    return {
      href: `https://wa.me/${phoneForWhatsApp(customer.phone)}?text=${encodeURIComponent(`Hi ${customer.name}, it's Jake from JR Electrical Services.`)}`,
      label: `WhatsApp ${customer.name}`,
      icon: MessageCircle,
    };
  }
  if (customer.phone) return { href: `tel:${customer.phone}`, label: `Call ${customer.name}`, icon: Phone };
  if (customer.email) return { href: `mailto:${customer.email}`, label: `Email ${customer.name}`, icon: Mail };
  return { href: `/customers/${customer.id}`, label: "Add contact details", icon: MessageCircle };
}

export function AiActionCentre({
  acceptedQuotes,
  completedJobs,
  orderDocuments,
  customers,
  profiles,
  onConvertQuote,
  onGenerateInvoice,
  onOrderMaterials,
  onContactCustomer,
}: {
  acceptedQuotes: PricingDocument[];
  completedJobs: Job[];
  orderDocuments: PricingDocument[];
  customers: Customer[];
  profiles: CustomerProfile[];
  onConvertQuote: (id: string) => void;
  onGenerateInvoice: (id: string) => void;
  onOrderMaterials: (id: string) => void;
  onContactCustomer: (id: string) => void;
}) {
  const [quoteId, setQuoteId] = useState("");
  const [jobId, setJobId] = useState("");
  const [documentId, setDocumentId] = useState("");
  const [customerId, setCustomerId] = useState("");
  const selectedQuoteId = acceptedQuotes.some((quote) => quote.id === quoteId) ? quoteId : acceptedQuotes[0]?.id ?? "";
  const selectedJobId = completedJobs.some((job) => job.id === jobId) ? jobId : completedJobs[0]?.id ?? "";
  const selectedDocumentId = orderDocuments.some((document) => document.id === documentId) ? documentId : orderDocuments[0]?.id ?? "";
  const selectedCustomerId = customers.some((customer) => customer.id === customerId) ? customerId : customers[0]?.id ?? "";
  const selectedCustomer = customers.find((customer) => customer.id === selectedCustomerId);
  const selectedProfile = profiles.find((profile) => profile.customerId === selectedCustomerId);
  const contact = contactLink(selectedCustomer, selectedProfile);
  const ContactIcon = contact.icon;

  return (
    <section id="action-centre" className="scroll-mt-6 space-y-4">
      <div>
        <p className="text-xs font-semibold uppercase tracking-[0.18em] text-blue-300">AI Action Centre</p>
        <h2 className="mt-1 text-2xl font-bold">Move work forward in one click</h2>
        <p className="mt-1 text-sm text-slate-400">Every action writes to the same linked Customers, Quotes, Jobs, Invoices, Purchases and CRM records.</p>
      </div>

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-5">
        <Card className="flex min-h-64 flex-col">
          <FilePlus2 className="size-6 text-violet-300" />
          <h3 className="mt-4 font-bold">Create Quote</h3>
          <p className="mt-2 flex-1 text-sm text-slate-500">Start with typed notes or a pasted voice transcript.</p>
          <Link href="/ai/quote-builder" className="mt-5 flex min-h-11 items-center justify-between rounded-xl bg-cyan-400 px-4 text-sm font-semibold text-slate-950">Open builder <ArrowRight className="size-4" /></Link>
        </Card>

        <Card className="flex min-h-64 flex-col">
          <BriefcaseBusiness className="size-6 text-cyan-300" />
          <h3 className="mt-4 font-bold">Convert to Job</h3>
          <p className="mt-2 text-sm text-slate-500">{acceptedQuotes.length} accepted quote{acceptedQuotes.length === 1 ? "" : "s"} ready.</p>
          <select value={selectedQuoteId} onChange={(event) => setQuoteId(event.target.value)} className="mt-4 min-h-11 w-full rounded-xl border border-slate-700 bg-slate-950 px-3 text-sm">
            {!acceptedQuotes.length ? <option value="">Nothing ready</option> : null}
            {acceptedQuotes.map((quote) => <option key={quote.id} value={quote.id}>{quote.number} · {quote.title}</option>)}
          </select>
          <Button className="mt-auto w-full" disabled={!selectedQuoteId} onClick={() => onConvertQuote(selectedQuoteId)}>Create linked job</Button>
        </Card>

        <Card className="flex min-h-64 flex-col">
          <ReceiptText className="size-6 text-emerald-300" />
          <h3 className="mt-4 font-bold">Generate Invoice</h3>
          <p className="mt-2 text-sm text-slate-500">{completedJobs.length} completed job{completedJobs.length === 1 ? "" : "s"} ready.</p>
          <select value={selectedJobId} onChange={(event) => setJobId(event.target.value)} className="mt-4 min-h-11 w-full rounded-xl border border-slate-700 bg-slate-950 px-3 text-sm">
            {!completedJobs.length ? <option value="">Nothing ready</option> : null}
            {completedJobs.map((job) => <option key={job.id} value={job.id}>{job.title}</option>)}
          </select>
          <Button className="mt-auto w-full" disabled={!selectedJobId} onClick={() => onGenerateInvoice(selectedJobId)}>Create draft invoice</Button>
        </Card>

        <Card className="flex min-h-64 flex-col">
          <PackageCheck className="size-6 text-amber-300" />
          <h3 className="mt-4 font-bold">Order Materials</h3>
          <p className="mt-2 text-sm text-slate-500">{orderDocuments.length} priced material list{orderDocuments.length === 1 ? "" : "s"} ready.</p>
          <select value={selectedDocumentId} onChange={(event) => setDocumentId(event.target.value)} className="mt-4 min-h-11 w-full rounded-xl border border-slate-700 bg-slate-950 px-3 text-sm">
            {!orderDocuments.length ? <option value="">Nothing ready</option> : null}
            {orderDocuments.map((document) => <option key={document.id} value={document.id}>{document.number} · {document.title}</option>)}
          </select>
          <Button className="mt-auto w-full" disabled={!selectedDocumentId} onClick={() => onOrderMaterials(selectedDocumentId)}>Create purchase list</Button>
        </Card>

        <Card className="flex min-h-64 flex-col">
          <MessageCircle className="size-6 text-fuchsia-300" />
          <h3 className="mt-4 font-bold">Contact Customer</h3>
          <p className="mt-2 text-sm text-slate-500">Uses the customer&apos;s saved preferred contact method.</p>
          <select value={selectedCustomerId} onChange={(event) => setCustomerId(event.target.value)} className="mt-4 min-h-11 w-full rounded-xl border border-slate-700 bg-slate-950 px-3 text-sm">
            {!customers.length ? <option value="">No customers</option> : null}
            {customers.map((customer) => <option key={customer.id} value={customer.id}>{customer.name}</option>)}
          </select>
          <a
            href={contact.href}
            target={contact.href.startsWith("https://") ? "_blank" : undefined}
            rel={contact.href.startsWith("https://") ? "noreferrer" : undefined}
            onClick={() => selectedCustomerId && onContactCustomer(selectedCustomerId)}
            className={`mt-auto flex min-h-11 items-center justify-center rounded-xl px-4 text-sm font-semibold ${selectedCustomerId ? "bg-cyan-400 text-slate-950 hover:bg-cyan-300" : "pointer-events-none bg-slate-800 text-slate-500"}`}
          >
            <ContactIcon className="mr-2 size-4" />{contact.label}
          </a>
        </Card>
      </div>
    </section>
  );
}

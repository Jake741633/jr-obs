"use client";

import Image from "next/image";
import Link from "next/link";
import { ChangeEvent } from "react";
import {
  Building2,
  CheckCircle2,
  ClipboardCheck,
  FileText,
  Landmark,
  Palette,
  Percent,
  Plus,
  SlidersHorizontal,
  Trash2,
  Upload,
} from "lucide-react";
import {
  businessStorageKeys,
  defaultBankDetails,
  defaultBusinessProfile,
  defaultCertificateDefaults,
  defaultDocumentBranding,
  defaultPaymentTermsTemplates,
  defaultVatSettings,
} from "../../lib/businessSettings";
import { defaultQuotePricingSettings } from "../../lib/quoteEngine";
import { defaultBusinessTermsTemplates } from "../../lib/quoteTemplates";
import { makeId, useLocalStorageCollection } from "../../lib/storage";
import type {
  BusinessBankDetails,
  BusinessProfile,
  BusinessTermsTemplate,
  CertificateDefaults,
  CertificateType,
  DocumentBrandingSettings,
  DocumentLogoPosition,
  LabourRate,
  PaymentTermsTemplate,
  PaymentTermsType,
  QuotePricingSettings,
  VatRegistrationStatus,
  VatSettings,
} from "../../lib/models";
import { Button } from "../ui/Button";
import { Card } from "../ui/Card";
import { InputField, TextareaField } from "../ui/FormField";

const fieldClass = "min-h-11 w-full rounded-xl border border-slate-700 bg-slate-950 px-3 text-white outline-none transition focus:border-cyan-400";
const paymentTypes: PaymentTermsType[] = ["Deposit", "Staged payments", "Due on completion"];
const vatStatuses: VatRegistrationStatus[] = ["Not registered", "Registration pending", "VAT registered"];
const logoPositions: DocumentLogoPosition[] = ["Left", "Centre", "Right"];
const certificateTypes: CertificateType[] = [
  "Electrical Installation Certificate",
  "Minor Electrical Installation Works Certificate",
  "Electrical Installation Condition Report",
  "Emergency Lighting Certificate",
  "Fire Alarm Certificate",
  "Other",
];

export function BusinessManagementCentre() {
  const profileStore = useLocalStorageCollection<BusinessProfile>(businessStorageKeys.profile, [defaultBusinessProfile]);
  const vatStore = useLocalStorageCollection<VatSettings>(businessStorageKeys.vat, [defaultVatSettings]);
  const bankStore = useLocalStorageCollection<BusinessBankDetails>(businessStorageKeys.bank, [defaultBankDetails]);
  const paymentTermsStore = useLocalStorageCollection<PaymentTermsTemplate>(businessStorageKeys.paymentTerms, defaultPaymentTermsTemplates);
  const termsStore = useLocalStorageCollection<BusinessTermsTemplate>("jr-os-business-terms-templates", defaultBusinessTermsTemplates);
  const brandingStore = useLocalStorageCollection<DocumentBrandingSettings>(businessStorageKeys.branding, [defaultDocumentBranding]);
  const certificateDefaultsStore = useLocalStorageCollection<CertificateDefaults>(businessStorageKeys.certificates, [defaultCertificateDefaults]);
  const quoteSettingsStore = useLocalStorageCollection<QuotePricingSettings>("jr-os-quote-engine-settings", [defaultQuotePricingSettings]);
  const labourRates = useLocalStorageCollection<LabourRate>("jr-os-labour-rates");

  const profile = profileStore.items[0] ?? defaultBusinessProfile;
  const vat = vatStore.items[0] ?? defaultVatSettings;
  const bank = bankStore.items[0] ?? defaultBankDetails;
  const branding = brandingStore.items[0] ?? defaultDocumentBranding;
  const certificateDefaults = certificateDefaultsStore.items[0] ?? defaultCertificateDefaults;
  const quoteSettings = quoteSettingsStore.items[0] ?? defaultQuotePricingSettings;
  const ready = profileStore.isReady && vatStore.isReady && bankStore.isReady && paymentTermsStore.isReady && termsStore.isReady
    && brandingStore.isReady && certificateDefaultsStore.isReady && quoteSettingsStore.isReady && labourRates.isReady;

  function updateProfile(patch: Partial<BusinessProfile>) {
    profileStore.setItems([{ ...profile, ...patch, updatedAt: new Date().toISOString() }]);
  }

  function updateVat(patch: Partial<VatSettings>) {
    vatStore.setItems([{ ...vat, ...patch, updatedAt: new Date().toISOString() }]);
  }

  function updateBank(patch: Partial<BusinessBankDetails>) {
    bankStore.setItems([{ ...bank, ...patch, updatedAt: new Date().toISOString() }]);
  }

  function updateBranding(patch: Partial<DocumentBrandingSettings>) {
    brandingStore.setItems([{ ...branding, ...patch, updatedAt: new Date().toISOString() }]);
  }

  function updateCertificateDefaults(patch: Partial<CertificateDefaults>) {
    certificateDefaultsStore.setItems([{ ...certificateDefaults, ...patch, updatedAt: new Date().toISOString() }]);
  }

  function updateQuoteSettings(patch: Partial<QuotePricingSettings>) {
    quoteSettingsStore.setItems([{ ...quoteSettings, ...patch }]);
  }

  async function uploadLogo(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      window.alert("Choose an image file for the company logo.");
      return;
    }
    if (file.size > 1_500_000) {
      window.alert("Choose a logo smaller than 1.5 MB so it remains reliable in browser storage.");
      return;
    }
    const dataUrl = await new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result ?? ""));
      reader.onerror = () => reject(new Error("Unable to read logo"));
      reader.readAsDataURL(file);
    }).catch(() => "");
    if (!dataUrl) {
      window.alert("The logo could not be read.");
      return;
    }
    updateProfile({ logoDataUrl: dataUrl, logoFileName: file.name });
  }

  function addPaymentTermsTemplate() {
    const now = new Date().toISOString();
    paymentTermsStore.setItems((current) => [...current, {
      id: makeId("payment-terms"),
      name: "New payment terms",
      type: "Due on completion",
      description: "",
      dueDays: 0,
      active: true,
      isDefault: current.length === 0,
      createdAt: now,
      updatedAt: now,
    }]);
  }

  function updatePaymentTerms(id: string, patch: Partial<PaymentTermsTemplate>) {
    const now = new Date().toISOString();
    paymentTermsStore.setItems((current) => current.map((item) => item.id === id ? { ...item, ...patch, updatedAt: now } : item));
  }

  function makeDefaultPaymentTerms(id: string) {
    const now = new Date().toISOString();
    paymentTermsStore.setItems((current) => current.map((item) => ({ ...item, isDefault: item.id === id, updatedAt: item.id === id ? now : item.updatedAt })));
  }

  function deletePaymentTerms(template: PaymentTermsTemplate) {
    if (!window.confirm(`Delete the "${template.name}" payment template?`)) return;
    paymentTermsStore.setItems((current) => {
      const remaining = current.filter((item) => item.id !== template.id);
      if (template.isDefault && remaining.length) return remaining.map((item, index) => ({ ...item, isDefault: index === 0 }));
      return remaining;
    });
  }

  function addTermsTemplate() {
    const now = new Date().toISOString();
    termsStore.setItems((current) => [...current, {
      id: makeId("terms"),
      name: "New terms template",
      content: "",
      active: true,
      createdAt: now,
      updatedAt: now,
    }]);
  }

  function updateTerms(id: string, patch: Partial<BusinessTermsTemplate>) {
    termsStore.setItems((current) => current.map((item) => item.id === id ? { ...item, ...patch, updatedAt: new Date().toISOString() } : item));
  }

  function deleteTerms(template: BusinessTermsTemplate) {
    if (window.confirm(`Delete the "${template.name}" terms template? Existing quotes will keep their saved wording.`)) {
      termsStore.remove((item) => item.id === template.id);
    }
  }

  if (!ready) return <Card>Loading business settings…</Card>;

  return <div className="space-y-6">
    <div className="flex items-center gap-2 rounded-xl border border-emerald-500/20 bg-emerald-500/5 px-4 py-3 text-sm text-emerald-300">
      <CheckCircle2 className="size-4" />
      Changes save automatically using the existing JR OS storage and backup pattern.
    </div>

    <section className="grid gap-6 xl:grid-cols-[1.25fr_0.75fr]">
      <Card>
        <div className="flex items-center gap-3">
          <Building2 className="size-6 text-cyan-300" />
          <div><h2 className="text-xl font-bold">Business profile</h2><p className="text-sm text-slate-500">The identity and contact details used across JR OS documents.</p></div>
        </div>
        <div className="mt-5 grid gap-4 md:grid-cols-2">
          <InputField label="Company name" value={profile.companyName} onChange={(event) => updateProfile({ companyName: event.target.value })} />
          <InputField label="Phone" type="tel" value={profile.phone} onChange={(event) => updateProfile({ phone: event.target.value })} />
          <InputField label="Email" type="email" value={profile.email} onChange={(event) => updateProfile({ email: event.target.value })} />
          <InputField label="Website" type="url" value={profile.website} onChange={(event) => updateProfile({ website: event.target.value })} />
          <div className="md:col-span-2"><TextareaField label="Business address" value={profile.address} onChange={(event) => updateProfile({ address: event.target.value })} /></div>
        </div>
      </Card>

      <Card>
        <div className="flex items-center gap-3"><Upload className="size-6 text-violet-300" /><div><h2 className="text-xl font-bold">Company logo</h2><p className="text-sm text-slate-500">PNG, JPG, WebP or SVG up to 1.5 MB.</p></div></div>
        <div className="mt-5 grid min-h-44 place-items-center rounded-2xl border border-dashed border-slate-700 bg-slate-950/70 p-5">
          {profile.logoDataUrl ? <Image unoptimized src={profile.logoDataUrl} alt={`${profile.companyName} logo`} width={240} height={120} className="max-h-28 w-auto object-contain" /> : <div className="text-center"><Building2 className="mx-auto size-10 text-slate-600" /><p className="mt-3 text-sm text-slate-500">No logo uploaded yet</p></div>}
        </div>
        {profile.logoFileName ? <p className="mt-3 truncate text-xs text-slate-500">{profile.logoFileName}</p> : null}
        <div className="mt-4 flex flex-wrap gap-2">
          <label className="inline-flex min-h-11 cursor-pointer items-center rounded-xl bg-cyan-400 px-4 text-sm font-semibold text-slate-950 hover:bg-cyan-300"><Upload className="mr-2 size-4" />Upload logo<input type="file" accept="image/*" className="hidden" onChange={uploadLogo} /></label>
          {profile.logoDataUrl ? <Button type="button" variant="secondary" onClick={() => updateProfile({ logoDataUrl: "", logoFileName: "" })}>Remove</Button> : null}
        </div>
      </Card>
    </section>

    <section className="grid gap-6 xl:grid-cols-2">
      <Card>
        <div className="flex items-center gap-3"><Percent className="size-6 text-amber-300" /><div><h2 className="text-xl font-bold">VAT settings</h2><p className="text-sm text-slate-500">Registration state and document defaults. This does not submit a VAT registration.</p></div></div>
        <div className="mt-5 grid gap-4 sm:grid-cols-2">
          <label className="grid gap-2 text-sm font-medium text-slate-300"><span>Registration status</span><select className={fieldClass} value={vat.registrationStatus} onChange={(event) => updateVat({ registrationStatus: event.target.value as VatRegistrationStatus })}>{vatStatuses.map((status) => <option key={status}>{status}</option>)}</select></label>
          <InputField label="VAT registration number" value={vat.registrationNumber} disabled={vat.registrationStatus === "Not registered"} onChange={(event) => updateVat({ registrationNumber: event.target.value })} />
          <InputField label="Default VAT rate (%)" type="number" min="0" max="100" step="0.1" value={vat.defaultRate} onChange={(event) => updateVat({ defaultRate: Number(event.target.value || 0) })} />
          <label className="flex min-h-11 items-center gap-3 rounded-xl border border-slate-700 px-3 text-sm text-slate-300"><input type="checkbox" checked={vat.pricesIncludeVat} onChange={(event) => updateVat({ pricesIncludeVat: event.target.checked })} /><span>Entered prices include VAT</span></label>
          <label className="flex min-h-11 items-center gap-3 rounded-xl border border-slate-700 px-3 text-sm text-slate-300 sm:col-span-2"><input type="checkbox" checked={vat.showVatNumberOnDocuments} onChange={(event) => updateVat({ showVatNumberOnDocuments: event.target.checked })} /><span>Show the VAT number on customer documents when registered</span></label>
        </div>
      </Card>

      <Card>
        <div className="flex items-center gap-3"><Landmark className="size-6 text-emerald-300" /><div><h2 className="text-xl font-bold">Bank details for invoices</h2><p className="text-sm text-slate-500">Saved once and available to every new invoice.</p></div></div>
        <div className="mt-5 grid gap-4 sm:grid-cols-2">
          <InputField label="Account name" value={bank.accountName} onChange={(event) => updateBank({ accountName: event.target.value })} />
          <InputField label="Bank name" value={bank.bankName} onChange={(event) => updateBank({ bankName: event.target.value })} />
          <InputField label="Sort code" inputMode="numeric" value={bank.sortCode} onChange={(event) => updateBank({ sortCode: event.target.value })} />
          <InputField label="Account number" inputMode="numeric" value={bank.accountNumber} onChange={(event) => updateBank({ accountNumber: event.target.value })} />
          <InputField label="IBAN (optional)" value={bank.iban} onChange={(event) => updateBank({ iban: event.target.value })} />
          <InputField label="BIC / SWIFT (optional)" value={bank.bic} onChange={(event) => updateBank({ bic: event.target.value })} />
          <InputField label="Payment reference prefix" value={bank.paymentReferencePrefix} onChange={(event) => updateBank({ paymentReferencePrefix: event.target.value })} />
          <div className="sm:col-span-2"><TextareaField label="Payment instructions" value={bank.paymentInstructions} onChange={(event) => updateBank({ paymentInstructions: event.target.value })} /></div>
        </div>
      </Card>
    </section>

    <Card>
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="flex items-center gap-3"><Landmark className="size-6 text-cyan-300" /><div><h2 className="text-xl font-bold">Payment terms templates</h2><p className="text-sm text-slate-500">Create reusable deposit, staged-payment and completion terms.</p></div></div>
        <Button type="button" onClick={addPaymentTermsTemplate}><Plus className="mr-2 size-4" />Add template</Button>
      </div>
      <div className="mt-5 grid gap-4 xl:grid-cols-2">
        {paymentTermsStore.items.map((template) => <div key={template.id} className={`rounded-2xl border p-4 ${template.isDefault ? "border-cyan-400/40 bg-cyan-400/5" : "border-slate-800 bg-slate-950/50"}`}>
          <div className="flex items-start justify-between gap-3">
            <div className="flex flex-wrap gap-2">
              {template.isDefault ? <span className="rounded-full bg-cyan-400/10 px-2 py-1 text-xs font-semibold text-cyan-300">Default</span> : null}
              {!template.active ? <span className="rounded-full bg-slate-800 px-2 py-1 text-xs font-semibold text-slate-400">Inactive</span> : null}
            </div>
            <button type="button" onClick={() => deletePaymentTerms(template)} aria-label={`Delete ${template.name}`} className="rounded-lg p-2 text-slate-500 hover:bg-red-500/10 hover:text-red-300"><Trash2 className="size-4" /></button>
          </div>
          <div className="mt-3 grid gap-3 sm:grid-cols-2">
            <InputField label="Template name" value={template.name} onChange={(event) => updatePaymentTerms(template.id, { name: event.target.value })} />
            <label className="grid gap-2 text-sm font-medium text-slate-300"><span>Payment structure</span><select className={fieldClass} value={template.type} onChange={(event) => updatePaymentTerms(template.id, { type: event.target.value as PaymentTermsType })}>{paymentTypes.map((type) => <option key={type}>{type}</option>)}</select></label>
            <InputField label="Invoice due days" type="number" min="0" value={template.dueDays} onChange={(event) => updatePaymentTerms(template.id, { dueDays: Number(event.target.value || 0) })} />
            {template.type === "Deposit" ? <InputField label="Deposit (%)" type="number" min="0" max="100" value={template.depositPercent ?? 25} onChange={(event) => updatePaymentTerms(template.id, { depositPercent: Number(event.target.value || 0) })} /> : null}
            {template.type === "Staged payments" ? <div className="sm:col-span-2"><TextareaField label="Payment stages" value={template.stages ?? ""} onChange={(event) => updatePaymentTerms(template.id, { stages: event.target.value })} /></div> : null}
            <div className="sm:col-span-2"><TextareaField label="Customer-facing wording" value={template.description} onChange={(event) => updatePaymentTerms(template.id, { description: event.target.value })} /></div>
          </div>
          <div className="mt-4 flex flex-wrap gap-2">
            {!template.isDefault ? <Button type="button" variant="secondary" onClick={() => makeDefaultPaymentTerms(template.id)}>Make default</Button> : null}
            <Button type="button" variant="secondary" onClick={() => updatePaymentTerms(template.id, { active: !template.active })}>{template.active ? "Deactivate" : "Activate"}</Button>
          </div>
        </div>)}
      </div>
    </Card>

    <Card>
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="flex items-center gap-3"><FileText className="size-6 text-violet-300" /><div><h2 className="text-xl font-bold">Terms & Conditions library</h2><p className="text-sm text-slate-500">Editable wording for domestic, commercial, testing and custom work.</p></div></div>
        <Button type="button" onClick={addTermsTemplate}><Plus className="mr-2 size-4" />Add terms</Button>
      </div>
      <div className="mt-5 grid gap-4 xl:grid-cols-2">
        {termsStore.items.map((template) => <div key={template.id} className="rounded-2xl border border-slate-800 bg-slate-950/50 p-4">
          <div className="flex items-start gap-3">
            <div className="min-w-0 flex-1"><InputField label="Template name" value={template.name} onChange={(event) => updateTerms(template.id, { name: event.target.value })} /></div>
            <button type="button" onClick={() => deleteTerms(template)} aria-label={`Delete ${template.name}`} className="mt-7 rounded-lg p-2 text-slate-500 hover:bg-red-500/10 hover:text-red-300"><Trash2 className="size-4" /></button>
          </div>
          <div className="mt-3"><TextareaField label="Terms & Conditions" className="min-h-44" value={template.content} onChange={(event) => updateTerms(template.id, { content: event.target.value })} /></div>
          <div className="mt-3 flex items-center justify-between gap-3"><span className={`text-xs font-semibold ${template.active ? "text-emerald-300" : "text-slate-500"}`}>{template.active ? "Available in quotes" : "Hidden from selectors"}</span><Button type="button" variant="secondary" onClick={() => updateTerms(template.id, { active: !template.active })}>{template.active ? "Deactivate" : "Activate"}</Button></div>
        </div>)}
      </div>
    </Card>

    <section className="grid gap-6 xl:grid-cols-[1.2fr_0.8fr]">
      <Card>
        <div className="flex items-center gap-3"><Palette className="size-6 text-fuchsia-300" /><div><h2 className="text-xl font-bold">Quote & invoice branding</h2><p className="text-sm text-slate-500">Control the shared header, colours, contact details and footer.</p></div></div>
        <div className="mt-5 grid gap-4 sm:grid-cols-2">
          <InputField label="Primary colour" type="color" value={branding.primaryColour} onChange={(event) => updateBranding({ primaryColour: event.target.value })} />
          <InputField label="Accent colour" type="color" value={branding.accentColour} onChange={(event) => updateBranding({ accentColour: event.target.value })} />
          <label className="grid gap-2 text-sm font-medium text-slate-300"><span>Logo position</span><select className={fieldClass} value={branding.logoPosition} onChange={(event) => updateBranding({ logoPosition: event.target.value as DocumentLogoPosition })}>{logoPositions.map((position) => <option key={position}>{position}</option>)}</select></label>
          <InputField label="Quote heading" value={branding.quoteHeading} onChange={(event) => updateBranding({ quoteHeading: event.target.value })} />
          <InputField label="Invoice heading" value={branding.invoiceHeading} onChange={(event) => updateBranding({ invoiceHeading: event.target.value })} />
          <div className="sm:col-span-2"><TextareaField label="Document footer" value={branding.footerText} onChange={(event) => updateBranding({ footerText: event.target.value })} /></div>
        </div>
        <div className="mt-4 grid gap-2 sm:grid-cols-2">
          {([
            ["Show logo", "showLogo"],
            ["Show company address", "showCompanyAddress"],
            ["Show phone, email and website", "showContactDetails"],
            ["Show VAT number when registered", "showVatNumber"],
          ] as const).map(([label, key]) => <label key={key} className="flex min-h-11 items-center gap-3 rounded-xl border border-slate-700 px-3 text-sm text-slate-300"><input type="checkbox" checked={branding[key]} onChange={(event) => updateBranding({ [key]: event.target.checked })} /><span>{label}</span></label>)}
        </div>
      </Card>

      <Card>
        <p className="text-xs font-semibold uppercase tracking-wider text-fuchsia-300">Live brand preview</p>
        <div className="mt-4 overflow-hidden rounded-xl bg-white text-slate-900 shadow-xl">
          <div className="border-b-4 p-5" style={{ borderColor: branding.primaryColour }}>
            <div className={`flex gap-4 ${branding.logoPosition === "Centre" ? "flex-col items-center text-center" : branding.logoPosition === "Right" ? "flex-row-reverse text-right" : "items-start"}`}>
              {branding.showLogo && profile.logoDataUrl ? <Image unoptimized src={profile.logoDataUrl} alt="" width={90} height={60} className="max-h-14 w-auto object-contain" /> : null}
              <div className="min-w-0 flex-1"><p className="truncate text-lg font-black">{profile.companyName || "Company name"}</p>{branding.showCompanyAddress ? <p className="mt-1 whitespace-pre-line text-xs text-slate-500">{profile.address || "Business address"}</p> : null}</div>
            </div>
          </div>
          <div className="p-5">
            <p className="text-2xl font-light uppercase" style={{ color: branding.primaryColour }}>{branding.quoteHeading || "Quotation"}</p>
            {branding.showContactDetails ? <p className="mt-3 text-xs text-slate-500">{[profile.phone, profile.email, profile.website].filter(Boolean).join(" · ") || "Contact details"}</p> : null}
            {branding.showVatNumber && vat.registrationStatus === "VAT registered" && vat.registrationNumber ? <p className="mt-1 text-xs text-slate-500">VAT: {vat.registrationNumber}</p> : null}
          </div>
          {branding.footerText ? <div className="px-5 py-3 text-xs text-slate-600" style={{ backgroundColor: `${branding.accentColour}18` }}>{branding.footerText}</div> : null}
        </div>
      </Card>
    </section>

    <section className="grid gap-6 xl:grid-cols-2">
      <Card>
        <div className="flex items-center gap-3"><SlidersHorizontal className="size-6 text-cyan-300" /><div><h2 className="text-xl font-bold">Business pricing defaults</h2><p className="text-sm text-slate-500">These are the same defaults used by Quote Engine 2.0.</p></div></div>
        <div className="mt-5 grid gap-4 sm:grid-cols-2">
          <label className="grid gap-2 text-sm font-medium text-slate-300 sm:col-span-2"><span>Default labour rate</span><select className={fieldClass} value={quoteSettings.defaultLabourRateId ?? ""} onChange={(event) => updateQuoteSettings({ defaultLabourRateId: event.target.value })}><option value="">Choose per quote</option>{labourRates.items.filter((rate) => rate.active).map((rate) => <option key={rate.id} value={rate.id}>{rate.name} · £{rate.chargeRate.toFixed(2)} / {rate.unit.toLowerCase()}</option>)}</select></label>
          <InputField label="Travel cost (£)" type="number" min="0" step="0.01" value={quoteSettings.travelCost} onChange={(event) => updateQuoteSettings({ travelCost: Number(event.target.value || 0) })} />
          <InputField label="Travel charge (£)" type="number" min="0" step="0.01" value={quoteSettings.travelPrice} onChange={(event) => updateQuoteSettings({ travelPrice: Number(event.target.value || 0) })} />
          <InputField label="Parking cost (£)" type="number" min="0" step="0.01" value={quoteSettings.parkingCost} onChange={(event) => updateQuoteSettings({ parkingCost: Number(event.target.value || 0) })} />
          <InputField label="Parking charge (£)" type="number" min="0" step="0.01" value={quoteSettings.parkingPrice} onChange={(event) => updateQuoteSettings({ parkingPrice: Number(event.target.value || 0) })} />
          <InputField label="Material mark-up (%)" type="number" min="0" step="0.1" value={quoteSettings.materialMarkupPercent} onChange={(event) => updateQuoteSettings({ materialMarkupPercent: Number(event.target.value || 0) })} />
          <InputField label="Contingency (%)" type="number" min="0" step="0.1" value={quoteSettings.contingencyPercent} onChange={(event) => updateQuoteSettings({ contingencyPercent: Number(event.target.value || 0) })} />
        </div>
        <Link href="/labour-costs" className="mt-5 inline-flex min-h-11 items-center rounded-xl border border-slate-700 bg-slate-900 px-4 text-sm font-semibold text-slate-100 hover:bg-slate-800">Edit all labour rates & overheads</Link>
      </Card>

      <Card>
        <div className="flex items-center gap-3"><ClipboardCheck className="size-6 text-emerald-300" /><div><h2 className="text-xl font-bold">Certificate defaults</h2><p className="text-sm text-slate-500">Pre-fill new certificate records while leaving every field editable.</p></div></div>
        <div className="mt-5 grid gap-4 sm:grid-cols-2">
          <InputField label="Inspector name" value={certificateDefaults.inspectorName} onChange={(event) => updateCertificateDefaults({ inspectorName: event.target.value })} />
          <InputField label="Scheme provider" placeholder="NICEIC, NAPIT or leave blank" value={certificateDefaults.schemeProvider} onChange={(event) => updateCertificateDefaults({ schemeProvider: event.target.value })} />
          <InputField label="Registration number" value={certificateDefaults.registrationNumber} onChange={(event) => updateCertificateDefaults({ registrationNumber: event.target.value })} />
          <InputField label="Certificate prefix" value={certificateDefaults.certificatePrefix} onChange={(event) => updateCertificateDefaults({ certificatePrefix: event.target.value.toUpperCase() })} />
          <label className="grid gap-2 text-sm font-medium text-slate-300 sm:col-span-2"><span>Default certificate type</span><select className={fieldClass} value={certificateDefaults.defaultType} onChange={(event) => updateCertificateDefaults({ defaultType: event.target.value as CertificateType })}>{certificateTypes.map((type) => <option key={type}>{type}</option>)}</select></label>
          <label className="grid gap-2 text-sm font-medium text-slate-300"><span>Default outcome</span><select className={fieldClass} value={certificateDefaults.defaultOutcome} onChange={(event) => updateCertificateDefaults({ defaultOutcome: event.target.value as CertificateDefaults["defaultOutcome"] })}><option>Satisfactory</option><option>Unsatisfactory</option><option>Not applicable</option></select></label>
          <InputField label="Next inspection (years)" type="number" min="0" max="25" value={certificateDefaults.nextInspectionYears} onChange={(event) => updateCertificateDefaults({ nextInspectionYears: Number(event.target.value || 0) })} />
          <div className="sm:col-span-2"><TextareaField label="Default certificate notes" value={certificateDefaults.notes} onChange={(event) => updateCertificateDefaults({ notes: event.target.value })} /></div>
        </div>
      </Card>
    </section>
  </div>;
}

import type {
  BusinessBankDetails,
  BusinessProfile,
  CertificateDefaults,
  DocumentBrandingSettings,
  PaymentTermsTemplate,
  QuotePaymentTerms,
  VatSettings,
} from "./models";

const initialTimestamp = new Date(0).toISOString();

export const businessStorageKeys = {
  profile: "jr-os-business-profile",
  vat: "jr-os-vat-settings",
  bank: "jr-os-bank-details",
  paymentTerms: "jr-os-payment-terms-templates",
  branding: "jr-os-document-branding",
  certificates: "jr-os-certificate-defaults",
} as const;

export const defaultBusinessProfile: BusinessProfile = {
  id: "business-profile",
  companyName: "",
  logoDataUrl: "",
  logoFileName: "",
  address: "",
  phone: "",
  email: "",
  website: "",
  updatedAt: initialTimestamp,
};

export const defaultVatSettings: VatSettings = {
  id: "vat-settings",
  registrationStatus: "Not registered",
  registrationNumber: "",
  defaultRate: 20,
  pricesIncludeVat: false,
  showVatNumberOnDocuments: true,
  updatedAt: initialTimestamp,
};

export const defaultBankDetails: BusinessBankDetails = {
  id: "bank-details",
  accountName: "",
  bankName: "",
  sortCode: "",
  accountNumber: "",
  iban: "",
  bic: "",
  paymentReferencePrefix: "INV",
  paymentInstructions: "Please use the invoice number as the payment reference.",
  updatedAt: initialTimestamp,
};

export const defaultPaymentTermsTemplates: PaymentTermsTemplate[] = [
  {
    id: "payment-completion",
    name: "Due on completion",
    type: "Due on completion",
    description: "Payment is due when the agreed electrical works are complete.",
    dueDays: 0,
    active: true,
    isDefault: true,
    createdAt: initialTimestamp,
    updatedAt: initialTimestamp,
  },
  {
    id: "payment-deposit",
    name: "25% deposit and balance",
    type: "Deposit",
    description: "A 25% deposit secures the booking. The remaining balance is due on completion.",
    dueDays: 0,
    depositPercent: 25,
    active: true,
    isDefault: false,
    createdAt: initialTimestamp,
    updatedAt: initialTimestamp,
  },
  {
    id: "payment-staged",
    name: "Staged project payments",
    type: "Staged payments",
    description: "Payments follow the agreed project milestones.",
    dueDays: 7,
    stages: "30% deposit · 40% after first fix · 30% on completion",
    active: true,
    isDefault: false,
    createdAt: initialTimestamp,
    updatedAt: initialTimestamp,
  },
];

export const defaultDocumentBranding: DocumentBrandingSettings = {
  id: "document-branding",
  primaryColour: "#0e7490",
  accentColour: "#22d3ee",
  logoPosition: "Left",
  showLogo: true,
  showCompanyAddress: true,
  showContactDetails: true,
  showVatNumber: true,
  quoteHeading: "Quotation",
  invoiceHeading: "Invoice",
  footerText: "Thank you for your business.",
  updatedAt: initialTimestamp,
};

export const defaultCertificateDefaults: CertificateDefaults = {
  id: "certificate-defaults",
  inspectorName: "",
  schemeProvider: "",
  registrationNumber: "",
  defaultType: "Electrical Installation Condition Report",
  defaultOutcome: "Not applicable",
  certificatePrefix: "CERT",
  nextInspectionYears: 5,
  notes: "",
  updatedAt: initialTimestamp,
};

export function paymentTermsFromTemplate(template: PaymentTermsTemplate): QuotePaymentTerms {
  return {
    type: template.type,
    templateId: template.id,
    name: template.name,
    description: template.description,
    dueDays: template.dueDays,
    depositPercent: template.depositPercent,
    stages: template.stages,
  };
}

export function paymentTermsText(paymentTerms?: QuotePaymentTerms) {
  if (!paymentTerms) return "Due on completion";
  const summary = paymentTerms.type === "Deposit"
    ? `${paymentTerms.depositPercent ?? 25}% deposit, balance due on completion`
    : paymentTerms.type === "Staged payments"
      ? paymentTerms.stages || "Staged payments to be agreed before work starts"
      : paymentTerms.dueDays && paymentTerms.dueDays > 0
        ? `Payment due within ${paymentTerms.dueDays} days`
        : "Payment due on completion";
  return [summary, paymentTerms.description].filter(Boolean).join("\n");
}

export function bankDetailsText(details: BusinessBankDetails) {
  return [
    details.accountName ? `Account name: ${details.accountName}` : "",
    details.bankName ? `Bank: ${details.bankName}` : "",
    details.sortCode ? `Sort code: ${details.sortCode}` : "",
    details.accountNumber ? `Account number: ${details.accountNumber}` : "",
    details.iban ? `IBAN: ${details.iban}` : "",
    details.bic ? `BIC: ${details.bic}` : "",
    details.paymentInstructions,
  ].filter(Boolean).join("\n");
}

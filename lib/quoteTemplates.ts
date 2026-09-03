import type { BusinessTermsTemplate, PaymentTermsType, PricingLineItem, QuoteTemplateType } from "./models";

export interface QuoteTemplateDefinition {
  type: QuoteTemplateType;
  title: string;
  notes: string;
  termsTemplateId: string;
  paymentType: PaymentTermsType;
  sections: Array<Pick<PricingLineItem, "description" | "category">>;
}

export const defaultBusinessTermsTemplates: BusinessTermsTemplate[] = [
  {
    id: "terms-domestic",
    name: "Domestic standard",
    content: "This quotation is based on the described scope. Variations, unforeseen work, making good and decoration are excluded unless stated. Access must be available on the agreed dates.",
    active: true,
    createdAt: new Date(0).toISOString(),
    updatedAt: new Date(0).toISOString(),
  },
  {
    id: "terms-commercial",
    name: "Commercial standard",
    content: "This quotation is based on the issued scope and accessible working areas. Builder's work, permits, out-of-hours working, specialist access and delays outside our control are excluded unless stated.",
    active: true,
    createdAt: new Date(0).toISOString(),
    updatedAt: new Date(0).toISOString(),
  },
  {
    id: "terms-testing",
    name: "Inspection and testing",
    content: "The price covers inspection and testing of accessible parts of the installation. Remedial works are excluded and will be quoted separately. Limitations will be recorded on the certificate or report.",
    active: true,
    createdAt: new Date(0).toISOString(),
    updatedAt: new Date(0).toISOString(),
  },
];

export const quoteTemplates: QuoteTemplateDefinition[] = [
  { type: "Domestic", title: "Domestic electrical works", notes: "Electrical installation work as described following the site survey.", termsTemplateId: "terms-domestic", paymentType: "Due on completion", sections: [{ description: "Electrical labour", category: "Labour" }, { description: "Electrical materials and sundries", category: "Materials" }] },
  { type: "Commercial", title: "Commercial electrical works", notes: "Commercial installation works completed to the agreed programme and scope.", termsTemplateId: "terms-commercial", paymentType: "Staged payments", sections: [{ description: "Electrical labour", category: "Labour" }, { description: "Materials", category: "Materials" }, { description: "Plant and access equipment", category: "Plant Hire" }] },
  { type: "Rewire", title: "Property rewire", notes: "Complete rewire subject to final design, point schedule and site conditions.", termsTemplateId: "terms-domestic", paymentType: "Staged payments", sections: [{ description: "First and second fix labour", category: "Labour" }, { description: "Wiring accessories, cable and consumer equipment", category: "Materials" }, { description: "Rewire contingency allowance", category: "Contingency" }] },
  { type: "EICR", title: "Electrical Installation Condition Report", notes: "Inspection and testing with an EICR issued on completion.", termsTemplateId: "terms-testing", paymentType: "Due on completion", sections: [{ description: "Inspection, testing and report", category: "Labour" }] },
  { type: "Consumer Unit", title: "Consumer unit replacement", notes: "Replacement consumer unit, testing, certification and notification where applicable.", termsTemplateId: "terms-domestic", paymentType: "Deposit", sections: [{ description: "Installation and testing labour", category: "Labour" }, { description: "Consumer unit, protective devices and sundries", category: "Materials" }] },
  { type: "Fault Finding", title: "Electrical fault finding", notes: "Initial diagnostic attendance. Remedial work and replacement parts will be agreed separately.", termsTemplateId: "terms-testing", paymentType: "Due on completion", sections: [{ description: "Fault-finding attendance", category: "Labour" }, { description: "Replacement materials allowance", category: "Materials" }] },
];

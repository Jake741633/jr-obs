export type EntityId = string;

export interface Customer {
  id: EntityId;
  name: string;
  email: string;
  phone: string;
  address: string;
  notes: string;
  createdAt: string;
  updatedAt: string;
}

export interface Builder {
  id: EntityId;
  companyName: string;
  contactName: string;
  email: string;
  phone: string;
  address: string;
  notes: string;
  createdAt: string;
  updatedAt: string;
}

export type JobStatus = "Lead" | "Quoted" | "Scheduled" | "In progress" | "Complete" | "On hold";

export interface Job {
  id: EntityId;
  title: string;
  customerId?: EntityId;
  builderId?: EntityId;
  siteAddress: string;
  status: JobStatus;
  startDate: string;
  value: number;
  notes: string;
  createdAt: string;
  updatedAt: string;
}

export type PricingDocumentType = "Quote" | "Estimate";
export type PricingDocumentStatus = "Draft" | "Sent" | "Accepted" | "Declined" | "Expired";

export interface PricingLineItem {
  id: EntityId;
  description: string;
  category: "Labour" | "Materials" | "Other";
  quantity: number;
  unitPrice: number;
}

export interface PricingDocument {
  id: EntityId;
  number: string;
  type: PricingDocumentType;
  status: PricingDocumentStatus;
  customerId?: EntityId;
  builderId?: EntityId;
  jobId?: EntityId;
  title: string;
  validUntil: string;
  vatEnabled: boolean;
  vatRate: number;
  items: PricingLineItem[];
  notes: string;
  terms: string;
  createdAt: string;
  updatedAt: string;
}

export type MaterialCategory = "Cable" | "Protection" | "Accessories" | "Lighting" | "Containment" | "EV" | "Testing" | "Fire alarm" | "Emergency lighting" | "Other";
export type MaterialUnit = "Each" | "Metre" | "Drum" | "Box" | "Pack";

export interface Material {
  id: EntityId;
  name: string;
  category: MaterialCategory;
  manufacturer: string;
  supplier: string;
  supplierUrl: string;
  stockCode: string;
  unit: MaterialUnit;
  tradeCost: number;
  sellPrice: number;
  favourite: boolean;
  notes: string;
  createdAt: string;
  updatedAt: string;
}

export type EntityBase = Customer | Builder | Job | PricingDocument | Material;

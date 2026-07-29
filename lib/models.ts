export type EntityId = string;

export interface Customer { id: EntityId; name: string; email: string; phone: string; address: string; notes: string; createdAt: string; updatedAt: string; }
export interface Builder { id: EntityId; companyName: string; contactName: string; email: string; phone: string; address: string; notes: string; createdAt: string; updatedAt: string; }
export type JobStatus = "Lead" | "Quoted" | "Scheduled" | "In progress" | "Complete" | "On hold";
export type JobPriority = "Low" | "Normal" | "High" | "Urgent";
export interface Job { id: EntityId; title: string; customerId?: EntityId; builderId?: EntityId; siteAddress: string; status: JobStatus; startDate: string; targetCompletionDate?: string; priority?: JobPriority; assignedTo?: string[]; value: number; notes: string; createdAt: string; updatedAt: string; }

export type JobMilestoneType = "Enquiry received" | "Site survey booked" | "Quote prepared" | "Quote sent" | "Quote accepted" | "Deposit received" | "Materials ordered" | "Materials delivered" | "First fix complete" | "Second fix complete" | "Testing complete" | "Certificate uploaded" | "Invoice sent" | "Payment received" | "Review requested" | "Custom update";
export interface JobTimelineEntry { id: EntityId; jobId: EntityId; milestone: JobMilestoneType; note: string; completedBy: string; completedAt: string; createdAt: string; }

export interface SiteDiaryEntry { id: EntityId; jobId: EntityId; workDate: string; startedAt: string; finishedAt: string; breakMinutes: number; completedBy: string; workCompleted: string; delays: string; customerRequests: string; materialsUsed: string; voiceNotes: string; createdAt: string; updatedAt: string; }
export type VariationStatus = "Draft" | "Awaiting approval" | "Approved" | "Declined" | "Invoiced";
export interface JobVariation { id: EntityId; jobId: EntityId; number: string; title: string; description: string; labourHours: number; labourRate: number; materialCost: number; materialCharge: number; otherCharge: number; status: VariationStatus; approvalMethod: "Not approved" | "Signature" | "Email" | "WhatsApp" | "Verbal"; approvalReference: string; requestedBy: string; createdAt: string; updatedAt: string; }

export type TeamRole = "Owner" | "Electrician" | "Electrician's mate" | "Apprentice" | "Office" | "Subcontractor";
export type TeamMemberStatus = "Active" | "On leave" | "Inactive";
export interface TeamQualification { id: EntityId; name: string; certificateNumber: string; issuedAt: string; expiresAt: string; notes: string; }
export interface TeamMember { id: EntityId; name: string; role: TeamRole; status: TeamMemberStatus; email: string; phone: string; emergencyContact: string; emergencyPhone: string; hourlyCost: number; chargeRate: number; vanRegistration: string; qualifications: TeamQualification[]; notes: string; createdAt: string; updatedAt: string; }
export type TimesheetStatus = "Draft" | "Submitted" | "Approved";
export interface TimesheetEntry { id: EntityId; teamMemberId: EntityId; jobId?: EntityId; workDate: string; startedAt: string; finishedAt: string; breakMinutes: number; notes: string; status: TimesheetStatus; createdAt: string; updatedAt: string; }

export type PricingDocumentType = "Quote" | "Estimate";
export type PricingDocumentStatus = "Draft" | "Sent" | "Accepted" | "Declined" | "Expired";
export interface PricingLineItem { id: EntityId; description: string; category: "Labour" | "Materials" | "Other"; quantity: number; unitPrice: number; unitCost?: number; materialId?: EntityId; supplier?: string; stockCode?: string; }
export interface PricingDocument { id: EntityId; number: string; type: PricingDocumentType; status: PricingDocumentStatus; customerId?: EntityId; builderId?: EntityId; jobId?: EntityId; title: string; validUntil: string; vatEnabled: boolean; vatRate: number; items: PricingLineItem[]; notes: string; terms: string; createdAt: string; updatedAt: string; }

export type InvoiceStatus = "Draft" | "Sent" | "Part paid" | "Paid" | "Overdue" | "Cancelled";
export interface Invoice { id: EntityId; number: string; status: InvoiceStatus; customerId?: EntityId; builderId?: EntityId; jobId?: EntityId; quoteId?: EntityId; title: string; issueDate: string; dueDate: string; vatEnabled: boolean; vatRate: number; items: PricingLineItem[]; amountPaid: number; notes: string; paymentDetails: string; createdAt: string; updatedAt: string; }

export type MaterialCategory = "Cable" | "Protection" | "Accessories" | "Lighting" | "Containment" | "EV" | "Testing" | "Fire alarm" | "Emergency lighting" | "Other";
export type MaterialUnit = "Each" | "Metre" | "Drum" | "Box" | "Pack";
export type MaterialPriceSource = "Manual" | "Supplier link" | "Imported";
export interface MaterialPriceHistory { id: EntityId; tradeCost: number; sellPrice: number; source: MaterialPriceSource; recordedAt: string; }
export interface Material { id: EntityId; name: string; category: MaterialCategory; manufacturer: string; supplier: string; supplierUrl: string; stockCode: string; unit: MaterialUnit; tradeCost: number; sellPrice: number; favourite: boolean; notes: string; lastPriceCheckedAt?: string; priceSource?: MaterialPriceSource; priceHistory?: MaterialPriceHistory[]; createdAt: string; updatedAt: string; }
export interface JobPackMaterial { id: EntityId; materialId?: EntityId; description: string; quantity: number; unitPrice: number; }
export interface JobPack { id: EntityId; name: string; category: string; description: string; labourDescription: string; labourHours: number; labourRate: number; materials: JobPackMaterial[]; testingRequirements: string; certificatesRequired: string; notes: string; createdAt: string; updatedAt: string; }

export type PurchaseItemStatus = "Needed" | "Ordered" | "Delivered";
export interface PurchaseListItem { id: EntityId; materialId?: EntityId; description: string; supplier: string; stockCode: string; supplierUrl?: string; quantity: number; unitCost: number; status: PurchaseItemStatus; }
export interface PurchaseList { id: EntityId; number: string; title: string; pricingDocumentId?: EntityId; jobId?: EntityId; items: PurchaseListItem[]; notes: string; createdAt: string; updatedAt: string; }

export type SurveyStatus = "Draft" | "In progress" | "Complete";
export type SurveySeverity = "Low" | "Medium" | "High";
export interface SurveyCircuit { id: EntityId; name: string; protectiveDevice: string; cableSize: string; estimatedLength: number; observations: string; recommendation: string; }
export interface SurveyPhoto { id: EntityId; name: string; category: string; dataUrl?: string; externalUrl?: string; note: string; severity: SurveySeverity; }
export interface SiteSurvey {
  id: EntityId; number: string; status: SurveyStatus; customerId?: EntityId; builderId?: EntityId; jobId?: EntityId;
  propertyType: string; occupancy: string; floors: number; bedrooms: number; constructionType: string; loftAccess: string; installationAge: string;
  earthingArrangement: string; supplyType: string; fuseRating: string; cutoutType: string; meterPosition: string; consumerUnitPosition: string; mainBonding: string; earthingConductorSize: string;
  consumerUnitManufacturer: string; consumerUnitWays: string; spdFitted: boolean; rcbosFitted: boolean; rcdType: string; spareWays: string; consumerUnitCondition: string;
  circuits: SurveyCircuit[]; photos: SurveyPhoto[]; defects: string[]; risks: string[]; recommendations: string[];
  voiceNotes: string; surveyNotes: string; labourHours: number; labourRate: number; healthScore: number; createdAt: string; updatedAt: string;
}

export type CertificateType = "Electrical Installation Certificate" | "Minor Electrical Installation Works Certificate" | "Electrical Installation Condition Report" | "Emergency Lighting Certificate" | "Fire Alarm Certificate" | "Other";
export type CertificateStatus = "Draft" | "In progress" | "Complete" | "Issued" | "Superseded";
export type ObservationCode = "C1" | "C2" | "C3" | "FI" | "No code";
export type SuggestionConfidence = "High" | "Medium" | "Low";
export interface CertificateObservation {
  id: EntityId;
  sourceText: string;
  location: string;
  observation: string;
  recommendation: string;
  regulationReference: string;
  code: ObservationCode;
  confidence: SuggestionConfidence;
  accepted: boolean;
}
export interface ElectricalCertificate {
  id: EntityId;
  number: string;
  type: CertificateType;
  status: CertificateStatus;
  customerId?: EntityId;
  jobId?: EntityId;
  installationAddress: string;
  description: string;
  inspectorName: string;
  inspectionDate: string;
  nextInspectionDate: string;
  outcome: "Satisfactory" | "Unsatisfactory" | "Not applicable";
  observations: string;
  structuredObservations?: CertificateObservation[];
  externalPdfUrl: string;
  createdAt: string;
  updatedAt: string;
}

export type JobDocumentCategory = "Certificate" | "Photo" | "Drawing" | "RAMS" | "Site note" | "Material order" | "Handover" | "Other";
export interface JobDocument {
  id: EntityId;
  jobId: EntityId;
  name: string;
  category: JobDocumentCategory;
  fileName: string;
  mimeType: string;
  dataUrl?: string;
  externalUrl?: string;
  notes: string;
  uploadedBy: string;
  uploadedAt: string;
  createdAt: string;
}

export type EntityBase = Customer | Builder | Job | JobTimelineEntry | SiteDiaryEntry | JobVariation | TeamMember | TimesheetEntry | PricingDocument | Invoice | Material | JobPack | PurchaseList | SiteSurvey | ElectricalCertificate | JobDocument;
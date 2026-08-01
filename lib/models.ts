export type EntityId = string;

export interface Customer { id: EntityId; name: string; email: string; phone: string; address: string; notes: string; createdAt: string; updatedAt: string; }
export interface Builder { id: EntityId; companyName: string; contactName: string; email: string; phone: string; address: string; notes: string; createdAt: string; updatedAt: string; }
export interface RecordAttachment { id: EntityId; name: string; fileName: string; mimeType: string; dataUrl?: string; externalUrl?: string; notes: string; createdAt: string; }
export type CustomerTag = "Domestic" | "Landlord" | "Commercial" | "Builder" | "Repeat customer" | "VIP" | "Maintenance" | "Other";
export interface CustomerProfile { id: EntityId; customerId: EntityId; tags: CustomerTag[]; preferredContact: "Phone" | "Email" | "WhatsApp"; nextFollowUpDate: string; followUpReason: string; reviewStatus: "Not requested" | "Requested" | "Received"; reviewRequestedAt?: string; referralSource?: string; builderRelationship?: string; portalEnabled: boolean; portalNote: string; createdAt: string; updatedAt: string; }
export type CustomerInteractionType = "Call" | "Text" | "Email" | "WhatsApp" | "Site visit" | "Review request" | "Note";
export interface CustomerInteraction { id: EntityId; customerId: EntityId; type: CustomerInteractionType; summary: string; outcome: string; completedBy: string; interactionAt: string; createdAt: string; }
export type AiReminderPriority = "Normal" | "High" | "Urgent";
export interface AiReminder { id: EntityId; title: string; dueDate: string; dueTime: string; priority: AiReminderPriority; completed: boolean; customerId?: EntityId; jobId?: EntityId; notes: string; createdAt: string; updatedAt: string; }
export type AiConfidenceLevel = "High" | "Medium" | "Low";
export interface AiConfidenceBreakdown { overall: number; labour: number; materials: number; pricing: number; level: AiConfidenceLevel; reasons: string[]; }
export type AiLearningEvidenceKind = "Completed job" | "Accepted quote" | "Paid invoice" | "Customer history" | "Job pack" | "Materials library";
export interface AiLearningEvidence { id: EntityId; kind: AiLearningEvidenceKind; recordId: EntityId; title: string; detail: string; jobType: QuoteTemplateType; occurredAt: string; relevance: number; href: string; }
export interface AiLearningJobPattern { jobType: QuoteTemplateType; successfulRecords: number; completedJobs: number; acceptedQuotes: number; paidInvoices: number; decidedQuotes: number; conversionRate: number; averageSellingPrice: number; averageLabourHours: number; averageNetMargin: number; averageMaterialMarkup: number; averageContingency: number; evidence: AiLearningEvidence[]; }
export interface AiLearningMaterialPattern { key: string; materialId?: EntityId; description: string; uses: number; completedJobUses: number; averageQuantity: number; averageUnitCost: number; averageUnitPrice: number; lastUsedAt: string; confidenceScore: number; evidence: AiLearningEvidence[]; }
export interface AiLearningMemory { id: EntityId; schemaVersion: 1; sourceSignature: string; learnedAt: string; completedJobs: number; acceptedQuotes: number; paidInvoices: number; customerHistories: number; builderHistories: number; pricingSignals: number; materialSignals: number; confidence: AiConfidenceBreakdown; jobPatterns: AiLearningJobPattern[]; frequentMaterials: AiLearningMaterialPattern[]; influentialRecords: AiLearningEvidence[]; }
export type JobStatus = "Lead" | "Quoted" | "Scheduled" | "In progress" | "Complete" | "On hold";
export type JobPriority = "Low" | "Normal" | "High" | "Urgent";
export interface Job { id: EntityId; title: string; customerId?: EntityId; builderId?: EntityId; sourceQuoteId?: EntityId; quoteSnapshot?: JobQuoteSnapshot; siteAddress: string; status: JobStatus; startDate: string; targetCompletionDate?: string; priority?: JobPriority; assignedTo?: string[]; value: number; notes: string; createdAt: string; updatedAt: string; }

export type LeadStage = "New Lead" | "Contacted" | "Survey Booked" | "Survey Complete" | "Quote Sent" | "Follow-up Due" | "Accepted" | "Lost" | "Completed" | "Cancelled";
export type LegacyLeadStage = "New enquiry" | "Survey booked" | "Quote required" | "Quote sent" | "Won";
export type LeadSource = "Website" | "Google" | "Referral" | "Builder" | "Repeat customer" | "Social media" | "MyJobsQuote" | "MyBuilder" | "Checkatrade" | "Other";
export type LeadPriority = "Low" | "Normal" | "High" | "Urgent";
export interface SalesLead { id: EntityId; name: string; company: string; email: string; phone: string; siteAddress: string; workRequired: string; source: LeadSource; stage: LeadStage | LegacyLeadStage; priority: LeadPriority; estimatedValue: number; nextAction: string; followUpDate: string; customerId?: EntityId; builderId?: EntityId; jobId?: EntityId; quoteId?: EntityId; surveyId?: EntityId; plannerEntryId?: EntityId; lastContactAt?: string; lostFollowUpCompletedAt?: string; lostReason?: string; cancelledReason?: string; completedAt?: string; notes: string; createdAt: string; updatedAt: string; }
export interface LeadActivity { id: EntityId; leadId: EntityId; type: "Call" | "Text" | "Email" | "WhatsApp" | "Site visit" | "Note" | "Stage change"; summary: string; completedBy: string; completedAt: string; createdAt: string; }
export interface CrmFollowUpSettings { id: EntityId; quoteAgeDays: number; noResponseDays: number; lostOpportunityDays: number; highValueThreshold: number; updatedAt: string; }

export type JobMilestoneType = "Enquiry received" | "Site survey booked" | "Quote prepared" | "Quote sent" | "Quote accepted" | "Job created" | "Deposit received" | "Materials ordered" | "Materials delivered" | "First fix complete" | "Second fix complete" | "Testing complete" | "Job completed" | "Certificate uploaded" | "Invoice created" | "Invoice sent" | "Payment received" | "Review requested" | "Custom update";
export interface JobTimelineEntry { id: EntityId; jobId: EntityId; milestone: JobMilestoneType; note: string; completedBy: string; completedAt: string; createdAt: string; }

export interface SiteDiaryEntry { id: EntityId; jobId: EntityId; workDate: string; startedAt: string; finishedAt: string; breakMinutes: number; completedBy: string; workCompleted: string; delays: string; customerRequests: string; materialsUsed: string; voiceNotes: string; createdAt: string; updatedAt: string; }
export type VariationStatus = "Draft" | "Awaiting approval" | "Approved" | "Declined" | "Invoiced";
export interface JobVariation { id: EntityId; jobId: EntityId; number: string; title: string; description: string; labourHours: number; labourRate: number; materialCost: number; materialCharge: number; otherCharge: number; status: VariationStatus; approvalMethod: "Not approved" | "Signature" | "Email" | "WhatsApp" | "Verbal"; approvalReference: string; requestedBy: string; createdAt: string; updatedAt: string; }

export type RamsStatus = "Draft" | "Ready for review" | "Approved" | "Superseded";
export type RiskLikelihood = 1 | 2 | 3 | 4 | 5;
export type RiskSeverity = 1 | 2 | 3 | 4 | 5;
export interface RiskAssessmentItem { id: EntityId; hazard: string; personsAtRisk: string; existingControls: string; likelihood: RiskLikelihood; severity: RiskSeverity; furtherActions: string; residualLikelihood: RiskLikelihood; residualSeverity: RiskSeverity; responsiblePerson: string; }
export interface RamsDocument { id: EntityId; number: string; title: string; jobId?: EntityId; siteAddress: string; client: string; preparedBy: string; preparedDate: string; reviewDate: string; status: RamsStatus; scopeOfWorks: string; methodStatement: string; emergencyArrangements: string; ppeRequired: string[]; permitsRequired: string[]; risks: RiskAssessmentItem[]; approvalName: string; approvalDate: string; notes: string; createdAt: string; updatedAt: string; }

export type TeamRole = "Owner" | "Electrician" | "Electrician's mate" | "Apprentice" | "Office" | "Subcontractor";
export type TeamMemberStatus = "Active" | "On leave" | "Inactive";
export interface TeamQualification { id: EntityId; name: string; certificateNumber: string; issuedAt: string; expiresAt: string; notes: string; }
export interface TeamMember { id: EntityId; name: string; role: TeamRole; status: TeamMemberStatus; email: string; phone: string; emergencyContact: string; emergencyPhone: string; hourlyCost: number; chargeRate: number; vanRegistration: string; qualifications: TeamQualification[]; notes: string; createdAt: string; updatedAt: string; }
export type TimesheetStatus = "Draft" | "Submitted" | "Approved";
export interface TimesheetEntry { id: EntityId; teamMemberId: EntityId; jobId?: EntityId; workDate: string; startedAt: string; finishedAt: string; breakMinutes: number; notes: string; status: TimesheetStatus; createdAt: string; updatedAt: string; }
export type LabourRateUnit = "Hour" | "Half day" | "Day" | "Call-out" | "Minimum charge";
export interface LabourRate { id: EntityId; name: string; description: string; costRate: number; chargeRate: number; unit: LabourRateUnit; active: boolean; createdAt: string; updatedAt: string; }
export type OverheadFrequency = "Weekly" | "Monthly" | "Annual";
export type OverheadCategory = "Vehicle" | "Insurance" | "Software" | "Registration" | "Accountancy" | "Phone" | "Tools" | "Training" | "Premises" | "Marketing" | "Other";
export interface BusinessOverhead { id: EntityId; name: string; category: OverheadCategory; amount: number; frequency: OverheadFrequency; notes: string; active: boolean; createdAt: string; updatedAt: string; }
export interface LabourCostSettings { id: EntityId; workingDaysPerYear: number; billableHoursPerDay: number; targetNetMargin: number; contingencyPercent: number; createdAt: string; updatedAt: string; }
export interface BusinessProfile { id: EntityId; companyName: string; logoDataUrl: string; logoFileName: string; address: string; phone: string; email: string; website: string; updatedAt: string; }
export type VatRegistrationStatus = "Not registered" | "Registration pending" | "VAT registered";
export interface VatSettings { id: EntityId; registrationStatus: VatRegistrationStatus; registrationNumber: string; defaultRate: number; pricesIncludeVat: boolean; showVatNumberOnDocuments: boolean; updatedAt: string; }
export interface BusinessBankDetails { id: EntityId; accountName: string; bankName: string; sortCode: string; accountNumber: string; iban: string; bic: string; paymentReferencePrefix: string; paymentInstructions: string; updatedAt: string; }
export interface PaymentTermsTemplate { id: EntityId; name: string; type: PaymentTermsType; description: string; dueDays: number; depositPercent?: number; stages?: string; active: boolean; isDefault: boolean; createdAt: string; updatedAt: string; }
export type DocumentLogoPosition = "Left" | "Centre" | "Right";
export interface DocumentBrandingSettings { id: EntityId; primaryColour: string; accentColour: string; logoPosition: DocumentLogoPosition; showLogo: boolean; showCompanyAddress: boolean; showContactDetails: boolean; showVatNumber: boolean; quoteHeading: string; invoiceHeading: string; footerText: string; updatedAt: string; }
export interface CertificateDefaults { id: EntityId; inspectorName: string; schemeProvider: string; registrationNumber: string; defaultType: CertificateType; defaultOutcome: "Satisfactory" | "Unsatisfactory" | "Not applicable"; certificatePrefix: string; nextInspectionYears: number; notes: string; updatedAt: string; }
export type PlannerEntryType = "Job" | "Survey" | "Delivery" | "Training" | "Holiday" | "Office" | "Other";
export interface PlannerEntry { id: EntityId; title: string; type: PlannerEntryType; date: string; startTime: string; endTime: string; customerId?: EntityId; jobId?: EntityId; teamMemberIds: EntityId[]; location: string; notes: string; status: "Planned" | "Confirmed" | "Complete" | "Cancelled"; createdAt: string; updatedAt: string; }

export type VehicleStatus = "Active" | "Off road" | "Sold";
export interface FleetVehicle { id: EntityId; registration: string; make: string; model: string; status: VehicleStatus; assignedTeamMemberId?: EntityId; motDue: string; insuranceDue: string; serviceDue: string; currentMileage: number; notes: string; createdAt: string; updatedAt: string; }
export type ToolStatus = "Available" | "Assigned" | "In repair" | "Retired";
export interface ToolAsset { id: EntityId; name: string; category: string; manufacturer: string; model: string; serialNumber: string; assetTag: string; status: ToolStatus; assignedTeamMemberId?: EntityId; assignedVehicleId?: EntityId; purchaseDate: string; purchaseCost: number; warrantyUntil: string; calibrationDue: string; notes: string; createdAt: string; updatedAt: string; }

export type ExpenseCategory = "Materials" | "Fuel" | "Vehicle" | "Tools" | "Insurance" | "Software" | "Training" | "Subcontractor" | "Travel" | "Office" | "Other";
export type ExpensePaymentMethod = "Business card" | "Bank transfer" | "Cash" | "Personal card" | "Direct debit" | "Other";
export type ExpenseStatus = "Draft" | "Ready" | "Reconciled";
export interface BusinessExpense { id: EntityId; expenseDate: string; supplier: string; description: string; category: ExpenseCategory; paymentMethod: ExpensePaymentMethod; status: ExpenseStatus; jobId?: EntityId; netAmount: number; vatAmount: number; grossAmount: number; receiptDataUrl?: string; receiptFileName?: string; receiptUrl?: string; notes: string; createdAt: string; updatedAt: string; }

export type PricingDocumentType = "Quote" | "Estimate";
export type PricingDocumentStatus = "Draft" | "Sent" | "Accepted" | "Declined" | "Expired";
export type QuoteLabourMode = "Hours" | "Days" | "Fixed";
export type QuoteSection = "Labour" | "Materials" | "Travel" | "Parking" | "Plant Hire" | "Contingency";
export type QuoteTemplateType = "Domestic" | "Commercial" | "Rewire" | "EICR" | "Consumer Unit" | "Fault Finding";
export type FixedPriceWorkflowType = "Direct fixed price" | "Fault finding to fixed price";
export interface FixedPriceWorkflow { type: FixedPriceWorkflowType; initialVisitCompleted: boolean; faultFindingCompleted: boolean; recommendation: string; }
export type PaymentTermsType = "Deposit" | "Staged payments" | "Due on completion";
export interface PricingLineItem { id: EntityId; description: string; category: QuoteSection | "Other"; quantity: number; unitPrice: number; unitCost?: number; materialId?: EntityId; supplier?: string; stockCode?: string; labourRateId?: EntityId; labourMode?: QuoteLabourMode; labourHours?: number; }
export interface QuotePricingSettings { defaultLabourRateId?: EntityId; contingencyPercent: number; materialMarkupPercent: number; travelCost: number; travelPrice: number; parkingCost: number; parkingPrice: number; }
export interface QuoteProfitabilitySnapshot { directCost: number; overheadCost: number; costPrice: number; sellingPrice: number; grossProfit: number; expectedProfit: number; grossMargin: number; netMargin: number; calculatedAt: string; }
export interface BusinessTermsTemplate { id: EntityId; name: string; content: string; active: boolean; createdAt: string; updatedAt: string; }
export interface QuotePaymentTerms { type: PaymentTermsType; templateId?: EntityId; name?: string; description?: string; dueDays?: number; depositPercent?: number; stages?: string; }
export interface QuoteRevision { id: EntityId; revisionNumber: number; savedAt: string; title: string; siteAddress?: string; validUntil: string; vatEnabled: boolean; vatRate: number; items: PricingLineItem[]; pricingSettings?: QuotePricingSettings; profitability?: QuoteProfitabilitySnapshot; attachments?: RecordAttachment[]; notes: string; exclusions?: string; internalNotes?: string; fixedPriceWorkflow?: FixedPriceWorkflow; terms: string; termsTemplateId?: EntityId; paymentTerms?: QuotePaymentTerms; templateType?: QuoteTemplateType; }
export interface PricingDocument { id: EntityId; number: string; type: PricingDocumentType; status: PricingDocumentStatus; customerId?: EntityId; builderId?: EntityId; jobId?: EntityId; title: string; siteAddress?: string; validUntil: string; vatEnabled: boolean; vatRate: number; items: PricingLineItem[]; pricingSettings?: QuotePricingSettings; profitability?: QuoteProfitabilitySnapshot; attachments?: RecordAttachment[]; notes: string; exclusions?: string; internalNotes?: string; fixedPriceWorkflow?: FixedPriceWorkflow; terms: string; termsTemplateId?: EntityId; paymentTerms?: QuotePaymentTerms; templateType?: QuoteTemplateType; revisions?: QuoteRevision[]; lastFollowUpAt?: string; nextFollowUpDate?: string; createdAt: string; updatedAt: string; }
export interface JobQuoteSnapshot { quoteId: EntityId; quoteNumber: string; items: PricingLineItem[]; pricingSettings?: QuotePricingSettings; profitability?: QuoteProfitabilitySnapshot; attachments: RecordAttachment[]; vatEnabled: boolean; vatRate: number; notes: string; exclusions?: string; internalNotes?: string; fixedPriceWorkflow?: FixedPriceWorkflow; terms: string; paymentTerms?: QuotePaymentTerms; convertedAt: string; }

export type InvoiceStatus = "Draft" | "Sent" | "Part paid" | "Paid" | "Overdue" | "Cancelled";
export interface Invoice { id: EntityId; number: string; status: InvoiceStatus; customerId?: EntityId; builderId?: EntityId; jobId?: EntityId; quoteId?: EntityId; paymentTermsTemplateId?: EntityId; paymentTermsText?: string; title: string; issueDate: string; dueDate: string; vatEnabled: boolean; vatRate: number; items: PricingLineItem[]; amountPaid: number; notes: string; paymentDetails: string; createdAt: string; updatedAt: string; }

export type MaterialCategory = "Cable" | "Protection" | "Accessories" | "Lighting" | "Containment" | "EV" | "Testing" | "Fire alarm" | "Emergency lighting" | "Other";
export type MaterialUnit = "Each" | "Metre" | "Drum" | "Box" | "Pack";
export type MaterialPriceSource = "Manual" | "Supplier link" | "Imported";
export interface MaterialPriceHistory { id: EntityId; tradeCost: number; sellPrice: number; source: MaterialPriceSource; recordedAt: string; }
export interface Material { id: EntityId; name: string; category: MaterialCategory; manufacturer: string; supplier: string; supplierUrl: string; stockCode: string; unit: MaterialUnit; tradeCost: number; sellPrice: number; favourite: boolean; notes: string; lastPriceCheckedAt?: string; priceSource?: MaterialPriceSource; priceHistory?: MaterialPriceHistory[]; createdAt: string; updatedAt: string; }
export type StockLocationType = "Van" | "Store" | "Site" | "Other";
export interface StockLocation { id: EntityId; name: string; type: StockLocationType; vehicleId?: EntityId; notes: string; createdAt: string; updatedAt: string; }
export interface StockItem { id: EntityId; materialId?: EntityId; description: string; locationId: EntityId; quantity: number; minimumQuantity: number; unitCost: number; unit: MaterialUnit; stockCode: string; supplier: string; notes: string; createdAt: string; updatedAt: string; }
export type StockMovementType = "Received" | "Used" | "Transferred" | "Adjusted" | "Returned";
export interface StockMovement { id: EntityId; stockItemId: EntityId; type: StockMovementType; quantity: number; fromLocationId?: EntityId; toLocationId?: EntityId; jobId?: EntityId; note: string; movedAt: string; createdAt: string; }
export interface JobPackMaterial { id: EntityId; materialId?: EntityId; description: string; quantity: number; unitPrice: number; }
export interface JobPack { id: EntityId; name: string; category: string; description: string; labourDescription: string; labourHours: number; labourRate: number; materials: JobPackMaterial[]; testingRequirements: string; certificatesRequired: string; notes: string; createdAt: string; updatedAt: string; }

export type PurchaseItemStatus = "Needed" | "Ordered" | "Delivered";
export interface PurchaseListItem { id: EntityId; materialId?: EntityId; description: string; supplier: string; stockCode: string; supplierUrl?: string; quantity: number; unitCost: number; status: PurchaseItemStatus; }
export interface PurchaseList { id: EntityId; number: string; title: string; pricingDocumentId?: EntityId; jobId?: EntityId; items: PurchaseListItem[]; notes: string; createdAt: string; updatedAt: string; }

export type SurveyStatus = "Draft" | "In progress" | "Complete";
export type SurveySeverity = "Low" | "Medium" | "High";
export interface SurveyCircuit { id: EntityId; name: string; protectiveDevice: string; cableSize: string; estimatedLength: number; observations: string; recommendation: string; }
export interface SurveyPhoto { id: EntityId; name: string; category: string; dataUrl?: string; externalUrl?: string; note: string; severity: SurveySeverity; }
export interface SiteSurvey { id: EntityId; number: string; status: SurveyStatus; customerId?: EntityId; builderId?: EntityId; jobId?: EntityId; propertyType: string; occupancy: string; floors: number; bedrooms: number; constructionType: string; loftAccess: string; installationAge: string; earthingArrangement: string; supplyType: string; fuseRating: string; cutoutType: string; meterPosition: string; consumerUnitPosition: string; mainBonding: string; earthingConductorSize: string; consumerUnitManufacturer: string; consumerUnitWays: string; spdFitted: boolean; rcbosFitted: boolean; rcdType: string; spareWays: string; consumerUnitCondition: string; circuits: SurveyCircuit[]; photos: SurveyPhoto[]; defects: string[]; risks: string[]; recommendations: string[]; voiceNotes: string; surveyNotes: string; labourHours: number; labourRate: number; healthScore: number; createdAt: string; updatedAt: string; }

export type CertificateType = "Electrical Installation Certificate" | "Minor Electrical Installation Works Certificate" | "Electrical Installation Condition Report" | "Emergency Lighting Certificate" | "Fire Alarm Certificate" | "Other";
export type CertificateStatus = "Draft" | "In progress" | "Complete" | "Issued" | "Superseded";
export type ObservationCode = "C1" | "C2" | "C3" | "FI" | "No code";
export type SuggestionConfidence = "High" | "Medium" | "Low";
export interface CertificateObservation { id: EntityId; sourceText: string; location: string; observation: string; recommendation: string; regulationReference: string; code: ObservationCode; confidence: SuggestionConfidence; accepted: boolean; }
export interface ElectricalCertificate { id: EntityId; number: string; type: CertificateType; status: CertificateStatus; customerId?: EntityId; jobId?: EntityId; installationAddress: string; description: string; inspectorName: string; schemeProvider?: string; registrationNumber?: string; inspectionDate: string; nextInspectionDate: string; outcome: "Satisfactory" | "Unsatisfactory" | "Not applicable"; observations: string; structuredObservations?: CertificateObservation[]; externalPdfUrl: string; createdAt: string; updatedAt: string; }

export type JobDocumentCategory = "Certificate" | "Photo" | "Drawing" | "RAMS" | "Site note" | "Material order" | "Handover" | "Other";
export interface JobDocument { id: EntityId; jobId: EntityId; name: string; category: JobDocumentCategory; fileName: string; mimeType: string; dataUrl?: string; externalUrl?: string; notes: string; uploadedBy: string; uploadedAt: string; createdAt: string; }

export type EntityBase = Customer | Builder | CustomerProfile | CustomerInteraction | CrmFollowUpSettings | AiReminder | AiLearningMemory | Job | SalesLead | LeadActivity | JobTimelineEntry | SiteDiaryEntry | JobVariation | RamsDocument | TeamMember | TimesheetEntry | LabourRate | BusinessOverhead | LabourCostSettings | BusinessProfile | VatSettings | BusinessBankDetails | PaymentTermsTemplate | DocumentBrandingSettings | CertificateDefaults | PlannerEntry | FleetVehicle | ToolAsset | BusinessExpense | PricingDocument | Invoice | Material | StockLocation | StockItem | StockMovement | JobPack | PurchaseList | SiteSurvey | ElectricalCertificate | JobDocument;

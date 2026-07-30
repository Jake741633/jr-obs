export type EntityId = string;

export interface Customer { id: EntityId; name: string; email: string; phone: string; address: string; notes: string; createdAt: string; updatedAt: string; }
export interface Builder { id: EntityId; companyName: string; contactName: string; email: string; phone: string; address: string; notes: string; createdAt: string; updatedAt: string; }
export type CustomerTag = "Domestic" | "Landlord" | "Commercial" | "Builder" | "Repeat customer" | "VIP" | "Maintenance" | "Other";
export interface CustomerProfile { id: EntityId; customerId: EntityId; tags: CustomerTag[]; preferredContact: "Phone" | "Email" | "WhatsApp"; nextFollowUpDate: string; followUpReason: string; reviewStatus: "Not requested" | "Requested" | "Received"; portalEnabled: boolean; portalNote: string; createdAt: string; updatedAt: string; }
export type CustomerInteractionType = "Call" | "Email" | "WhatsApp" | "Site visit" | "Review request" | "Note";
export interface CustomerInteraction { id: EntityId; customerId: EntityId; type: CustomerInteractionType; summary: string; outcome: string; completedBy: string; interactionAt: string; createdAt: string; }
export type JobStatus = "Lead" | "Quoted" | "Scheduled" | "In progress" | "Complete" | "On hold";
export type JobPriority = "Low" | "Normal" | "High" | "Urgent";
export interface Job { id: EntityId; title: string; customerId?: EntityId; builderId?: EntityId; siteAddress: string; status: JobStatus; startDate: string; targetCompletionDate?: string; priority?: JobPriority; assignedTo?: string[]; value: number; notes: string; createdAt: string; updatedAt: string; }

export type LeadStage = "New enquiry" | "Contacted" | "Survey booked" | "Quote required" | "Quote sent" | "Won" | "Lost";
export type LeadSource = "Website" | "Google" | "Referral" | "Builder" | "Repeat customer" | "Social media" | "MyBuilder" | "Checkatrade" | "Other";
export type LeadPriority = "Low" | "Normal" | "High" | "Urgent";
export interface SalesLead { id: EntityId; name: string; company: string; email: string; phone: string; siteAddress: string; workRequired: string; source: LeadSource; stage: LeadStage; priority: LeadPriority; estimatedValue: number; nextAction: string; followUpDate: string; customerId?: EntityId; builderId?: EntityId; jobId?: EntityId; lostReason?: string; notes: string; createdAt: string; updatedAt: string; }
export interface LeadActivity { id: EntityId; leadId: EntityId; type: "Call" | "Email" | "WhatsApp" | "Site visit" | "Note" | "Stage change"; summary: string; completedBy: string; completedAt: string; createdAt: string; }

export type JobMilestoneType = "Enquiry received" | "Site survey booked" | "Quote prepared" | "Quote sent" | "Quote accepted" | "Deposit received" | "Materials ordered" | "Materials delivered" | "First fix complete" | "Second fix complete" | "Testing complete" | "Certificate uploaded" | "Invoice sent" | "Payment received" | "Review requested" | "Custom update";
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
export type PlannerEntryType = "Job" | "Survey" | "Delivery" | "Training" | "Holiday" | "Office" | "Other";
export interface PlannerEntry { id: EntityId; title: string; type: PlannerEntryType; date: string; startTime: string; endTime: string; jobId?: EntityId; teamMemberIds: EntityId[]; location: string; notes: string; status: "Planned" | "Confirmed" | "Complete" | "Cancelled"; createdAt: string; updatedAt: string; }

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
export interface PricingLineItem { id: EntityId; description: string; category: "Labour" | "Materials" | "Other"; quantity: number; unitPrice: number; unitCost?: number; materialId?: EntityId; supplier?: string; stockCode?: string; }
export interface PricingDocument { id: EntityId; number: string; type: PricingDocumentType; status: PricingDocumentStatus; customerId?: EntityId; builderId?: EntityId; jobId?: EntityId; title: string; validUntil: string; vatEnabled: boolean; vatRate: number; items: PricingLineItem[]; notes: string; terms: string; createdAt: string; updatedAt: string; }

export type InvoiceStatus = "Draft" | "Sent" | "Part paid" | "Paid" | "Overdue" | "Cancelled";
export interface Invoice { id: EntityId; number: string; status: InvoiceStatus; customerId?: EntityId; builderId?: EntityId; jobId?: EntityId; quoteId?: EntityId; title: string; issueDate: string; dueDate: string; vatEnabled: boolean; vatRate: number; items: PricingLineItem[]; amountPaid: number; notes: string; paymentDetails: string; createdAt: string; updatedAt: string; }

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
export interface ElectricalCertificate { id: EntityId; number: string; type: CertificateType; status: CertificateStatus; customerId?: EntityId; jobId?: EntityId; installationAddress: string; description: string; inspectorName: string; inspectionDate: string; nextInspectionDate: string; outcome: "Satisfactory" | "Unsatisfactory" | "Not applicable"; observations: string; structuredObservations?: CertificateObservation[]; externalPdfUrl: string; createdAt: string; updatedAt: string; }

export type JobDocumentCategory = "Certificate" | "Photo" | "Drawing" | "RAMS" | "Site note" | "Material order" | "Handover" | "Other";
export interface JobDocument { id: EntityId; jobId: EntityId; name: string; category: JobDocumentCategory; fileName: string; mimeType: string; dataUrl?: string; externalUrl?: string; notes: string; uploadedBy: string; uploadedAt: string; createdAt: string; }

export type EntityBase = Customer | Builder | CustomerProfile | CustomerInteraction | Job | SalesLead | LeadActivity | JobTimelineEntry | SiteDiaryEntry | JobVariation | RamsDocument | TeamMember | TimesheetEntry | LabourRate | BusinessOverhead | LabourCostSettings | PlannerEntry | FleetVehicle | ToolAsset | BusinessExpense | PricingDocument | Invoice | Material | StockLocation | StockItem | StockMovement | JobPack | PurchaseList | SiteSurvey | ElectricalCertificate | JobDocument;

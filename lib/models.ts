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

export type EntityBase = Customer | Builder | Job;

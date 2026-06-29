export type JobStatus =
  | "Enquiry"
  | "Survey Booked"
  | "Quoted"
  | "Accepted"
  | "In Progress"
  | "Completed"
  | "Invoiced"
  | "Paid";

export type Job = {
  id: string;
  customerId: string;
  title: string;
  address: string;
  status: JobStatus;
  description?: string;
  startDate?: string;
  estimatedLabour?: number;
  createdAt: string;
};
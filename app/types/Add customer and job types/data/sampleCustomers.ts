import type { Customer } from "../types/customer";

export const sampleCustomers: Customer[] = [
  {
    id: "cust-001",
    name: "Example Customer",
    phone: "07700 900000",
    email: "customer@example.com",
    address: "Epsom, Surrey",
    preferredContact: "WhatsApp",
    notes: "Example customer record for JR OS testing.",
    createdAt: new Date().toISOString(),
  },
];
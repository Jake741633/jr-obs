import type { Customer } from "../../../../lib/models";

const now = new Date().toISOString();

export const sampleCustomers: Customer[] = [
  {
    id: "cust-001",
    name: "Example Customer",
    phone: "07700 900000",
    email: "customer@example.com",
    address: "Epsom, Surrey",
    notes: "Example customer record for JR OS testing.",
    createdAt: now,
    updatedAt: now,
  },
];

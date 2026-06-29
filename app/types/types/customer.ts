export type Customer = {
  id: string;
  name: string;
  company?: string;
  phone?: string;
  email?: string;
  address?: string;
  preferredContact?: "Phone" | "Email" | "WhatsApp";
  notes?: string;
  createdAt: string;
};
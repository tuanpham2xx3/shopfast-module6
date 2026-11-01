export const categories = [
  "ORDER_STATUS",
  "PAYMENT",
  "INVENTORY",
  "DELIVERY",
  "CANCELLATION",
  "OTHER",
] as const;
export interface Actor {
  id: string;
  role: string;
  verified?: boolean;
}
export interface Ticket {
  id: string;
  customerId: string;
  orderId: string | null;
  subject: string;
  body: string;
  status: string;
  assignedTo: string | null;
  category: string;
  version: number;
  resolvedAt: Date | null;
  classificationVersion: number;
  classificationSource: string;
}
export class TicketError extends Error {
  constructor(public readonly code: string) {
    super(code);
  }
}

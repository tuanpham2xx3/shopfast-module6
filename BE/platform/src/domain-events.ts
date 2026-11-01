import { EventEmitter } from "node:events";

export interface OrderStatusEvent {
  eventId: string;
  orderId: string;
  status: string;
  version: number;
  occurredAt: string;
}
// Process-local fast path. The outbox/Redis path provides recovery across processes.
export const domainEvents = new EventEmitter();
domainEvents.setMaxListeners(100);

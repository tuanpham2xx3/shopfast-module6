export class OrderError extends Error {
  constructor(public readonly code: string) {
    super(code);
  }
}
export interface CheckoutInput {
  items: { productId: string; quantity: number; expectedUnitPrice: number }[];
  shippingAddress: {
    recipientName: string;
    addressLine: string;
    phone: string;
    ward: string;
    province: string;
  };
  promoCode?: string;
}
export type Actor = { id: string; role: string };

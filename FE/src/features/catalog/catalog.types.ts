export type Product = {
  id: string;
  name: string;
  sku: string;
  price: number;
  available: number;
  description: string;
  imageUrl: string;
  category: { name: string };
  brand: { name: string };
};
export type Stock = {
  productId: string;
  name: string;
  sku: string;
  onHand: number;
  reserved: number;
  available: number;
  version: number;
};
export type Taxonomy = { id: string; name: string };
export type Api = <T>(
  path: string,
  options?: RequestInit,
  token?: string,
) => Promise<T>;

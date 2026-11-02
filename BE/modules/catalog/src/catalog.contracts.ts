export class CatalogError extends Error {
  constructor(public readonly code: string) {
    super(code);
  }
}
export type Taxonomy = "categories" | "brands";
export interface Page {
  page?: number;
  pageSize?: number;
}
export interface ProductFilter extends Page {
  categoryId?: string;
  brandId?: string;
  minPrice?: number;
  maxPrice?: number;
  sort?: "newest" | "price_asc" | "price_desc";
}
export interface ProductInput {
  sku: string;
  slug: string;
  name: string;
  description: string;
  imageUrl: string;
  categoryId: string;
  brandId: string;
  price: number;
}
export interface Adjustment {
  delta: number;
  reason: string;
  expectedVersion: number;
}

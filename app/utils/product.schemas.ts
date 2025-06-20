// app/utils/product.schemas.ts
import { z } from 'zod';

export const ProductVariantSchema = z.object({
  id: z.string(),
  sku: z.string(),
  price: z.string(), // Assuming price is fetched as string and formatted
  inventoryQuantity: z.number(),
  inventoryItem: z.object({
    id: z.string(),
    locationId: z.string().optional(),
  }),
});

export const ProductSchema = z.object({
  id: z.string(),
  title: z.string(),
  vendor: z.string(),
  productType: z.string(),
  variants: z.array(ProductVariantSchema),
  salesVelocity: z.number(),
  stockoutDays: z.number(),
  status: z.enum(['Healthy', 'Low', 'Critical']),
  trending: z.boolean(),
});

// To infer the TypeScript type from the schema:
// export type Product = z.infer<typeof ProductSchema>;
// However, we already have a Product type in app/types.ts.
// This schema should align with that existing type.

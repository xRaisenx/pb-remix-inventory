// app/routes/app.products.tsx

import { json, type LoaderFunctionArgs } from "@remix-run/node";
import prisma from "~/db.server";
import { authenticate } from "~/shopify.server";
import type { Decimal } from "@prisma/client/runtime/library";

// --- TYPE DEFINITIONS ---
type ProductFromDB = {
  id: string;
  shopifyId: string;
  title: string;
  vendor: string | null;
  salesVelocityFloat: number | null;
  stockoutDays: number | null;
  status: string | null;
  Variant: Array<{
    id: string;
    shopifyId: string | null;
    title: string | null;
    sku: string | null;
    price: Decimal | null;
    inventoryItemId: string | null;
  }>;
};

interface ProductVariantForModal {
  id: string;
  shopifyVariantId: string;
  title: string;
  sku?: string | null;
  price?: string | null;
  inventoryQuantity?: number | null;
  inventoryItemId?: string | null;
}

export interface ProductForTable {
  id: string;
  shopifyId: string;
  title: string;
  vendor: string;
  price: string;
  sku: string;
  inventory: number;
  salesVelocity: number | null;
  stockoutDays: number | null;
  status: string | null;
  variantsForModal: ProductVariantForModal[];
  inventoryByLocation: Record<string, { quantity: number; shopifyLocationGid: string | null }>;
}

// LoaderData type omitted since this route currently exports only a loader and no component consuming it

const PRODUCTS_PER_PAGE = 25;

// Map product names to CSS classes for styling (matching example)
// getProductClassName helper not currently used in UI; remove for cleanliness

// Map status to badge styling
// getStatusBadge helper not currently used in UI; remove for cleanliness

// --- LOADER ---
export const loader = async ({ request }: LoaderFunctionArgs): Promise<Response> => {
  const { session } = await authenticate.admin(request);
  const shopRecord = await prisma.shop.findUnique({ where: { shop: session.shop } });
  if (!shopRecord) throw new Response("Shop not found", { status: 404 });

  const url = new URL(request.url);
  const page = parseInt(url.searchParams.get("page") || "1", 10);
  const skip = (page - 1) * PRODUCTS_PER_PAGE;

  try {
    const [productsFromDB, totalProducts, allWarehouses] = await prisma.$transaction([
      prisma.product.findMany({
        where: { shopId: shopRecord.id },
        orderBy: { title: 'asc' },
        include: {
          Variant: true
        },
        take: PRODUCTS_PER_PAGE,
        skip: skip
      }),
      prisma.product.count({ where: { shopId: shopRecord.id } }),
      prisma.warehouse.findMany({
        where: { shopId: shopRecord.id },
        select: { id: true, name: true, shopifyLocationGid: true }
      }),
    ]);

    // Fetch all Inventory for all products in one query
    const allProductIds = productsFromDB.map((p: any) => p.id);
    const allInventories = await prisma.inventory.findMany({
      where: { productId: { in: allProductIds } },
      include: { Warehouse: { select: { shopifyLocationGid: true } } }
    });

    // Aggregate inventory for each product and variant
    const productsForTable = productsFromDB.map((p: ProductFromDB): ProductForTable => {
      let totalInventory = 0;
      const inventoryByLocation: ProductForTable['inventoryByLocation'] = {};
      // For each variant, sum inventory by matching productId
      p.Variant.forEach((variant: any) => {
        const variantInventories = allInventories.filter(inv => inv.productId === p.id);
        variantInventories.forEach((inv: any) => {
          totalInventory += inv.quantity;
          if (inv.warehouseId) {
            inventoryByLocation[inv.warehouseId] = {
              quantity: inv.quantity,
              shopifyLocationGid: inv.Warehouse?.shopifyLocationGid || null
            };
          }
        });
      });
      const firstVariant = p.Variant[0];
      return {
        id: p.id,
        shopifyId: p.shopifyId,
        title: p.title,
        vendor: p.vendor || "",
        price: firstVariant?.price?.toString() ?? '0.00',
        sku: firstVariant?.sku ?? 'N/A',
        inventory: totalInventory,
        salesVelocity: p.salesVelocityFloat,
        stockoutDays: p.stockoutDays,
        status: p.status,
        variantsForModal: p.Variant.map((v: any) => ({
          id: v.id,
          shopifyVariantId: v.shopifyId ?? '',
          title: v.title ?? v.sku ?? 'Variant',
          sku: v.sku,
          price: v.price?.toString(),
          inventoryItemId: v.inventoryItemId,
        })),
        inventoryByLocation: inventoryByLocation,
      };
    });

    const totalPages = Math.ceil(totalProducts / PRODUCTS_PER_PAGE);
    const pageInfo = {
      currentPage: page,
      totalPages: totalPages,
      totalResults: totalProducts,
      nextPageUrl: page < totalPages ? `/app/products?page=${page + 1}` : undefined,
      prevPageUrl: page > 1 ? `/app/products?page=${page - 1}` : undefined,
    };

    return json({ 
      products: productsForTable, 
      warehouses: allWarehouses, 
      pageInfo, 
      shopDomain: session.shop 
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Unknown error";
    console.error("Error fetching products for table:", message, error);
    const defaultPageInfo = { currentPage: 1, totalPages: 0, totalResults: 0 };
    return json({ products: [], warehouses: [], error: `Failed to fetch products: ${message}`, pageInfo: defaultPageInfo, shopDomain: session.shop }, { status: 500 });
  }
};

// --- ACTION ---

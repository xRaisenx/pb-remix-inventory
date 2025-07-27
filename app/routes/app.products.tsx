// app/routes/app.products.tsx

import { json, type ActionFunctionArgs, type LoaderFunctionArgs } from "@remix-run/node";
import { useLoaderData, useNavigate } from "@remix-run/react";
import { useState, useMemo, useCallback } from "react";
import prisma from "~/db.server";
import { authenticate } from "~/shopify.server";
import { ProductModal } from "~/components/ProductModal";
import { PlanetBeautyLayout } from "~/components/PlanetBeautyLayout";
import { calculateProductMetrics } from "~/services/product.service";
import { updateInventoryQuantityInShopifyAndDB } from "~/services/inventory.service";
import { INTENT } from "~/utils/intents";
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

interface LoaderData {
  products: ProductForTable[];
  warehouses: Array<{ id: string; name: string; shopifyLocationGid: string | null }>;
  error?: string;
  shopDomain: string;
  pageInfo: {
    currentPage: number;
    totalPages: number;
    totalResults: number;
    nextPageUrl?: string;
    prevPageUrl?: string;
  };
}

const PRODUCTS_PER_PAGE = 25;

// Map product names to CSS classes for styling (matching example)
const getProductClassName = (title: string): string => {
  const titleLower = title.toLowerCase();
  if (titleLower.includes('anastasia') && titleLower.includes('brow')) return 'anastasia-brow-gel';
  if (titleLower.includes('elta') && titleLower.includes('md')) return 'elta-md-sunscreen';
  if (titleLower.includes('borghese') && titleLower.includes('serum')) return 'borghese-serum';
  if (titleLower.includes('kerastase') && titleLower.includes('shampoo')) return 'kerastase-shampoo';
  if (titleLower.includes('mario') && titleLower.includes('badescu')) return 'mario-badescu-spray';
  if (titleLower.includes('t3') && titleLower.includes('hair')) return 't3-hair-dryer';
  return 'default-product';
};

// Map status to badge styling
function getStatusBadge(status: string | null) {
  if (!status) return { className: 'pb-badge-default', text: 'Unknown' };
  
  switch (status?.toLowerCase()) {
    case 'healthy':
      return { className: 'pb-badge-success', text: 'Healthy' };
    case 'low':
      return { className: 'pb-badge-warning', text: 'Low Stock' };
    case 'critical':
      return { className: 'pb-badge-critical', text: 'Critical' };
    default:
      return { className: 'pb-badge-default', text: status };
  }
};

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

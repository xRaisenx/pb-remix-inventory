// app/services/inventory.service.ts

import { Prisma } from "@prisma/client";
import prisma from "~/db.server";
import shopify from "~/shopify.server";
import { Session } from "@shopify/shopify-api";

interface ShopifyUserError {
  field: string[];
  message: string;
}

interface UpdateInventoryResult {
  success: boolean;
  message?: string;
  error?: string;
  userErrors?: ShopifyUserError[];
  inventoryAdjustmentGroupId?: string;
}

export async function updateInventoryQuantityInShopifyAndDB(
  shopDomain: string,
  variantId: string, // Prisma Variant ID
  newQuantity: number,
  shopifyLocationGid: string // The specific Shopify Location GID to update
): Promise<UpdateInventoryResult> {
  // 1. --- Validate Input ---
  if (!variantId) return { success: false, error: "Variant ID is required." };
  if (isNaN(newQuantity) || newQuantity < 0) return { success: false, error: "Quantity must be a non-negative number." };
  if (!shopifyLocationGid) return { success: false, error: "Shopify Location GID is required." };

  // 2. --- Get Data from Your Database ---
  const variant = await prisma.variant.findUnique({
    where: { id: variantId },
    select: { shopifyInventoryItemId: true, sku: true, productId: true },
  });

  if (!variant?.shopifyInventoryItemId) {
    return { success: false, error: `Variant (ID: ${variantId}, SKU: ${variant?.sku || 'Unknown'}) is not linked to a Shopify Inventory Item.` };
  }
  if (!variant.productId) {
    return { success: false, error: `Product ID missing for Variant (ID: ${variantId}).` };
  }

  // 3. --- Get Authenticated Shopify Client ---
  const offlineSessionRecord = await prisma.session.findFirst({
    where: { shop: shopDomain, isOnline: false, accessToken: { not: null } },
    orderBy: { expires: 'desc' },
  });

  if (!offlineSessionRecord?.accessToken) {
    return { success: false, error: `Cannot update Shopify: No valid offline session found for ${shopDomain}.` };
  }

  const session = new Session({
    id: offlineSessionRecord.id,
    shop: offlineSessionRecord.shop,
    state: offlineSessionRecord.state,
    isOnline: offlineSessionRecord.isOnline,
    accessToken: offlineSessionRecord.accessToken,
    scope: offlineSessionRecord.scope || '',
  });

  const client = new shopify.api.clients.Graphql({ session });

  // 4. --- Call Shopify GraphQL API ---
  const mutation = `
    mutation inventorySetOnHandQuantities($input: InventorySetOnHandQuantitiesInput!) {
      inventorySetOnHandQuantities(input: $input) {
        inventoryAdjustmentGroup { id }
        userErrors { field message }
      }
    }`;

  const variables = {
    input: {
      reason: "correction",
      setQuantities: [{
        inventoryItemId: variant.shopifyInventoryItemId,
        locationId: shopifyLocationGid,
        quantity: newQuantity,
      }],
    },
  };

  try {
    const response: any = await client.query({ data: { query: mutation, variables } });
    const inventorySetData = response?.body?.data?.inventorySetOnHandQuantities;
    const userErrors = inventorySetData?.userErrors;

    if (userErrors?.length > 0) {
      console.error("Shopify inventory update failed:", userErrors);
      return { success: false, error: "Shopify rejected the inventory update.", userErrors };
    }

    // 5. --- Update Local Database on Success ---
    const warehouse = await prisma.warehouse.findUnique({ where: { shopifyLocationGid } });
    if (warehouse) {
      await prisma.inventory.upsert({
        where: { productId_warehouseId: { productId: variant.productId, warehouseId: warehouse.id } },
        update: { quantity: newQuantity },
        create: { productId: variant.productId, warehouseId: warehouse.id, quantity: newQuantity },
      });
    } else {
      console.warn(`Warehouse with GID ${shopifyLocationGid} not found locally. Local DB may be out of sync.`);
    }

    return {
      success: true,
      message: `Inventory for SKU ${variant.sku || 'N/A'} updated to ${newQuantity}.`,
      inventoryAdjustmentGroupId: inventorySetData?.inventoryAdjustmentGroup?.id,
    };

  } catch (error: any) {
    console.error("Error in updateInventoryQuantityInShopifyAndDB:", error);
    if (error instanceof Prisma.PrismaClientKnownRequestError) {
      console.error(`Prisma Error Code: ${error.code}`);
    }
    return { success: false, error: `An unexpected error occurred: ${error.message}` };
  }
}
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

// This is the core function to update inventory. It now requires the location GID.
export async function updateInventoryQuantityInShopifyAndDB(
  shopDomain: string,
  variantId: string, // This is the Prisma Variant ID
  newQuantity: number,
  shopifyLocationGid: string // The specific Shopify Location GID to update
): Promise<UpdateInventoryResult> {
  if (!variantId) {
    return { success: false, error: "Variant ID is required." };
  }
  if (newQuantity < 0 || isNaN(newQuantity)) {
    return { success: false, error: "Quantity must be a non-negative number." };
  }
  if (!shopifyLocationGid) {
    return { success: false, error: "Shopify Location GID is required to update inventory." };
  }

  // 1. Get variant details from our DB
  const variant = await prisma.variant.findUnique({
    where: { id: variantId },
    select: { shopifyInventoryItemId: true, sku: true },
  });

  if (!variant?.shopifyInventoryItemId) {
    return { success: false, error: `Variant (SKU: ${variant?.sku}) is not properly linked to a Shopify Inventory Item.` };
  }

  // 2. Get an offline session to make an authenticated API call
  const offlineSessionRecord = await prisma.session.findFirst({
    where: { shop: shopDomain, isOnline: false, accessToken: { not: null } },
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

  // 3. Call Shopify's GraphQL API to update the inventory
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
    const userErrors = response.body.data.inventorySetOnHandQuantities.userErrors;

    if (userErrors && userErrors.length > 0) {
      console.error("Shopify inventory update failed:", userErrors);
      return { success: false, error: "Shopify rejected the inventory update.", userErrors };
    }

    // 4. If Shopify succeeds, update our local database
    // Note: This updates the specific variant's quantity, which might not reflect the total.
    // The schema should be clear if `Variant.inventoryQuantity` is a total or per-location.
    // For now, we assume it's a total and a background job will reconcile it.
    // A better approach is to update the specific `Inventory` record.
    const warehouse = await prisma.warehouse.findUnique({ where: { shopifyLocationGid } });
    if (warehouse) {
        await prisma.inventory.updateMany({
            where: {
                product: { variants: { some: { id: variantId } } },
                warehouseId: warehouse.id,
            },
            data: { quantity: newQuantity },
        });
    }

    return {
      success: true,
      message: `Inventory for SKU ${variant.sku} updated to ${newQuantity}.`,
      inventoryAdjustmentGroupId: response.body.data.inventorySetOnHandQuantities.inventoryAdjustmentGroup?.id,
    };

  } catch (error: any) {
    console.error("Error in updateInventoryQuantityInShopifyAndDB:", error);
    return { success: false, error: `An unexpected error occurred: ${error.message}` };
  }
}

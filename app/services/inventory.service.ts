import { Prisma } from "@prisma/client";
import prisma from "~/db.server";
import shopify from "~/shopify.server"; // Corrected: Use the existing shopify.server export
import { Session } from "@shopify/shopify-api"; // Corrected: shopify object from shopify.server likely has this

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
    select: { shopifyInventoryItemId: true, sku: true, productId: true }, // Added productId
  });

  if (!variant?.shopifyInventoryItemId) {
    // If variant is null or shopifyInventoryItemId is null/undefined
    return { success: false, error: `Variant (ID: ${variantId}, SKU: ${variant?.sku || 'Unknown'}) is not linked to a Shopify Inventory Item.` };
  }

  if (!variant.productId) {
    // Ensure productId is present, needed for local DB update
     return { success: false, error: `Product ID missing for Variant (ID: ${variantId}, SKU: ${variant?.sku || 'Unknown'}).` };
  }


  // 3. --- Get Authenticated Shopify Client ---
  // Assuming shopify.server.ts exports an authenticated admin utility or similar
  // For background tasks, an offline session is typically needed.
  const offlineSessionRecord = await prisma.session.findFirst({
    where: { shop: shopDomain, isOnline: false, accessToken: { not: null } },
    orderBy: { expires: 'desc' }, // Get the most recent valid one
  });

  if (!offlineSessionRecord?.accessToken) {
    return { success: false, error: `Cannot update Shopify: No valid offline session found for ${shopDomain}.` };
  }

  // Reconstruct a session object that shopify.api.clients.Graphql expects
  // The exact properties might depend on the version of @shopify/shopify-api
  const session = new Session({
    id: offlineSessionRecord.id,
    shop: offlineSessionRecord.shop,
    state: offlineSessionRecord.state,
    isOnline: offlineSessionRecord.isOnline,
    accessToken: offlineSessionRecord.accessToken,
    scope: offlineSessionRecord.scope || '', // Ensure scope is not null
    // expires: offlineSessionRecord.expires ? new Date(offlineSessionRecord.expires) : undefined,
    // userId: offlineSessionRecord.userId ? BigInt(offlineSessionRecord.userId) : undefined,
  });

  // Use the shopify instance from shopify.server which should be initialized
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
      reason: "correction", // Or other appropriate reason
      setQuantities: [{
        inventoryItemId: variant.shopifyInventoryItemId,
        locationId: shopifyLocationGid,
        quantity: newQuantity,
      }],
    },
  };

  try {
    const response: any = await client.query({ data: { query: mutation, variables } });

    // Check response structure carefully based on actual Shopify API returns
    const inventorySetData = response?.body?.data?.inventorySetOnHandQuantities;
    const userErrors = inventorySetData?.userErrors;

    if (userErrors && userErrors.length > 0) {
      console.error("Shopify inventory update failed:", userErrors);
      return { success: false, error: "Shopify rejected the inventory update.", userErrors };
    }

    if (!inventorySetData?.inventoryAdjustmentGroup?.id && (!userErrors || userErrors.length === 0)) {
      // This case might indicate a successful call but unexpected response structure
      console.warn("Shopify inventory update call succeeded but no adjustment group ID returned and no errors reported.");
      // Decide if this is an error or a partial success. For now, let's treat as success if no errors.
    }

    // 5. --- Update Local Database on Success ---
    // This part updates the local "Inventory" table which is Product-Warehouse based.
    // This might lead to the total inventory for the product at that warehouse being set to this variant's new quantity.
    // This is a simplification based on the current Inventory schema.
    // If multiple variants of the same product exist at the same warehouse, this will overwrite.
    // A more robust solution would involve an Inventory table per (variant, warehouse).
    const warehouse = await prisma.warehouse.findUnique({ where: { shopifyLocationGid } });
    if (warehouse) {
      await prisma.inventory.upsert({
        where: { productId_warehouseId: { productId: variant.productId, warehouseId: warehouse.id } },
        update: { quantity: newQuantity }, // This sets the product's inventory at this warehouse to newQuantity
        create: { productId: variant.productId, warehouseId: warehouse.id, quantity: newQuantity },
      });
      // Additionally, update the Variant's total inventoryQuantity if it's meant to be a sum.
      // This requires fetching all inventory levels for the variant and summing them up,
      // or making an assumption. For now, the problem description's example for ProductModal
      // suggests Variant.inventoryQuantity is a general field.
      // Let's assume Variant.inventoryQuantity is updated elsewhere or represents the total across all locations.
      // The most direct update here based on the action is to the specific variant's quantity if that's how it's tracked.
      // The provided code updates prisma.inventory, which is Product-Warehouse.
      // It does NOT update prisma.variant.inventoryQuantity directly here.
      // This matches the provided code's local DB update logic.
    } else {
        console.warn(`Warehouse with Shopify Location GID ${shopifyLocationGid} not found in local DB. Shopify inventory updated, but local product-warehouse inventory record not updated.`);
    }

    // Also update the variant's main inventoryQuantity field if it represents the total
    // This is a bit tricky as we only updated one location.
    // For now, let's assume the `Variant.inventoryQuantity` should reflect this new quantity
    // if this location is considered the primary or if it's the only one being managed this way.
    // This might need a more sophisticated update (e.g., re-calculating total from all locations).
    // However, the original service (before GID change) *did* update variant.inventoryQuantity.
    // Let's replicate that behaviour for consistency with how the action might expect it.
     await prisma.variant.update({
       where: { id: variantId },
       data: { inventoryQuantity: newQuantity },
     });


    return {
      success: true,
      message: `Inventory for SKU ${variant.sku || 'N/A'} at location ${shopifyLocationGid} updated to ${newQuantity}.`,
      inventoryAdjustmentGroupId: inventorySetData?.inventoryAdjustmentGroup?.id,
    };

  } catch (error: any) {
    console.error("Error in updateInventoryQuantityInShopifyAndDB:", error);
    // Handle Prisma-specific errors or rethrow
    if (error instanceof Prisma.PrismaClientKnownRequestError) {
        // Log Prisma error details
        console.error(`Prisma Error Code: ${error.code}, Meta: ${JSON.stringify(error.meta)}`);
    }
    return { success: false, error: `An unexpected error occurred: ${error.message}` };
  }
}

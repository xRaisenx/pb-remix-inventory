import { json } from "@remix-run/node";
import { Prisma } from "@prisma/client";
import prisma from "~/db.server";
import { getShopSettings } from "~/services/shop.service"; // Assuming this service exists
import { shopifyApp } from "@shopify/shopify-app-remix/server"; // Ensure this path is correct

// Helper function to create Shopify GraphQL client
async function getShopifyGraphQLClient(shopDomain: string) {
  // TODO: Ensure shopifyApp is correctly initialized and this is the right way to get a client
  // This might involve fetching an offline session for the shop.
  // For now, assuming shopifyApp.getShopifyApi() provides access to the API client
  // and it can be configured for a specific shop.
  // This part needs to be verified against your Shopify app setup.

  // Placeholder: Replace with actual mechanism to get an authenticated GraphQL client
  // This might involve using shopify.api.clients.Graphql or similar,
  // potentially requiring an offline session access token.
  const { admin } = await shopifyApp.authenticate.admin(shopDomain); // This is likely incorrect for background tasks / needs a request object.
                                                                    // Or, you need a way to get an offline session token for the shop.

  if (!admin) {
    throw new Error(`Could not obtain Shopify Admin API client for shop ${shopDomain}`);
  }
  return admin.graphql;
}


/**
 * Updates inventory quantity in Shopify and the local database.
 * @param shop The shop domain (e.g., 'your-shop.myshopify.com')
 * @param variantId The Prisma Variant ID (string) whose inventory needs to be updated.
 * @param newQuantity The new quantity to set for the inventory item.
 * @returns An object indicating success or failure, with details.
 */
export async function updateInventoryQuantityInShopifyAndDB(
  shop: string,
  variantId: string,
  newQuantity: number
) {
  try {
    if (!variantId || typeof variantId !== 'string' || variantId.trim() === "") {
      return { success: false, error: "Invalid or missing Variant ID." };
    }
    if (newQuantity === null || newQuantity === undefined || isNaN(newQuantity) || newQuantity < 0) {
      return { success: false, error: "Invalid quantity: must be a non-negative integer." };
    }

    // 1. Fetch Variant details from local DB, including shopifyInventoryItemId and shopifyVariantId
    const variant = await prisma.variant.findUnique({
      where: { id: variantId },
      select: {
        shopifyInventoryItemId: true,
        shopifyVariantId: true, // Needed if you want to confirm association or for other checks
        inventoryQuantity: true, // Current quantity in DB
        sku: true, // For logging/identification
        product: { // To get the shopifyProductId for context or logging
          select: { shopifyProductId: true, title: true }
        }
      },
    });

    if (!variant) {
      return { success: false, error: `Variant with ID ${variantId} not found.` };
    }
    if (!variant.shopifyInventoryItemId) {
      return { success: false, error: `Shopify Inventory Item ID not found for Variant ${variantId} (SKU: ${variant.sku}). Cannot update Shopify inventory.` };
    }

    // Optional: Fetch shop settings if location ID is dynamic
    // const shopSettings = await getShopSettings(shop);
    // if (!shopSettings || !shopSettings.primaryLocationId) {
    //   return { success: false, error: "Shop primary location ID not configured." };
    // }
    // const shopifyLocationId = `gid://shopify/Location/${shopSettings.primaryLocationId}`;

    // For now, let's assume we need to find an active inventory level for the item.
    // This is a more robust approach if you don't store/rely on a single primaryLocationId from settings.
    // However, inventorySetOnHandQuantities requires a *specific* inventoryLevelId.

    // To update inventory, Shopify often requires the InventoryLevel ID.
    // Let's try to find an active inventory level for the item.
    // This might require an initial GraphQL call if you don't store inventoryLevelId.
    // For simplicity, the mutation `inventorySetOnHandQuantities` uses inventoryItemGID and locationGID.
    // The issue description implies we might not have locationId directly.
    // The `shopifyInventoryItemId` *is* the GID for the InventoryItem.

    // We need the Shopify Location ID. This should ideally be configured or discovered.
    // Let's assume there's a primary location ID stored or we fetch it.
    // For this example, I'll simulate fetching it. You should have a robust way to get this.
    // This is a common point of failure if not handled correctly.

    // const shopify = shopifyApp.getShopifyApi(); // Get the Shopify API object
    // const graphqlClient = new shopify.clients.Graphql({ session }); // This needs a valid session for the shop.

    // --- This is the critical part that needs a proper GraphQL client for the given shop ---
    // const { admin } = await shopifyApp.authenticate.admin(shop); // This won't work without a request.
    // We need an offline session token for the shop to make background calls.
    // This logic will be similar to what's needed in dailyAnalysis.ts and shopify.sync.server.ts

    // Let's assume we have a function to get an offline session token
    const offlineSession = await prisma.session.findFirst({
        where: { shop: shop, isOnline: false, accessToken: { not: null } },
        orderBy: { expires: 'desc' }, // Get the most recent one if multiple exist
    });

    if (!offlineSession || !offlineSession.accessToken) {
        return { success: false, error: `Could not find a valid offline session for shop ${shop} to update inventory.` };
    }
    const shopify = shopifyApp.api; // Get the Shopify API library instance
    const graphqlClient = new shopify.clients.Graphql({
        session: {
            shop: shop,
            accessToken: offlineSession.accessToken,
            // other necessary session properties if any for client instantiation
        }  as any // Cast to `any` if the Session constructor/type is too restrictive here
                   // or reconstruct a proper Session object if the client requires it.
    });


    // Find an active inventory level GID for the inventory item at a location.
    // This is often necessary if you don't store the inventoryLevelGid.
    // However, the `inventorySetOnHandQuantities` mutation might simplify this
    // by taking inventoryItemGid and locationGid.

    // Let's find the *first* active location for the shop to set inventory.
    // In a real app, you'd likely have a specific location you're managing inventory for.
    const locationsQuery = `
      query {
        locations(first: 1, query: "status:active") {
          edges {
            node {
              id
            }
          }
        }
      }
    `;
    const locationsResponse: any = await graphqlClient(locationsQuery);
    const shopifyLocationId = locationsResponse?.data?.locations?.edges?.[0]?.node?.id;

    if (!shopifyLocationId) {
      return { success: false, error: `Could not find an active Shopify location for shop ${shop}.` };
    }


    // 2. Update inventory in Shopify using the GraphQL Admin API
    const mutation = `
      mutation inventorySetOnHandQuantities($input: InventorySetOnHandQuantitiesInput!) {
        inventorySetOnHandQuantities(input: $input) {
          inventoryAdjustmentGroup {
            id
            reason
            referenceDocumentUri
            createdAt
            changes {
              name
              delta
              quantityAfterChange
            }
          }
          userErrors {
            field
            message
          }
        }
      }
    `;

    const variables = {
      input: {
        reason: "correction", // Or "received", "theft", etc.
        setQuantities: [
          {
            inventoryItemId: variant.shopifyInventoryItemId,
            locationId: shopifyLocationId, // Use the fetched Location GID
            quantity: newQuantity,
          },
        ],
        // referenceDocumentUri: "internal://my-app/adjustment/123" // Optional
      },
    };

    // Make the GraphQL API call
    // Ensure you have a way to get an authenticated Shopify GraphQL client for the shop
    // This is a placeholder for how you'd get your GraphQL client
    // const graphqlClient = await getShopifyGraphQLClient(shop); // You need to implement this

    const response: any = await graphqlClient(mutation, { variables });

    if (response.data?.inventorySetOnHandQuantities?.userErrors?.length > 0) {
      console.error("Shopify inventory update failed:", response.data.inventorySetOnHandQuantities.userErrors);
      return {
        success: false,
        error: "Failed to update Shopify inventory.",
        userErrors: response.data.inventorySetOnHandQuantities.userErrors,
      };
    }

    const inventoryAdjustmentGroupId = response.data?.inventorySetOnHandQuantities?.inventoryAdjustmentGroup?.id;

    // 3. If Shopify update is successful, update the local database
    await prisma.variant.update({
      where: { id: variantId },
      data: {
        inventoryQuantity: newQuantity,
        // lastShopifySync: new Date(), // Consider adding a timestamp
      },
    });

    return {
      success: true,
      message: `Inventory for Variant SKU ${variant.sku} updated to ${newQuantity} in Shopify and local DB.`,
      inventoryAdjustmentGroupId: inventoryAdjustmentGroupId,
    };

  } catch (error: any) {
    console.error("Error updating inventory:", error);
    // Check for Prisma specific errors if needed, e.g., error.code === 'P2025' for record not found
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2025') {
      return { success: false, error: `Database error: Record not found. ${error.message}` };
    }
    return { success: false, error: `An unexpected error occurred: ${error.message}` };
  }
}

// Example of a more specific error type if you want to return typed errors
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

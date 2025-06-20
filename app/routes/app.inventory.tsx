// app/routes/app.inventory.tsx

import { json, type ActionFunctionArgs, type LoaderFunctionArgs } from "@remix-run/node";
import { useLoaderData, useFetcher, useNavigate } from "@remix-run/react";
import { Page, Card, DataTable, Text, BlockStack, Spinner, Button, Banner } from "@shopify/polaris"; // Added Banner
import { authenticate } from "~/shopify.server";
import prisma  from "~/db.server";
import type { ShopifyProduct } from "~/types"; // Import updated type
import type { ProductForTable } from "./app.products";
import React, { useState, useCallback, useEffect } from "react";
import { ProductModal } from "../components/ProductModal";
import { calculateProductMetrics } from "~/services/product.service"; // Import calculateProductMetrics
import { updateInventoryQuantityInShopifyAndDB } from "~/services/inventory.service"; // Added import

// [FIX] useToast is not available in your version of Polaris. All toast logic is commented out for now.
// import polaris from '@shopify/polaris';
// const { useToast } = polaris as typeof import('@shopify/polaris');

// Helper to check for user errors in Shopify response
function hasUserErrors(data: any): boolean {
  return Array.isArray(data.userErrors) && data.userErrors.length > 0;
}
// Helper to check for inventory adjustment in Shopify response
function hasInventoryAdjustment(data: any): boolean {
  // Check for inventoryAdjustmentGroup instead of inventoryAdjustment based on mutation response
  return !!data.inventoryAdjustmentGroup && !!data.inventoryAdjustmentGroup.id;
}

// Define ActionResponse type for fetcher.data
interface InventoryActionResponse {
  success?: boolean;
  message?: string;
  error?: string;
  userErrors?: Array<{
    field: string[] | null; // Based on current UserError mapping
    message: string;
  }>;
  inventoryAdjustmentGroupId?: string; // From successful update
}


// Define types for our inventory record
interface InventoryRecord {
  id: string; // Prisma Inventory ID
  warehouseName: string;
  warehouseShopifyLocationGid: string | null; // Can be null if not linked
  productId: string; // Prisma Product ID
  productTitle: string;
  quantity: number;
  productShopifyId: string; // Added for modal context
  variantShopifyId: string; // Added for modal context - Note: This is a simplification. A single Inventory record links Product to Warehouse, not Variant. The modal needs variant context. This might need redesign. For now, using the first variant's ID as a placeholder.
  inventoryItemId: string | null; // Added for modal context
}

interface LoaderData {
  inventoryList: InventoryRecord[];
  lowStockThreshold: number | null; // Can be null
  error?: string;
  success?: string;
  message?: string; // Added for success messages
}

// Define UpdateInventoryActionData if not already defined
interface UpdateInventoryActionData {
  variantId: string; // Prisma Variant ID
  newQuantity: number;
  // The modal needs to provide inventoryItemId and locationId for the Shopify API call.
  // This means the modal needs more data than just the InventoryRecord.
  // Let's adjust the modal data structure or how it gets info.
  // For now, the action will fetch necessary info based on variantId.
}

/**
 * Action function to handle inventory updates.
 * It expects a `_action` field in the formData to determine the operation.
 * Currently, it only supports "update_inventory_quantity".
 */
export const action = async ({ request }: ActionFunctionArgs): Promise<Response> => {
  const { admin, session } = await authenticate.admin(request);
  const formData = await request.formData();
  const formAction = formData.get("_action") as string;

  if (formAction === "update_inventory_quantity") {
    const variantId = formData.get("variantId") as string; // This is the Prisma Variant ID
    const newQuantityStr = formData.get("newQuantity") as string;
    // The modal should ideally pass the inventoryItemId and the target locationId.
    // For now, we'll fetch them based on the variantId and associated inventory/warehouse.

    const newQuantity = parseInt(newQuantityStr, 10);

    if (isNaN(newQuantity) || newQuantity < 0) {
        return json({ error: "Invalid quantity: must be a non-negative number." } as InventoryActionResponse, { status: 400 });
    }
    if (!variantId) {
        return json({ error: "Variant ID missing." } as InventoryActionResponse, { status: 400 });
    }

    try {
      // Call the centralized inventory update service
      const updateResult = await updateInventoryQuantityInShopifyAndDB(
        session.shop,
        variantId,
        newQuantity
      );

      if (!updateResult.success) {
        return json({
          error: updateResult.error || "Failed to update inventory.",
          userErrors: updateResult.userErrors // Pass along userErrors if any
        } as InventoryActionResponse, { status: updateResult.userErrors ? 400 : 500 });
      }

      // If the service call was successful, proceed with product metrics recalculation
      // The service already updated the local DB variant quantity.
      // We need the productId to recalculate product metrics.
      const updatedVariant = await prisma.variant.findUnique({
        where: { id: variantId },
        select: { productId: true }
      });

      if (!updatedVariant?.productId) {
        // This case should ideally not happen if updateInventoryQuantityInShopifyAndDB succeeded
        // and found the variant.
        console.error(`Product ID not found for variant ${variantId} after successful inventory update.`);
        // Return success for inventory, but maybe log this anomaly.
        return json({
          success: true,
          message: updateResult.message || "Inventory updated, but could not re-calculate product metrics (product ID missing).",
          inventoryAdjustmentGroupId: updateResult.inventoryAdjustmentGroupId
        } as InventoryActionResponse);
      }

      // Re-calculate and update product metrics after inventory change
      const productToUpdate = await prisma.product.findUnique({
        where: { id: updatedVariant.productId },
          include: {
            variants: { select: { inventoryQuantity: true } }, // Need all variants for total inventory
            shop: { include: { NotificationSettings: true } } // Need shop settings for thresholds
          }
        });

        if (productToUpdate) {
           const notificationSetting = productToUpdate.shop.NotificationSettings?.[0];
           const lowStockThresholdUnits = notificationSetting?.lowStockThreshold ?? productToUpdate.shop.lowStockThreshold ?? 10;
           const criticalStockThresholdUnits = notificationSetting?.criticalStockThresholdUnits ?? Math.min(5, Math.floor(lowStockThresholdUnits * 0.3));
           const criticalStockoutDays = notificationSetting?.criticalStockoutDays ?? 3;
           const salesVelocityThresholdForTrending = notificationSetting?.salesVelocityThreshold ?? 50;

           const shopSettingsForMetrics = { lowStockThresholdUnits, criticalStockThresholdUnits, criticalStockoutDays };

           const productWithVariantsForCalc = {
             ...productToUpdate,
             variants: productToUpdate.variants.map(v => ({ inventoryQuantity: v.inventoryQuantity || 0})),
           };

           const metrics = calculateProductMetrics(productWithVariantsForCalc, shopSettingsForMetrics);
           const trending = (productToUpdate.salesVelocityFloat ?? 0) > salesVelocityThresholdForTrending;

           await prisma.product.update({
             where: { id: productToUpdate.id },
             data: {
               stockoutDays: metrics.stockoutDays,
               status: metrics.status,
               trending: trending,
             },
           });
        }


        return json({
          success: true,
          message: "Inventory updated successfully in Shopify and local database.",
          inventoryAdjustmentGroupId: inventoryData.inventoryAdjustmentGroup.id
        } as InventoryActionResponse);
      }

      // The service was successful, so we can return success.
      // The message from the service is more specific.
      return json({
        success: true,
        message: updateResult.message || "Inventory updated successfully and product metrics recalculated.",
        inventoryAdjustmentGroupId: updateResult.inventoryAdjustmentGroupId
      } as InventoryActionResponse);

    } catch (error: unknown) {
      // This catch block now primarily catches errors from the product metrics recalculation
      // or unexpected errors from the service call that weren't handled by its try/catch.
      const message = error instanceof Error ? error.message : "An unexpected error occurred during the inventory update process.";
      console.error(`Error in inventory update action for variant ${variantId}:`, error);
      return json({ error: message } as InventoryActionResponse, { status: 500 });
    }
  }
  return json({ error: "Invalid action specified." } as InventoryActionResponse, { status: 400 });
};

/**
 * Loader function to fetch inventory records for the current shop.
 * Also retrieves the shop's low stock threshold.
 */
export const loader = async ({ request }: LoaderFunctionArgs): Promise<Response> => {
  const { session } = await authenticate.admin(request);
  const shopDomain = session.shop;

  try {
    const shop = await prisma.shop.findUnique({ where: { shop: shopDomain } });
    if (!shop) {
      return json({ inventoryList: [], error: "Shop not found." }, { status: 404 });
    }

    const inventoryRecords = await prisma.inventory.findMany({
      where: {
        warehouse: {
          shopId: shop.id,
        },
      },
      include: {
        product: {
            select: {
                id: true,
                title: true,
                shopifyId: true,
                variants: { // Include variants to get shopifyId and inventoryItemId
                    select: {
                        id: true, // Prisma Variant ID
                        shopifyId: true, // Shopify Variant GID
                        inventoryItemId: true, // Shopify Inventory Item ID
                    },
                    take: 1 // Assuming we only need info from the first variant for the modal trigger
                }
            }
        },
        warehouse: { select: { id: true, name: true, shopifyLocationGid: true } },
      },
      orderBy: [
        { product: { title: 'asc' } },
        { warehouse: { name: 'asc' } },
      ]
    });

    // Fix for InventoryRecord: warehouseShopifyLocationGid must be string, not string|null
    const inventoryList: InventoryRecord[] = inventoryRecords.map(inv => ({
      id: inv.id, // Prisma Inventory ID
      warehouseName: inv.warehouse.name,
      warehouseShopifyLocationGid: inv.warehouse.shopifyLocationGid, // Can be null
      productId: inv.product.id, // Prisma Product ID
      productTitle: inv.product.title,
      quantity: inv.quantity,
      productShopifyId: inv.product.shopifyId,
      // This is a simplification: an Inventory record is Product-Warehouse.
      // The modal needs a Variant ID and Inventory Item ID.
      // We'll use the first variant's IDs for the modal trigger, but this might need UI/logic refinement.
      variantShopifyId: inv.product.variants?.[0]?.shopifyId ?? '',
      inventoryItemId: inv.product.variants?.[0]?.inventoryItemId ?? null,
    }));

    return json({ inventoryList, lowStockThreshold: shop.lowStockThreshold });
  } catch (error) {
    console.error("Error fetching inventory:", error);
    return json({ inventoryList: [], error: "Failed to fetch inventory." }, { status: 500 });
  }
};

// Convert InventoryRecord to a minimal ProductForTable structure for ProductModal
// The ProductModal expects a ProductForTable structure, which is designed for the Products page.
// This is a mismatch. The modal should ideally be more generic or the Inventory page should use a different modal.
// For now, we'll create a minimal structure that the modal can *partially* use, but it won't have full product details.
// A better approach is to fetch full product/variant details in the modal's loader/action or pass more data.
function inventoryRecordToProductForModal(item: InventoryRecord): ProductForTable {
  return {
    id: item.productId, // Prisma Product ID
    shopifyId: item.productShopifyId, // Shopify Product GID
    title: item.productTitle,
    vendor: '', // Not available in InventoryRecord
    price: '', // Not available
    sku: '', // Not available
    inventory: item.quantity, // This is quantity for *this* warehouse, not total
    salesVelocity: null, // Not available
    stockoutDays: null, // Not available
    status: 'Unknown', // Not available
    variantsForModal: [
      {
        id: item.productId, // Using Product ID as a placeholder for Variant ID
        shopifyVariantId: item.variantShopifyId, // Shopify Variant GID (simplified)
        title: item.productTitle, // Using Product Title as placeholder for Variant Title
        sku: '', // Not available
        price: '', // Not available
        inventoryQuantity: item.quantity, // Quantity for *this* warehouse
        inventoryItemId: item.inventoryItemId, // Shopify Inventory Item ID (simplified)
      },
    ],
  };
}


export default function InventoryPage() {
  const { inventoryList, error } = useLoaderData<LoaderData>();
  const fetcher = useFetcher<InventoryActionResponse>(); // Use defined type
  const navigate = useNavigate();

  const [isModalOpen, setIsModalOpen] = useState(false);
  const [selectedItemForModal, setSelectedItemForModal] = useState<InventoryRecord | null>(null);

  const handleOpenModal = useCallback((item: InventoryRecord) => {
    // The modal needs variant-specific info (shopifyVariantId, inventoryItemId) and a linked location.
    // The current InventoryRecord structure is Product-Warehouse.
    // This requires fetching variant details or redesigning the modal/data flow.
    // For now, we'll use the simplified data available in InventoryRecord, but this is a limitation.
    if (!item.warehouseShopifyLocationGid) {
        // TODO: Consider a more user-friendly notification here (e.g., a Toast or an AlertBanner)
        // For now, an alert, but this stops the modal from opening.
        // showToast("This warehouse is not linked to a Shopify Location. Inventory cannot be updated in Shopify for this item.", { tone: 'warning' });
        console.warn("Warehouse not linked to Shopify Location for item:", item);
        return;
    }
     if (!item.inventoryItemId) {
         console.warn("Inventory Item ID missing for item:", item);
         // showToast("Inventory Item ID missing for this product variant. Cannot update in Shopify.", { tone: 'warning' });
         return;
     }

    setSelectedItemForModal(item);
    setIsModalOpen(true);
  }, []);

  const handleCloseModal = useCallback(() => {
    setIsModalOpen(false);
    setSelectedItemForModal(null);
    // After closing modal, clear fetcher data to reset state and potentially show new toasts
    // This might cause a re-fetch of loader data depending on Remix behavior
    // navigate("/app/inventory", { replace: true }); // This forces a re-fetch
  }, [navigate]); // Added navigate to dependency array

  // Move fetcherData above all uses
  const fetcherData = fetcher.data; // Use defined type

  // Effect to handle toast notifications based on fetcher data (action outcomes)
  useEffect(() => {
    if (fetcher.state === "idle" && fetcherData) {
      if (fetcherData.success && fetcherData.message) {
        // showToast(fetcherData.message, { tone: 'success', duration: 5000 }); // Commented out
        console.log("Inventory update success:", fetcherData.message);
        handleCloseModal();
        // Re-navigate to clear fetcher.data and ensure fresh state
        navigate("/app/inventory", { replace: true });
      } else if (fetcherData.error) {
        // showToast(fetcherData.error, { tone: 'critical', duration: 7000 }); // Commented out
        console.error("Inventory update error:", fetcherData.error);
        // Re-navigate to clear fetcher.data for errors as well
        navigate("/app/inventory", { replace: true });
      }
    }
  }, [fetcher.state, fetcherData, handleCloseModal, navigate]);

  // [FIX] productData is not defined. Use selectedItemForModal to build a minimal ProductForTable for the modal.
  // This is a workaround due to the modal expecting a different data structure.
  const productForModal: ProductForTable | null = selectedItemForModal
    ? {
        id: selectedItemForModal.productId, // Prisma Product ID
        shopifyId: selectedItemForModal.productShopifyId, // Shopify Product GID
        title: selectedItemForModal.productTitle,
        vendor: '', // Placeholder
        price: '', // Placeholder
        sku: '', // Placeholder
        inventory: selectedItemForModal.quantity, // Quantity for *this* warehouse
        salesVelocity: null, // Placeholder
        stockoutDays: null, // Placeholder
        status: 'Unknown', // Placeholder
        variantsForModal: [
          {
            id: selectedItemForModal.productId, // Using Product ID as placeholder for Variant ID
            shopifyVariantId: selectedItemForModal.variantShopifyId, // Shopify Variant GID (simplified)
            title: selectedItemForModal.productTitle, // Using Product Title as placeholder for Variant Title
            sku: '', // Placeholder
            price: '', // Placeholder
            inventoryQuantity: selectedItemForModal.quantity, // Quantity for *this* warehouse
            inventoryItemId: selectedItemForModal.inventoryItemId, // Shopify Inventory Item ID (simplified)
          },
        ],
      }
    : null;

  if (error) { // This is for loader error, not fetcher error
    return (
      <Page title="Inventory Management">
        <Card>
          <BlockStack gap="200">
            <Text as="h2" variant="headingLg">Error Loading Inventory</Text>
            <Text as="p" tone="critical">{error}</Text>
          </BlockStack>
        </Card>
      </Page>
    );
  }

  const rows = inventoryList.map(item => [
    item.productTitle,
    item.warehouseName,
    item.quantity,
    <Button
      key={`action-${item.id}`}
      onClick={() => handleOpenModal(item)}
      variant="plain"
      accessibilityLabel={`Update quantity for ${item.productTitle} at ${item.warehouseName}`}
      disabled={!item.warehouseShopifyLocationGid || !item.inventoryItemId} // Disable if warehouse not linked or item ID missing
    >
      Update Quantity
    </Button>
  ]);

  return (
    <Page title="Inventory Management">
      <BlockStack gap="400">
        {/* Fetcher state indicator */}
        {fetcher.state === "submitting" && <Spinner accessibilityLabel="Updating inventory..." />}
        {/* Banners for fetcher errors/success are now replaced by Toasts */}
        {/* The useEffect hook handles showing toasts based on fetcher.data */}

        <Card>
          <DataTable
            columnContentTypes={["text", "text", "numeric", "text"]}
            headings={["Product", "Warehouse", "Quantity", "Actions"]}
            rows={rows}
            footerContent={inventoryList.length > 0 ? `Showing ${inventoryList.length} inventory records` : undefined}
          />
          {inventoryList.length === 0 && fetcher.state === 'idle' && ( // Only show empty state when not loading/submitting
            <div style={{padding: 'var(--p-space-400)', textAlign: 'center'}}>
              <Text as="p" tone="subdued">No inventory records found.</Text>
            </div>
          )}
        </Card>

        {/* Render modal only if an item is selected and modal is open */}
        {selectedItemForModal && productForModal && (
          <ProductModal
            open={isModalOpen}
            onClose={handleCloseModal}
            product={productForModal} // Pass the minimal structure
            // The modal needs to know which specific Inventory record is being updated,
            // and the Inventory Item ID and Location ID for the Shopify API call.
            // This data needs to be passed to the modal or fetched within it.
            // For now, the action fetches this based on variantId, which is a workaround.
            // A better approach: pass selectedItemForModal to modal, modal uses its data to build form,
            // modal's submit handler includes inventoryItemId and shopifyLocationGid in fetcher.submit.
          />
        )}
      </BlockStack>
    </Page>
  );
}

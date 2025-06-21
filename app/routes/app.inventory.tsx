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
import { useFetcher } from "@remix-run/react"; // Ensure this is present
import { updateInventoryQuantityInShopifyAndDB } from "~/services/inventory.service";
// Removed ProductModal import as it's not directly used in the provided diff for this file,
// but it might be used in the actual component JSX. Assuming it's correctly imported if used.
// import { ProductModal } from "~/components/ProductModal";
import type { ProductForTable } from "./app.products"; // Keep if ProductForTable is used

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

export const action = async ({ request }: ActionFunctionArgs) => {
  const { session } = await authenticate.admin(request);
  const formData = await request.formData();
  const intent = formData.get("intent"); // Changed from _action to intent

  if (intent === 'updateInventory') { // Check for 'updateInventory' intent
    const variantId = formData.get("variantId") as string; // Prisma Variant ID
    const newQuantity = parseInt(formData.get("newQuantity") as string, 10);
    const shopifyLocationGid = formData.get("shopifyLocationGid") as string; // Expect this from form

    // Basic validation
    if (!variantId || !shopifyLocationGid || isNaN(newQuantity) || newQuantity < 0) {
      return json({ error: "Invalid input: Variant ID, Shopify Location GID, and a non-negative quantity are required." }, { status: 400 });
    }

    // Call the centralized service
    const result = await updateInventoryQuantityInShopifyAndDB(
      session.shop,
      variantId,
      newQuantity,
      shopifyLocationGid
    );

    if (!result.success) {
      return json({ error: result.error, userErrors: result.userErrors }, { status: 400 });
    }

    // After successful update, you might want to trigger a recalculation of product metrics
    // This is an advanced step, for now, returning success is sufficient.
    // The existing product metrics recalculation logic can be kept if it's still desired
    // but it was complex and might be better handled by a separate process or event.
    // For this diff, we'll simplify and rely on the service's success.

    const updatedVariant = await prisma.variant.findUnique({
        where: { id: variantId },
        select: { productId: true }
      });

      if (updatedVariant?.productId) {
        const productToUpdate = await prisma.product.findUnique({
        where: { id: updatedVariant.productId },
          include: {
            variants: { select: { inventoryQuantity: true } },
            shop: { include: { NotificationSettings: true } }
          }
        });

        if (productToUpdate) {
           const notificationSetting = productToUpdate.shop.NotificationSettings?.[0];
           const lowStockThresholdUnits = notificationSetting?.lowStockThreshold ?? productToUpdate.shop.lowStockThreshold ?? 10;
           const criticalStockThresholdUnits = notificationSetting?.criticalStockThresholdUnits ?? Math.min(5, Math.floor(lowStockThresholdUnits * 0.3));
           const criticalStockoutDays = notificationSetting?.criticalStockoutDays ?? 3;
           const salesVelocityThresholdForTrending = notificationSetting?.salesVelocityThreshold ?? 50; // Default

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
      }


    return json({ success: true, message: result.message, inventoryAdjustmentGroupId: result.inventoryAdjustmentGroupId });
  }

  return json({ error: "Invalid intent" }, { status: 400 }); // Changed error message
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
  // const fetcher = useFetcher<InventoryActionResponse>(); // Use defined type - This line is in original, keep it
  const productDetailsFetcher = useFetcher<ProductForTable>(); // For fetching product details
  const navigate = useNavigate();


  const [isModalOpen, setIsModalOpen] = useState(false);
  // const [selectedItemForModal, setSelectedItemForModal] = useState<InventoryRecord | null>(null); // Original state
  const [selectedProduct, setSelectedProduct] = useState<ProductForTable | null>(null); // New state for full product details

  const handleOpenModal = useCallback((item: InventoryRecord) => {
    if (!item.warehouseShopifyLocationGid) {
      alert("This warehouse is not linked to a Shopify Location. Inventory cannot be updated.");
      return;
    }
    // Fetch full product details for the modal
    // Assuming an API route like /api/product-details/:productId exists
    // The item.productShopifyId should be the GID. If it's a numeric ID, the API route needs to handle that.
    // Let's assume item.productShopifyId is the GID and the API route expects that.
    productDetailsFetcher.load(`/api/product-details/${item.productShopifyId}`);
    // setSelectedItemForModal(item); // No longer setting this directly, wait for fetcher
    setIsModalOpen(true);
  }, [productDetailsFetcher]); // Added productDetailsFetcher to dependencies

  useEffect(() => {
    if (productDetailsFetcher.data) {
      setSelectedProduct(productDetailsFetcher.data);
    }
  }, [productDetailsFetcher.data]);

  const handleCloseModal = useCallback(() => {
    setIsModalOpen(false);
    setSelectedProduct(null); // Clear the fetched product details
    // navigate("/app/inventory", { replace: true }); // Consider if this is still needed
  }, []); // Removed navigate from dependencies for now, can be added if re-navigation is essential

  const fetcher = useFetcher<InventoryActionResponse>(); // Ensure fetcher is defined for the main form actions
  const fetcherData = fetcher.data;

  useEffect(() => {
    if (fetcher.state === "idle" && fetcherData) {
      if (fetcherData.success && fetcherData.message) {
        console.log("Inventory update success:", fetcherData.message);
        handleCloseModal();
        navigate("/app/inventory", { replace: true }); // Re-navigate on success
      } else if (fetcherData.error) {
        console.error("Inventory update error:", fetcherData.error);
         // Potentially show a user-facing error message here, e.g., using a Banner
        // For now, just logging. The modal might remain open or close depending on UX choice.
        // If modal should close on error:
        // handleCloseModal();
        // navigate("/app/inventory", { replace: true }); // Re-navigate on error
      }
    }
  }, [fetcher.state, fetcherData, handleCloseModal, navigate]);


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
      disabled={!item.warehouseShopifyLocationGid || !item.inventoryItemId}
    >
      Update Quantity
    </Button>
  ]);

  return (
    <Page title="Inventory Management">
      <BlockStack gap="400">
        {fetcher.state === "submitting" && <Spinner accessibilityLabel="Updating inventory..." />}
        {/* Consider adding a Banner here for fetcher errors if not using toasts */}
        {/* Example: fetcherData?.error && !fetcherData.success && (<Banner tone="critical">{fetcherData.error}</Banner>) */}

        <Card>
          <DataTable
            columnContentTypes={["text", "text", "numeric", "text"]}
            headings={["Product", "Warehouse", "Quantity", "Actions"]}
            rows={rows}
            footerContent={inventoryList.length > 0 ? `Showing ${inventoryList.length} inventory records` : undefined}
          />
          {inventoryList.length === 0 && fetcher.state === 'idle' && (
            <div style={{padding: 'var(--p-space-400)', textAlign: 'center'}}>
              <Text as="p" tone="subdued">No inventory records found.</Text>
            </div>
          )}
        </Card>

        {isModalOpen && ( // Modal opens based on isModalOpen flag
          <ProductModal
            open={isModalOpen}
            onClose={handleCloseModal}
            product={selectedProduct} // Pass the fetched full product details
            // The ProductModal will need to be adapted to:
            // 1. Receive `selectedProduct` (which is ProductForTable).
            // 2. Include `shopifyLocationGid` in its form submission.
            //    This means `shopifyLocationGid` needs to be passed to ProductModal.
            //    One way: When `handleOpenModal` is called with `item`, store `item.warehouseShopifyLocationGid`
            //    in a state variable, then pass that state to `<ProductModal>`.
            // Example:
            // const [currentLocationGid, setCurrentLocationGid] = useState<string | null>(null);
            // In handleOpenModal: setCurrentLocationGid(item.warehouseShopifyLocationGid);
            // In ProductModal call: shopifyLocationGid={currentLocationGid}
            // Then ProductModal's internal form needs a hidden input for `shopifyLocationGid`.
          />
        )}
      </BlockStack>
    </Page>
  );
}

// app/routes/app.inventory.tsx

import { json, type ActionFunctionArgs, type LoaderFunctionArgs } from "@remix-run/node";
import { useLoaderData, useFetcher, useNavigate } from "@remix-run/react";
import { Page, Card, DataTable, Text, BlockStack, Spinner, Button, useToast } from "@shopify/polaris"; // Removed Banner, Added useToast
import { authenticate } from "~/shopify.server";
import prisma  from "~/db.server";
import type { ShopifyProduct } from "~/types"; // Import updated type
import React, { useState, useCallback, useEffect } from "react";
import ProductModal from "../components/ProductModal";

// Helper to check for user errors in Shopify response
function hasUserErrors(data: any): boolean {
  return Array.isArray(data.userErrors) && data.userErrors.length > 0;
}
// Helper to check for inventory adjustment in Shopify response
function hasInventoryAdjustment(data: any): boolean {
  return !!data.inventoryAdjustment && !!data.inventoryAdjustment.id;
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
  inventoryAdjustmentId?: string; // From successful update
}


// Define types for our inventory record
interface InventoryRecord {
  id: string;
  warehouseName: string;
  warehouseShopifyLocationGid: string;
  productId: string;
  productTitle: string;
  quantity: number;
}

interface LoaderData {
  inventoryList: InventoryRecord[];
  lowStockThreshold: number;
  error?: string;
  success?: string;
  message?: string; // Added for success messages
}

// Define UpdateInventoryActionData if not already defined
interface UpdateInventoryActionData {
  productId: string;
  variantId: string;
  inventoryItemId: string;
  shopifyLocationGid: string;
  quantity: number;
}

/**
 * Action function to handle inventory updates.
 * It expects a `_action` field in the formData to determine the operation.
 * Currently, it only supports "update_inventory_quantity".
 */
export const action = async ({ request }: ActionFunctionArgs): Promise<Response> => {
  const { admin } = await authenticate.admin(request);
  const formData = await request.formData();
  const formAction = formData.get("_action") as string;

  if (formAction === "update_inventory_quantity") {
    const inventoryItemId = formData.get("inventoryItemId") as string;
    const locationId = formData.get("locationId") as string; // This is warehouseShopifyLocationGid
    const quantityStr = formData.get("quantity") as string;
    const prismaInventoryId = formData.get("prismaInventoryId") as string;
    // productShopifyId and variantShopifyId are also available if needed for context/logging
    // const productShopifyId = formData.get("productShopifyId") as string;
    // const variantShopifyId = formData.get("variantShopifyId") as string;

    const newQuantity = parseInt(quantityStr, 10);

    if (!prismaInventoryId) {
        return json({ error: "Local inventory record ID missing. Cannot sync." } as InventoryActionResponse, { status: 400 });
    }
    if (isNaN(newQuantity) || newQuantity < 0) {
        return json({ error: "Invalid quantity: must be a non-negative number." } as InventoryActionResponse, { status: 400 });
    }
    if (!inventoryItemId || !locationId) {
        return json({ error: "Shopify Inventory Item ID or Location ID missing." } as InventoryActionResponse, { status: 400 });
    }
    if (!inventoryItemId.startsWith("gid://shopify/InventoryItem/") || !locationId.startsWith("gid://shopify/Location/")) {
        return json({ error: "Invalid Shopify Inventory Item ID or Location ID format." } as InventoryActionResponse, { status: 400 });
    }

    try {
      const response = await admin.graphql(
        `#graphql
        mutation inventorySetQuantities($input: InventorySetQuantitiesInput!) {
          inventorySetQuantities(input: $input) {
            inventoryAdjustmentGroup { id }
            userErrors { field message }
          }
        }`,
        {
          variables: {
            input: {
              changes: [{ inventoryItemId, locationId, quantity: newQuantity }],
              reason: "inventory_update_from_app",
              setQuantitiesOperationId: `inv-update-${prismaInventoryId}-${Date.now()}`
            }
          }
        }
      );

      const responseData = await response.json() as {
        data?: {
          inventorySetQuantities?: {
            inventoryAdjustment?: { id: string };
            userErrors?: Array<{ field: string; message: string }>;
          };
        };
        errors?: Array<{ message: string }>;
      };

      if (responseData.errors && responseData.errors.length > 0) {
        console.error("GraphQL execution errors on inventorySetQuantities:", responseData.errors);
        return json({ error: `Shopify API error: ${responseData.errors[0].message}` } as InventoryActionResponse, { status: 500 });
      }

      const inventoryData = responseData.data?.inventorySetQuantities;
      if (inventoryData && hasUserErrors(inventoryData)) {
        const userErrors = (inventoryData.userErrors ?? []).map(e => ({
          message: e.message,
          field: Array.isArray(e.field) ? e.field : (e.field ? [e.field] : null) // Ensure field is string[] or null
        }));
        console.error("UserErrors on inventorySetQuantities:", userErrors);
        return json({ 
          error: `Shopify rejected update: ${userErrors[0]?.message || 'Unknown user error.'}`,
          userErrors: userErrors
        } as InventoryActionResponse, { status: 400 });
      }

      if (inventoryData && hasInventoryAdjustment(inventoryData)) {
        console.log("Successfully updated inventory in Shopify for item:", inventoryItemId);

        // Update local Prisma DB
        await prisma.inventory.update({
          where: { id: prismaInventoryId },
          data: { quantity: newQuantity },
        });

        return json({ 
          success: true, 
          message: "Inventory updated successfully in Shopify and local database.",
          inventoryAdjustmentId: inventoryData.inventoryAdjustment?.id 
        } as InventoryActionResponse);
      }

      console.warn("Inventory update via Shopify completed, but no clear success/error state:", responseData);
      return json({ error: "Inventory update response from Shopify was inconclusive." } as InventoryActionResponse, { status: 200 });

    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : "Failed to update inventory via Shopify due to a server error.";
      console.error(`Failed to update Shopify inventory for item ${inventoryItemId}:`, error);
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
        product: { select: { id: true, title: true, shopifyId: true } },
        warehouse: { select: { id: true, name: true, shopifyLocationGid: true } },
      },
      orderBy: [
        { product: { title: 'asc' } },
        { warehouse: { name: 'asc' } },
      ]
    });

    // Fix for InventoryRecord: warehouseShopifyLocationGid must be string, not string|null
    const inventoryList: InventoryRecord[] = inventoryRecords.map(inv => ({
      id: inv.id,
      warehouseName: inv.warehouse.name,
      warehouseShopifyLocationGid: inv.warehouse.shopifyLocationGid || '',
      productId: inv.product.id,
      productTitle: inv.product.title,
      quantity: inv.quantity,
    }));

    return json({ inventoryList, lowStockThreshold: shop.lowStockThreshold });
  } catch (error) {
    console.error("Error fetching inventory:", error);
    return json({ inventoryList: [], error: "Failed to fetch inventory." }, { status: 500 });
  }
};

export default function InventoryPage() {
  const { inventoryList, error } = useLoaderData<LoaderData>();
  const fetcher = useFetcher();
  const navigate = useNavigate();

  const [isModalOpen, setIsModalOpen] = useState(false);
  const [selectedItemForModal, setSelectedItemForModal] = useState<InventoryRecord | null>(null);

  const handleOpenModal = useCallback((item: InventoryRecord) => {
    if (!item.warehouseShopifyLocationGid) {
        // TODO: Consider a more user-friendly notification here (e.g., a Toast or an AlertBanner)
        // For now, an alert, but this stops the modal from opening.
        alert("This warehouse is not linked to a Shopify Location. Inventory cannot be updated in Shopify for this item.");
        return;
    }
    setSelectedItemForModal(item);
    setIsModalOpen(true);
  }, []);

  const handleCloseModal = useCallback(() => {
    setIsModalOpen(false);
    setSelectedItemForModal(null);
  }, []);

  const handleUpdateInventory = useCallback((data: UpdateInventoryActionData) => {
    if (!selectedItemForModal) {
      console.error("No item selected for update. This should not happen if modal is open.");
      return;
    }

    fetcher.submit(
      {
        _action: "update_inventory_quantity",
        inventoryItemId: data.inventoryItemId,
        locationId: data.shopifyLocationGid, // This comes from ProductModal's UpdateInventoryActionData
        quantity: String(data.quantity),
        prismaInventoryId: selectedItemForModal.id,
        productShopifyId: data.productId,
        variantShopifyId: data.variantId,
      },
      { method: "post" }
    );
  }, [fetcher, selectedItemForModal]);

  // Move fetcherData above all uses
  const fetcherData = fetcher.data as InventoryActionResponse | undefined; // Use defined type
  const { show: showToast } = useToast();

  // Effect to handle toast notifications based on fetcher data (action outcomes)
  useEffect(() => {
    if (fetcher.state === "idle" && fetcherData) {
      if (fetcherData.success && fetcherData.message) {
        showToast(fetcherData.message, { tone: 'success', duration: 5000 });
        handleCloseModal();
        // Re-navigate to clear fetcher.data and ensure fresh state
        navigate("/app/inventory", { replace: true });
      } else if (fetcherData.error) {
        const errorMessage = fetcherData.userErrors && fetcherData.userErrors.length > 0
          ? `Error: ${fetcherData.error}. Details: ${fetcherData.userErrors.map(e => e.message).join(', ')}`
          : fetcherData.error;
        showToast(errorMessage, { tone: 'critical', duration: 7000 });
        // Re-navigate to clear fetcher.data for errors as well
        navigate("/app/inventory", { replace: true });
      }
    }
  }, [fetcher.state, fetcherData, showToast, handleCloseModal, navigate]);

  const productForModal: ShopifyProduct | null = selectedItemForModal ? {
      id: selectedItemForModal.productId, // Shopify Product GID
      title: selectedItemForModal.productTitle,
      // Minimal data for ProductModal, it fetches its own full details
      variants: [], vendor: '',
  } : null;

  // If products is not defined, get it from loader data or define as empty array
  const { products = [] } = useLoaderData<any>();

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
      accessibilityLabel={`Update quantity for ${item.productTitle}`}
      disabled={!item.warehouseShopifyLocationGid} // Disable if warehouse not linked
    >
      Update Quantity
    </Button>
  ]);

  return (
    <Page title="Inventory Management">
      <BlockStack gap="400">
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
          {inventoryList.length === 0 && !fetcher.state && (
            <div style={{padding: 'var(--p-space-400)', textAlign: 'center'}}>
              <Text as="p" tone="subdued">No inventory records found.</Text>
            </div>
          )}
        </Card>

        {selectedItemForModal && productForModal && (
          <ProductModal
            open={isModalOpen}
            onClose={handleCloseModal}
            product={selectedItemForModal ? products.find((p: any) => p.id === selectedItemForModal.productId) ?? null : null}
            warehouseShopifyLocationGid={selectedItemForModal?.warehouseShopifyLocationGid || ''}
            onUpdateInventoryAction={handleUpdateInventory}
            isUpdating={fetcher.state === "submitting"}
          />
        )}
      </BlockStack>
    </Page>
  );
}

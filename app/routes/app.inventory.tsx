// app/routes/app.inventory.tsx

import { json, redirect, type ActionFunctionArgs, type LoaderFunctionArgs } from "@remix-run/node";
import { useLoaderData, useFetcher, useNavigate } from "@remix-run/react";
import { Page, Card, DataTable, Text, BlockStack, Spinner, Banner, Button } from "@shopify/polaris";
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

export const action = async ({ request }: ActionFunctionArgs) => {
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
        return json({ error: "Local inventory record ID missing. Cannot sync." }, { status: 400 });
    }
    if (isNaN(newQuantity) || newQuantity < 0) {
        return json({ error: "Invalid quantity: must be a non-negative number." }, { status: 400 });
    }
    if (!inventoryItemId || !locationId) {
        return json({ error: "Shopify Inventory Item ID or Location ID missing." }, { status: 400 });
    }
    if (!inventoryItemId.startsWith("gid://shopify/InventoryItem/") || !locationId.startsWith("gid://shopify/Location/")) {
        return json({ error: "Invalid Shopify Inventory Item ID or Location ID format." }, { status: 400 });
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
        return json({ error: `Shopify API error: ${responseData.errors[0].message}` }, { status: 500 });
      }

      const inventoryData = responseData.data?.inventorySetQuantities;
      if (inventoryData && hasUserErrors(inventoryData)) {
        console.error("UserErrors on inventorySetQuantities:", inventoryData.userErrors);
        // Map userErrors to match ActionResponseData type
        return json({ 
          error: `Shopify rejected update: ${inventoryData.userErrors?.[0]?.message}`,
          userErrors: (inventoryData.userErrors ?? []).map(e => ({
            message: e.message,
            field: Array.isArray(e.field) ? e.field : (e.field ? [e.field] : null)
          }))
        }, { status: 400 });
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
        });
      }

      console.warn("Inventory update via Shopify completed, but no clear success/error state:", responseData);
      return json({ error: "Inventory update response from Shopify was inconclusive." }, { status: 200 });

    } catch (error: any) {
      console.error(`Failed to update Shopify inventory for item ${inventoryItemId}:`, error);
      return json({ error: error.message || "Failed to update inventory via Shopify due to a server error." }, { status: 500 });
    }
  }
  return json({ error: "Invalid action specified." }, { status: 400 });
};

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { admin, session } = await authenticate.admin(request);
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
  const { inventoryList, lowStockThreshold, error, success, message } = useLoaderData<LoaderData>();
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
  const fetcherData = (fetcher.data ?? {}) as { success?: boolean; error?: string; message?: string };

  // Effect to close modal on successful fetcher submission
  useEffect(() => {
    if (fetcherData.success && fetcher.state === "idle") {
      handleCloseModal();
    }
  }, [fetcherData, fetcher.state, handleCloseModal]);

  // Effect to navigate on successful fetcher submission
  useEffect(() => {
    if (fetcherData.success && fetcher.state === "idle") {
      navigate("/app/inventory");
    }
  }, [fetcherData, fetcher.state, navigate]);

  const productForModal: ShopifyProduct | null = selectedItemForModal ? {
      id: selectedItemForModal.productId, // Shopify Product GID
      title: selectedItemForModal.productTitle,
      // Minimal data for ProductModal, it fetches its own full details
      variants: [], vendor: '',
  } : null;

  // If products is not defined, get it from loader data or define as empty array
  const { products = [] } = useLoaderData<any>();

  if (error) {
    return (
      <Page title="Inventory Management">
        <Banner title="Error Loading Inventory" tone="critical">{error}</Banner>
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
        {fetcherData.error && (
          <Banner title="Update Error" tone="critical" onDismiss={() => fetcher.submit(null, {method: 'get', action: '/app/inventory'}) }>{fetcherData.error}</Banner>
        )}
        {fetcherData.success && fetcherData.message && (
          <Banner title="Success" tone="success" onDismiss={() => fetcher.submit(null, {method: 'get', action: '/app/inventory'}) }>
            {fetcherData.message}
          </Banner>
        )}

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

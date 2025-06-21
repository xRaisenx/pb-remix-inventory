// app/routes/app.inventory.tsx

import { json, type ActionFunctionArgs, type LoaderFunctionArgs } from "@remix-run/node";
import { useLoaderData, useFetcher, useNavigate } from "@remix-run/react";
import { Page, Card, DataTable, Text, BlockStack, Spinner, Button, Banner } from "@shopify/polaris";
import { authenticate } from "~/shopify.server";
import prisma from "~/db.server";
// Removed duplicate import of ShopifyProduct and ProductForTable, as ProductForTable is imported from app.products
import type { ProductForTable } from "./app.products"; // Correctly importing ProductForTable
import React, { useState, useCallback, useEffect } from "react";
import { ProductModal } from "../components/ProductModal";
import { calculateProductMetrics } from "~/services/product.service";
import { updateInventoryQuantityInShopifyAndDB } from "~/services/inventory.service";
import { INTENT } from "~/utils/intents";

interface InventoryActionResponse {
  success?: boolean;
  message?: string;
  error?: string;
  userErrors?: Array<{ field: string[] | null; message: string; }>;
  inventoryAdjustmentGroupId?: string;
}

// Represents a single row in the inventory display table
interface InventoryRecord {
  id: string; // Prisma Inventory record ID
  warehouseId: string; // Prisma Warehouse ID
  warehouseName: string;
  warehouseShopifyLocationGid: string | null;
  productId: string; // Prisma Product ID
  productTitle: string;
  quantity: number;
  productShopifyId: string; // Shopify Product GID
  variantShopifyId: string; // Shopify Variant GID for the specific variant being managed (if applicable)
  inventoryItemId: string | null; // Shopify InventoryItem GID
}

interface LoaderData {
  inventoryList: InventoryRecord[];
  warehouses: Array<{ id: string; name: string; shopifyLocationGid: string | null }>; // Passed to ProductModal
  lowStockThreshold: number | null; // Example, if needed for display
  error?: string;
}

export const action = async ({ request }: ActionFunctionArgs) => {
  const { session } = await authenticate.admin(request);
  const formData = await request.formData();
  const intent = formData.get("intent");

  if (intent === INTENT.UPDATE_INVENTORY) {
    const variantId = formData.get("variantId") as string; // This is Prisma Variant ID from ProductModal
    const newQuantity = parseInt(formData.get("newQuantity") as string, 10);
    const shopifyLocationGid = formData.get("shopifyLocationGid") as string;
    // const warehouseId = formData.get("warehouseId") as string; // Prisma Warehouse ID, if needed for DB update logic beyond Shopify

    if (!variantId || !shopifyLocationGid || isNaN(newQuantity) || newQuantity < 0) {
      return json({ error: "Invalid input: Variant ID, Shopify Location GID, and a non-negative quantity are required." }, { status: 400 });
    }

    const result = await updateInventoryQuantityInShopifyAndDB(
      session.shop,
      variantId, // Prisma Variant ID
      newQuantity,
      shopifyLocationGid
    );

    if (!result.success) {
      return json({ error: result.error, userErrors: result.userErrors }, { status: 400 });
    }

    // After successful Shopify update, recalculate product metrics
    const updatedVariant = await prisma.variant.findUnique({
      where: { id: variantId }, // Using Prisma Variant ID
      select: { productId: true }
    });

    if (updatedVariant?.productId) {
      const productToUpdate = await prisma.product.findUnique({
        where: { id: updatedVariant.productId },
        include: {
          variants: { select: { inventoryQuantity: true } }, // Select all variants for total inventory calc
          shop: { include: { NotificationSettings: true } }
        }
      });

      if (productToUpdate) {
        const notificationSetting = productToUpdate.shop.NotificationSettings?.[0];
        const lowStockThresholdUnits = notificationSetting?.lowStockThreshold ?? productToUpdate.shop.lowStockThreshold ?? 10;
        const criticalStockThresholdUnits = notificationSetting?.criticalStockThresholdUnits ?? Math.min(5, Math.floor(lowStockThresholdUnits * 0.3));
        const criticalStockoutDays = notificationSetting?.criticalStockoutDays ?? 3;
        const salesVelocityThresholdForTrending = notificationSetting?.salesVelocityThreshold ?? 50; // Example

        const shopSettingsForMetrics = { lowStockThresholdUnits, criticalStockThresholdUnits, criticalStockoutDays };
        // Ensure productWithVariantsForCalc has the correct structure for calculateProductMetrics
        const productWithVariantsForCalc = {
          ...productToUpdate,
          variants: productToUpdate.variants.map((v: { inventoryQuantity: number | null }) => ({ inventoryQuantity: v.inventoryQuantity || 0 })),
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
  return json({ error: "Invalid intent" }, { status: 400 });
};


export const loader = async ({ request }: LoaderFunctionArgs): Promise<Response> => {
  const { session } = await authenticate.admin(request);
  const shopDomain = session.shop;

  try {
    const shop = await prisma.shop.findUnique({ where: { shop: shopDomain } });
    if (!shop) {
      return json({ inventoryList: [], warehouses: [], error: "Shop not found." }, { status: 404 });
    }

    const [inventoryRecordsFromDB, warehousesFromDB] = await Promise.all([
      prisma.inventory.findMany({
        where: { warehouse: { shopId: shop.id } },
        include: {
          product: {
            select: {
              id: true, // Prisma Product ID
              title: true,
              shopifyId: true, // Shopify Product GID
              variants: { // Need at least one variant to get its Shopify ID and Inventory Item ID
                select: { id: true, shopifyId: true, inventoryItemId: true, sku: true, title: true, price: true, inventoryQuantity: true },
                orderBy: { createdAt: 'asc' }, // Get the "main" or first variant
                take: 1
              }
            }
          },
          warehouse: { select: { id: true, name: true, shopifyLocationGid: true } },
        },
        orderBy: [{ product: { title: 'asc' } }, { warehouse: { name: 'asc' } }]
      }),
      prisma.warehouse.findMany({ where: { shopId: shop.id }, select: { id: true, name: true, shopifyLocationGid: true } })
    ]);

    const inventoryList: InventoryRecord[] = inventoryRecordsFromDB.map(inv => ({
      id: inv.id, // Prisma Inventory ID
      warehouseId: inv.warehouse.id,
      warehouseName: inv.warehouse.name,
      warehouseShopifyLocationGid: inv.warehouse.shopifyLocationGid,
      productId: inv.product.id, // Prisma Product ID
      productTitle: inv.product.title,
      quantity: inv.quantity,
      productShopifyId: inv.product.shopifyId, // Shopify Product GID
      // Assuming the first variant is representative for the modal trigger.
      // The modal itself will handle multiple variants if the product has them.
      variantShopifyId: inv.product.variants?.[0]?.shopifyId ?? '', // Shopify Variant GID
      inventoryItemId: inv.product.variants?.[0]?.inventoryItemId ?? null, // Shopify Inventory Item GID
    }));

    return json({ inventoryList, warehouses: warehousesFromDB, lowStockThreshold: shop.lowStockThreshold });
  } catch (error) {
    console.error("Error fetching inventory:", error);
    return json({ inventoryList: [], warehouses: [], error: "Failed to fetch inventory." }, { status: 500 });
  }
};

// Helper to convert InventoryRecord to a shape ProductModal can use
// This is a simplified conversion. ProductModal expects a richer ProductForTable.
const inventoryRecordToProductForModal = (
  item: InventoryRecord,
  allProductVariants: ProductForTable['variantsForModal'], // Fetched separately or passed in
  productDetails: Partial<ProductForTable> // Other details like vendor, salesVelocity etc.
): ProductForTable => {
  return {
    id: item.productId, // Prisma Product ID
    shopifyId: item.productShopifyId,
    title: item.productTitle,
    vendor: productDetails.vendor || '', // Provide defaults
    price: productDetails.price || '',   // Provide defaults
    sku: productDetails.sku || (allProductVariants[0]?.sku ?? ''), // Provide defaults
    inventory: item.quantity, // This is specific to the warehouse location
    salesVelocity: productDetails.salesVelocity || null,
    stockoutDays: productDetails.stockoutDays || null,
    status: productDetails.status || 'Unknown',
    variantsForModal: allProductVariants, // All variants for this product
    // This inventoryByLocation should reflect the specific quantity for *this* warehouse location
    inventoryByLocation: {
      [item.warehouseId]: {
        quantity: item.quantity,
        shopifyLocationGid: item.warehouseShopifyLocationGid
      }
    },
    // If other locations' quantities are known, they can be added here too.
    // For now, it's focused on the current item's location.
  };
};


export default function InventoryPage() {
  const { inventoryList, warehouses, error } = useLoaderData<LoaderData>();
  const fetcher = useFetcher<InventoryActionResponse>();
  const navigate = useNavigate();

  const [isModalOpen, setIsModalOpen] = useState(false);
  const [selectedProductForModal, setSelectedProductForModal] = useState<ProductForTable | null>(null);

  // This callback needs to fetch full product details for the modal
  const handleOpenModal = useCallback(async (item: InventoryRecord) => {
    if (!item.warehouseShopifyLocationGid) {
      // Using alert for simplicity, consider a Polaris Banner or Toast
      alert("This warehouse is not linked to a Shopify Location. Inventory cannot be updated from here.");
      return;
    }
    if (!item.inventoryItemId && item.variantShopifyId) {
        alert(`The primary variant for ${item.productTitle} is missing its Shopify Inventory Item ID. Cannot update inventory.`);
        return;
    }


    // Fetch the full product details, including all its variants, to pass to the modal
    // This is a simplified fetch; you might have a dedicated endpoint or service function
    try {
      const productDetailsResponse = await fetch(`/app/products/${item.productId}/details`); // Example endpoint
      if (!productDetailsResponse.ok) throw new Error('Failed to fetch product details');
      const productData: ProductForTable = await productDetailsResponse.json();

      // Construct the ProductForTable object for the modal
      // Ensure inventoryByLocation includes the current item's specific quantity
      const productForModalData = {
        ...productData, // Spread all details from fetched product data
        inventoryByLocation: {
          ...productData.inventoryByLocation, // Keep existing known locations
          [item.warehouseId]: { // Override/set for the current warehouse row
            quantity: item.quantity,
            shopifyLocationGid: item.warehouseShopifyLocationGid
          }
        }
      };

      setSelectedProductForModal(productForModalData);
      setIsModalOpen(true);
    } catch (fetchError) {
      console.error("Failed to prepare product for modal:", fetchError);
      // Show error to user, e.g., using a Banner
      alert("Could not load product details for editing. Please try again.");
    }

  }, []);


  const handleCloseModal = useCallback(() => {
    setIsModalOpen(false);
    setSelectedProductForModal(null);
  }, []);

  useEffect(() => {
    if (fetcher.state === "idle" && fetcher.data?.success) {
      handleCloseModal();
      // Consider a more targeted way to update UI than full navigate/reload if possible
      navigate(".", { replace: true }); // Reloads data for the current page
    }
  }, [fetcher.state, fetcher.data, handleCloseModal, navigate]);


  if (error) {
    return (
      <Page title="Inventory Management">
        <Card><Banner title="Error" tone="critical">{error}</Banner></Card>
      </Page>
    );
  }

  const rows = inventoryList.map((item: InventoryRecord) => [ // Explicitly type item
    item.productTitle,
    item.warehouseName,
    item.quantity,
    <Button
      key={`action-${item.id}`}
      onClick={() => handleOpenModal(item)}
      variant="plain" // "plain" for less visual weight in a table
      accessibilityLabel={`Update quantity for ${item.productTitle} at ${item.warehouseName}`}
      // Disable if warehouse not linked or if primary variant has no inventory item ID
      disabled={!item.warehouseShopifyLocationGid || (!item.inventoryItemId && !!item.variantShopifyId)}
    >
      Update Quantity
    </Button>
  ]);

  return (
    <Page title="Inventory Management"
      subtitle="View and update inventory levels across your warehouse locations."
    >
      <BlockStack gap="400">
        {fetcher.state === "submitting" && <Spinner accessibilityLabel="Updating inventory..." />}
        {fetcher.data?.error && !fetcher.data.success && (
          <Banner tone="critical" onDismiss={() => fetcher.load(window.location.pathname) /* Clears fetcher data */ }>
            {fetcher.data.error}
            {fetcher.data.userErrors && (
              <ul>{fetcher.data.userErrors.map((e, idx) => <li key={idx}>{e.field?.join(".")}: {e.message}</li>)}</ul>
            )}
          </Banner>
        )}
         {fetcher.data?.success && (
          <Banner tone="success" onDismiss={() => fetcher.load(window.location.pathname)}>
            {fetcher.data.message}
          </Banner>
        )}

        <Card>
          <DataTable
            columnContentTypes={["text", "text", "numeric", "text"]}
            headings={["Product", "Warehouse", "Quantity", "Actions"]}
            rows={rows}
            footerContent={inventoryList.length > 0 ? `Showing ${inventoryList.length} inventory records` : undefined}
          />
          {inventoryList.length === 0 && fetcher.state === 'idle' && (
            <div style={{ padding: 'var(--p-space-400)', textAlign: 'center' }}>
              <Text as="p" tone="subdued">No inventory records found.</Text>
            </div>
          )}
        </Card>

        {isModalOpen && selectedProductForModal && (
          <ProductModal
            open={isModalOpen}
            onClose={handleCloseModal}
            product={selectedProductForModal} // Pass the fully prepared ProductForTable object
            warehouses={warehouses} // Pass the warehouses list
          />
        )}
      </BlockStack>
    </Page>
  );
}

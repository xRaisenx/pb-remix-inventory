// app/routes/app.inventory.tsx

import { json, type ActionFunctionArgs, type LoaderFunctionArgs } from "@remix-run/node";
import { useLoaderData, useFetcher, useNavigate } from "@remix-run/react";
import { Page, Card, DataTable, Text, BlockStack, Spinner, Button, Banner } from "@shopify/polaris";
import { authenticate } from "~/shopify.server";
import prisma from "~/db.server";
import type { ProductForTable } from "./app.products";
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

interface InventoryRecord {
  id: string;
  warehouseId: string;
  warehouseName: string;
  warehouseShopifyLocationGid: string | null;
  productId: string;
  productTitle: string;
  quantity: number;
  productShopifyId: string;
  variantShopifyId: string;
  inventoryItemId: string | null;
}

interface LoaderData {
  inventoryList: InventoryRecord[];
  warehouses: Array<{ id: string; name: string; shopifyLocationGid: string | null }>;
  lowStockThreshold: number | null;
  error?: string;
}

export const action = async ({ request }: ActionFunctionArgs) => {
  const { session } = await authenticate.admin(request);
  const formData = await request.formData();
  const intent = formData.get("intent");

  if (intent === INTENT.UPDATE_INVENTORY) {
    const variantId = formData.get("variantId") as string;
    const newQuantity = parseInt(formData.get("newQuantity") as string, 10);
    const shopifyLocationGid = formData.get("shopifyLocationGid") as string;

    if (!variantId || !shopifyLocationGid || isNaN(newQuantity) || newQuantity < 0) {
      return json({ error: "Invalid input: Variant ID, Shopify Location GID, and a non-negative quantity are required." }, { status: 400 });
    }

    const result = await updateInventoryQuantityInShopifyAndDB(
      session.shop,
      variantId,
      newQuantity,
      shopifyLocationGid
    );

    if (!result.success) {
      return json({ error: result.error, userErrors: result.userErrors }, { status: 400 });
    }

    const updatedVariant = await prisma.variant.findUnique({
      where: { id: variantId },
      select: { productId: true }
    });

    if (updatedVariant?.productId) {
      const productToUpdate = await prisma.product.findUnique({
        where: { id: updatedVariant.productId },
        include: {
          Variant: { select: { inventoryQuantity: true } },
          Shop: { include: { NotificationSettings: true } }
        }
      });

      if (productToUpdate) {
        const notificationSetting = productToUpdate.Shop.NotificationSettings?.[0];
        const lowStockThresholdUnits = notificationSetting?.lowStockThreshold ?? productToUpdate.Shop.lowStockThreshold ?? 10;
        const criticalStockThresholdUnits = notificationSetting?.criticalStockThresholdUnits ?? Math.min(5, Math.floor(lowStockThresholdUnits * 0.3));
        const criticalStockoutDays = notificationSetting?.criticalStockoutDays ?? 3;
        const salesVelocityThresholdForTrending = notificationSetting?.salesVelocityThreshold ?? 50;

        const shopSettingsForMetrics = { lowStockThresholdUnits, criticalStockThresholdUnits, criticalStockoutDays };
        const productWithVariantsForCalc = {
          ...productToUpdate,
          variants: productToUpdate.Variant.map((v: { inventoryQuantity: number | null }) => ({ inventoryQuantity: v.inventoryQuantity || 0 })),
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
    return json({ success: true, message: result.message, inventoryAdjustmentGroupId: (result as any).inventoryAdjustmentGroupId });
  }
  return json({ error: "Invalid intent" }, { status: 400 });
};

export const loader = async ({ request }: LoaderFunctionArgs): Promise<Response> => {
  const { session } = await authenticate.admin(request);
  const shopDomain = session.shop;

  try {
    let shop = await prisma.shop.findUnique({ where: { shop: shopDomain } });
    if (!shop) {
      shop = await prisma.shop.create({ data: { shop: shopDomain, updatedAt: new Date() } });
    }

    const [inventoryRecordsFromDB, warehousesFromDB] = await Promise.all([
      prisma.inventory.findMany({
        where: { Warehouse: { shopId: shop.id } },
        include: {
          Product: {
            select: {
              id: true,
              title: true,
              shopifyId: true,
              Variant: {
                select: { id: true, shopifyId: true, inventoryItemId: true, sku: true, title: true, price: true, inventoryQuantity: true },
                orderBy: { createdAt: 'asc' },
                take: 1
              }
            }
          },
          Warehouse: { select: { id: true, name: true, shopifyLocationGid: true } },
        },
        orderBy: [{ Product: { title: 'asc' } }, { Warehouse: { name: 'asc' } }]
      }),
      prisma.warehouse.findMany({ where: { shopId: shop.id }, select: { id: true, name: true, shopifyLocationGid: true } })
    ]);

    const inventoryList: InventoryRecord[] = inventoryRecordsFromDB.map(inv => ({
      id: inv.id,
      warehouseId: inv.Warehouse.id,
      warehouseName: inv.Warehouse.name,
      warehouseShopifyLocationGid: inv.Warehouse.shopifyLocationGid,
      productId: inv.Product.id,
      productTitle: inv.Product.title,
      quantity: inv.quantity,
      productShopifyId: inv.Product.shopifyId,
      variantShopifyId: inv.Product.Variant?.[0]?.shopifyId ?? '',
      inventoryItemId: inv.Product.Variant?.[0]?.inventoryItemId ?? null,
    }));

    return json({ inventoryList, warehouses: warehousesFromDB, lowStockThreshold: shop.lowStockThreshold });
  } catch (error) {
    console.error("Error fetching inventory:", error);
    return json({ inventoryList: [], warehouses: [], error: "Failed to fetch inventory." }, { status: 500 });
  }
};

export default function InventoryPage() {
  const { inventoryList, warehouses, error } = useLoaderData<LoaderData>();
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [selectedProductForModal, setSelectedProductForModal] = useState<ProductForTable | null>(null);
  const navigate = useNavigate(); // Keep navigate for useEffect
  const fetcher = useFetcher<InventoryActionResponse>(); // Keep fetcher for useEffect

  const handleOpenModal = useCallback(async (item: InventoryRecord) => {
    if (!item.warehouseShopifyLocationGid) {
      alert("This warehouse is not linked to a Shopify Location. Inventory cannot be updated from here.");
      return;
    }

    try {
      // Fetch the complete, ready-to-use product object from our corrected API route
      const response = await fetch(`/api/product-details/${item.productShopifyId}`);

      if (!response.ok) {
        let errorData;
        try {
          errorData = await response.json();
        } catch(e) {
          errorData = { error: await response.text() || 'Failed to fetch product details' };
        }
        throw new Error(errorData.error || 'Failed to fetch product details');
      }

      const apiResponse = await response.json(); // Assuming API returns { product: ProductForTable }
      const product: ProductForTable = apiResponse.product;

      if (!product) {
        throw new Error("Product details not found in API response.");
      }

      // The product from the API is assumed to be the complete ProductForTable.
      // We can ensure the specific item's quantity is accurately reflected if needed for the modal's initial state,
      // although the modal itself will manage quantities for specific variants/locations.
      // The API should ideally provide inventoryByLocation correctly.
      // If product.inventoryByLocation from API is the source of truth, this merge might be simplified or removed,
      // relying on ProductModal to correctly pick the quantity for the initially selected warehouse.
      const productForModal = {
        ...product,
        inventoryByLocation: { // Ensure this specific location's quantity from the list item is represented
          ...(product.inventoryByLocation || {}),
          [item.warehouseId]: {
            quantity: item.quantity,
            shopifyLocationGid: item.warehouseShopifyLocationGid,
          },
        },
      };

      setSelectedProductForModal(productForModal);
      setIsModalOpen(true);
    } catch (fetchError: any) {
      console.error("Failed to prepare product for modal:", fetchError);
      alert(`Could not load product details for editing: ${fetchError.message}`);
    }
  }, []);

  const handleCloseModal = useCallback(() => {
    setIsModalOpen(false);
    setSelectedProductForModal(null);
  }, []);

  useEffect(() => {
    if (fetcher.state === "idle" && fetcher.data?.success) {
      handleCloseModal();
      navigate(".", { replace: true });
    }
  }, [fetcher.state, fetcher.data, handleCloseModal, navigate]);

  if (error) {
    return (
      <Page title="Inventory Management">
        <Card><Banner title="Error" tone="critical">{error}</Banner></Card>
      </Page>
    );
  }

  const rows = inventoryList.map((item: InventoryRecord) => [
    item.productTitle,
    item.warehouseName,
    item.quantity,
    <Button
      key={`action-${item.id}`}
      onClick={() => handleOpenModal(item)}
      variant="plain"
      accessibilityLabel={`Update quantity for ${item.productTitle} at ${item.warehouseName}`}
      disabled={!item.warehouseShopifyLocationGid}
    >
      Update Quantity
    </Button>
  ]);

  return (
    <Page
      title="Inventory Management"
      subtitle="View and update inventory levels across your warehouse locations."
    >
      <BlockStack gap="400">
        {fetcher.state === "submitting" && <Spinner accessibilityLabel="Updating inventory..." />}
        {fetcher.data?.error && !fetcher.data.success && (
          <Banner tone="critical" onDismiss={() => fetcher.load(window.location.pathname) }>
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
            product={selectedProductForModal}
            warehouses={warehouses}
          />
        )}
      </BlockStack>
    </Page>
  );
}

// app/routes/app.products.tsx

import { json, type ActionFunctionArgs, type LoaderFunctionArgs } from "@remix-run/node";
import { useLoaderData, useNavigate, useSubmit } from "@remix-run/react"; // Added useSubmit
import { Page, Layout, BlockStack, Card, Text, TextField, Icon, Banner, IndexTable, type IndexTableProps } from "@shopify/polaris"; // Combined imports
// Import specific icon from polaris-icons
import { SearchMajor } from '@shopify/polaris-icons'; // Corrected Icon import
import { useState, useMemo, useCallback } from "react";
import { Prisma } from "@prisma/client";
import prisma from "~/db.server";
import { authenticate } from "~/shopify.server";
import { ProductModal } from "~/components/ProductModal";
import { CustomBadge } from "~/components/common/Badge"; // Import CustomBadge
import type { CustomStatus } from "~/components/common/Badge"; // Import CustomStatus type
import { calculateProductMetrics } from "~/services/product.service"; // Import calculateProductMetrics
import { updateInventoryQuantityInShopifyAndDB } from "~/services/inventory.service"; // Added import

// Define types for data structure
interface ProductVariantForModal {
  id: string; // Prisma Variant ID
  shopifyVariantId: string; // Shopify Variant GID
  title: string; // Variant title or SKU
  sku?: string | null;
  price?: string | null;
  inventoryQuantity?: number | null;
  inventoryItemId?: string | null; // Now in Prisma schema
}
export interface ProductForTable {
  id: string; // Prisma Product ID
  shopifyId: string;
  title: string;
  vendor: string;
  price: string; // Formatted price of the first variant
  sku: string; // SKU of the first variant
  inventory: number; // Total inventory
  salesVelocity: number | null; // From product.salesVelocityFloat
  stockoutDays: number | null; // From product.stockoutDays
  status: string | null; // From product.status
  variantsForModal: ProductVariantForModal[];
}

interface LoaderData {
  products: ProductForTable[];
  error?: string;
  shopDomain: string; // For product links
}

// Helper function to map Prisma Product.status to CustomBadge CustomStatus
const mapProductStatusToBadgeCustomStatus = (prismaStatus: string | null): CustomStatus => {
  if (!prismaStatus) return "default";
  switch (prismaStatus.toLowerCase()) {
    case "healthy": return "positive";
    case "low": return "warning";
    case "critical": return "critical";
    case "active": return "positive"; // Assuming 'active' is a healthy state
    default: return "default";
  }
};

export const loader = async ({ request }: LoaderFunctionArgs): Promise<Response> => {
  const { session, admin } = await authenticate.admin(request); // Get admin for potential image URLs
  const shopRecord = await prisma.shop.findUnique({ where: { shop: session.shop } });
  if (!shopRecord) throw new Response("Shop not found", { status: 404 });

  try {
    const productsFromDB = await prisma.product.findMany({
      where: { shopId: shopRecord.id },
      orderBy: { title: 'asc' },
      include: {
        variants: { // Ensure variants are included for inventory, price, SKU, and modal
          orderBy: { createdAt: 'asc' }, // Consistent variant ordering
        },
        // Include NotificationSettings to get thresholds for status calculation if needed here
        shop: { include: { NotificationSettings: true } }
      }
    });

    const productsForTable = productsFromDB.map(p => {
      const totalInventory = p.variants.reduce((sum, v) => sum + (v.inventoryQuantity || 0), 0);
      const firstVariant = p.variants?.[0];

      // Re-calculate status and stockoutDays here for display consistency with current settings
      // This might be redundant if product.service.ts keeps these fields perfectly updated,
      // but ensures the table reflects the current settings if they change.
      const notificationSetting = p.shop.NotificationSettings?.[0];
      const lowStockThresholdUnits = notificationSetting?.lowStockThreshold ?? p.shop.lowStockThreshold ?? 10;
      const criticalStockThresholdUnits = notificationSetting?.criticalStockThresholdUnits ?? Math.min(5, Math.floor(lowStockThresholdUnits * 0.3));
      const criticalStockoutDays = notificationSetting?.criticalStockoutDays ?? 3;

      const shopSettingsForMetrics = { lowStockThresholdUnits, criticalStockThresholdUnits, criticalStockoutDays };

      // Pass product with variants structure expected by calculateProductMetrics
      const productWithVariantsForCalc = {
        ...p, // Includes salesVelocityFloat, status, stockoutDays, trending from DB
        variants: p.variants.map(v => ({ inventoryQuantity: v.inventoryQuantity || 0})),
      };

      const calculatedMetrics = calculateProductMetrics(productWithVariantsForCalc, shopSettingsForMetrics);

      return {
        id: p.id,
        shopifyId: p.shopifyId,
        title: p.title,
        vendor: p.vendor,
        price: firstVariant?.price?.toString() ?? '0.00',
        sku: firstVariant?.sku ?? 'N/A',
        inventory: totalInventory,
        salesVelocity: p.salesVelocityFloat, // Use value from DB, updated by sync/cron
        stockoutDays: p.stockoutDays,     // Use value from DB, updated by sync/cron
        status: p.status, // Use value from DB, updated by sync/cron
        variantsForModal: p.variants.map(v => ({
          id: v.id,
          shopifyVariantId: v.shopifyId ?? '',
          title: v.title ?? v.sku ?? 'Variant', // Variant now has a title from user schema
          sku: v.sku,
          price: v.price?.toString(),
          inventoryQuantity: v.inventoryQuantity,
          inventoryItemId: v.inventoryItemId,
        })),
      };
    });
    return json({ products: productsForTable, shopDomain: session.shop } as LoaderData);
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Unknown error";
    console.error("Error fetching products for table:", message, error);
    return json({ products: [], error: `Failed to fetch products: ${message}`, shopDomain: session.shop } as LoaderData, { status: 500 });
  }
};

export const action = async ({ request }: ActionFunctionArgs): Promise<Response> => {
  const { session } = await authenticate.admin(request);
  const shopRecord = await prisma.shop.findUnique({ where: { shop: session.shop } });
  if (!shopRecord) throw new Response("Shop not found", { status: 404 });

  const formData = await request.formData();
  const intent = formData.get("intent");

  if (intent === 'updateInventory') {
    const variantId = formData.get("variantId") as string; // This is the Prisma Variant ID
    const newQuantityStr = formData.get("newQuantity") as string;

    if (!variantId || typeof variantId !== 'string' || variantId.trim() === "") {
      return json({ error: "Invalid or missing Variant ID." }, { status: 400 });
    }
    if (newQuantityStr === null || newQuantityStr.trim() === "") {
      return json({ error: "Missing new quantity." }, { status: 400 });
    }
    const newQuantity = parseInt(newQuantityStr, 10);
    if (isNaN(newQuantity) || newQuantity < 0) {
      return json({ error: "Invalid quantity: must be a non-negative integer." }, { status: 400 });
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
          userErrors: updateResult.userErrors
        }, { status: updateResult.userErrors ? 400 : 500 });
      }

      // If the service call was successful, proceed with product metrics recalculation.
      // The service already updated the local DB variant quantity.
      // We need the productId to recalculate product metrics.
      const updatedVariant = await prisma.variant.findUnique({
        where: { id: variantId },
        select: { productId: true }
      });

      if (!updatedVariant?.productId) {
        console.error(`Product ID not found for variant ${variantId} after successful inventory update.`);
        return json({
          success: true,
          message: updateResult.message || "Inventory updated, but could not re-calculate product metrics (product ID missing).",
          inventoryAdjustmentGroupId: updateResult.inventoryAdjustmentGroupId
        });
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
        });
      }

      // The service was successful.
      return json({
        success: true,
        message: updateResult.message || "Inventory updated successfully and product metrics recalculated.",
        inventoryAdjustmentGroupId: updateResult.inventoryAdjustmentGroupId
      });

    } catch (e: unknown) {
      // This catch block now primarily catches errors from the product metrics recalculation
      // or unexpected errors from the service call that weren't handled by its try/catch.
      console.error("Failed to update inventory or recalculate metrics:", e);
      if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2025') {
        // This might occur if the product/variant was deleted between the service call and metrics recalculation
        return json({ error: "Data inconsistency: Record not found during metrics recalculation." }, { status: 404 });
      }
      const message = e instanceof Error ? e.message : "Failed to update inventory or recalculate metrics due to a server error.";
      return json({ error: message }, { status: 500 });
    }
  }
  return json({ error: "Invalid intent." }, { status: 400 });
};

export default function AppProductsPage() {
  const { products, error, shopDomain } = useLoaderData<typeof loader>();
  const [selectedProduct, setSelectedProduct] = useState<ProductForTable | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  // Sort state from user's example - good addition
  const [sortColumn, setSortColumn] = useState<keyof ProductForTable | null>('title'); // Use keyof ProductForTable
  const [sortDirection, setSortDirection] = useState<'ascending' | 'descending'>('ascending');

  const navigate = useNavigate(); // For opening product in Shopify admin

  const handleSearchChange = useCallback((value: string) => setSearchTerm(value), []);

  const filteredAndSortedProducts = useMemo(() => {
    let result = products;
    if (searchTerm) {
      result = result.filter(p =>
        p.title.toLowerCase().includes(searchTerm.toLowerCase()) ||
        p.vendor.toLowerCase().includes(searchTerm.toLowerCase()) ||
        p.sku.toLowerCase().includes(searchTerm.toLowerCase())
      );
    }
    if (sortColumn) {
      result.sort((a, b) => {
        const aValue = a[sortColumn];
        const bValue = b[sortColumn];
        let comparison = 0;

        // Handle null/undefined for numeric/string comparisons
        const aIsNull = aValue === null || aValue === undefined;
        const bIsNull = bValue === null || bValue === undefined;

        if (aIsNull && bIsNull) comparison = 0;
        else if (aIsNull) comparison = -1; // Nulls come first in ascending
        else if (bIsNull) comparison = 1;  // Nulls come first in ascending
        else if (typeof aValue === 'number' && typeof bValue === 'number') {
          comparison = aValue - bValue;
        } else if (typeof aValue === 'string' && typeof bValue === 'string') {
          comparison = aValue.localeCompare(bValue);
        } else {
            // Fallback for other types or mixed types, treat as strings
             comparison = String(aValue).localeCompare(String(bValue));
        }


        return sortDirection === 'ascending' ? comparison : -comparison;
      });
    }
    return result;
  }, [products, searchTerm, sortColumn, sortDirection]);

  const resourceName = { singular: 'product', plural: 'products' };

  const handleSort = useCallback(
    (headingIndex: number, direction: 'ascending' | 'descending') => {
      // Map heading index back to sortable column key
      const columns: (keyof ProductForTable)[] =
        ['title', 'vendor', 'sku', 'price', 'inventory', 'salesVelocity', 'stockoutDays', 'status'];
      setSortColumn(columns[headingIndex]);
      setSortDirection(direction);
    },
    [],
  );

  const headings: IndexTableProps['headings'] = [
    { title: 'Product', id: 'title', sortable: true },
    { title: 'Vendor', id: 'vendor', sortable: true },
    { title: 'SKU', id: 'sku', sortable: true},
    { title: 'Price', id: 'price', numeric: true, sortable: true },
    { title: 'Inventory', id: 'inventory', numeric: true, sortable: true },
    { title: 'Sales Velocity (day)', id: 'salesVelocity', numeric: true, sortable: true },
    { title: 'Stockout (days)', id: 'stockoutDays', numeric: true, sortable: true },
    { title: 'Status', id: 'status', sortable: true },
  ];

  const rowMarkup = filteredAndSortedProducts.map(
    (product, index) => (
      <IndexTable.Row
        id={product.id}
        key={product.id}
        position={index}
        onNavigation={() => setSelectedProduct(product)} // Open modal on row click
      >
        <IndexTable.Cell>
          <Text variant="bodyMd" fontWeight="bold" as="span">
            {product.title}
          </Text>
        </IndexTable.Cell>
        <IndexTable.Cell>{product.vendor}</IndexTable.Cell>
        <IndexTable.Cell>{product.sku}</IndexTable.Cell>
        <IndexTable.Cell>
          <Text as="span" numeric>${product.price}</Text>
        </IndexTable.Cell>
        <IndexTable.Cell>
          <Text as="span" numeric>{product.inventory}</Text>
        </IndexTable.Cell>
        <IndexTable.Cell>
          <Text as="span" numeric>{product.salesVelocity?.toFixed(2) ?? 'N/A'}</Text>
        </IndexTable.Cell>
        <IndexTable.Cell>
          <Text as="span" numeric>{product.stockoutDays?.toFixed(0) ?? 'N/A'}</Text>
        </IndexTable.Cell>
        <IndexTable.Cell>
          <CustomBadge customStatus={mapProductStatusToBadgeCustomStatus(product.status)}>
            {product.status || 'N/A'}
          </CustomBadge>
        </IndexTable.Cell>
      </IndexTable.Row>
    ),
  );

  if (error) {
    return (
      <Page title="Products">
        <Banner title="Error loading products" tone="critical">
          <p>{error}</p>
        </Banner>
      </Page>
    );
  }

  return (
    <Page
      title="Products"
      // primaryAction={{ content: 'Sync Products', onAction: () => console.log('Sync clicked') }} // Sync can be a separate feature
    >
      <BlockStack gap="400">
        <TextField
          label="Filter products"
          labelHidden
          value={searchTerm}
          onChange={handleSearchChange}
          prefix={<Icon source={SearchMajor} />} // Corrected Icon usage
          placeholder="Search by product title, vendor, or SKU"
          autoComplete="off"
        />
        <Card>
          <IndexTable
            resourceName={resourceName}
            itemCount={filteredAndSortedProducts.length}
            headings={headings}
            selectable={false} // Keep as false unless selection is implemented
            sortable={[true, true, true, true, true, true, true, true]} // All columns sortable
            onSort={handleSort}
            sortColumnIndex={sortColumn ? headings.findIndex(h => h.id === sortColumn) : undefined}
            sortDirection={sortDirection}
          >
            {rowMarkup}
          </IndexTable>
          {filteredAndSortedProducts.length === 0 && (
             <div style={{padding: 'var(--p-space-400)', textAlign: 'center'}}> {/* Use Polaris token */}
                <Text as="p" tone="subdued">No products found matching your criteria.</Text>
            </div>
          )}
        </Card>
      </BlockStack>
      {selectedProduct && (
        <ProductModal
          open={!!selectedProduct}
          onClose={() => setSelectedProduct(null)}
          product={selectedProduct} // selectedProduct is ProductForTable
          // shopDomain={shopDomain} // shopDomain is not used by ProductModal
        />
      )}
    </Page>
  );
}
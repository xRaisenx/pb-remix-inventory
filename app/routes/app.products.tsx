// app/routes/app.products.tsx

import { json, type ActionFunctionArgs, type LoaderFunctionArgs } from "@remix-run/node";
import { useLoaderData, useNavigate, useSubmit, Link as RemixLink } from "@remix-run/react"; // Added useSubmit and RemixLink
import { Page, Layout, BlockStack, Card, Text, TextField, Icon, Banner, IndexTable, type IndexTableProps, Pagination } from "@shopify/polaris"; // Combined imports, Added Pagination
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
import { INTENT } from "~/utils/intents";

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
  inventoryByLocation: Record<string, { quantity: number; shopifyLocationGid: string | null }>; // Maps Prisma warehouseId to quantity and GID
}

interface LoaderData {
  products: ProductForTable[];
  warehouses: Array<{ id: string; name: string; shopifyLocationGid: string | null }>;
  error?: string;
  shopDomain: string; // For product links
  pageInfo: {
    currentPage: number;
    totalPages: number;
    totalResults: number;
    nextPageUrl?: string;
    prevPageUrl?: string;
  };
}

const PRODUCTS_PER_PAGE = 25;

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

  const url = new URL(request.url);
  const page = parseInt(url.searchParams.get("page") || "1", 10);
  const skip = (page - 1) * PRODUCTS_PER_PAGE;

  try {
    const [productsFromDB, totalProducts, allWarehouses] = await prisma.$transaction([
      prisma.product.findMany({
        where: { shopId: shopRecord.id },
        orderBy: { title: 'asc' },
        include: {
          variants: { // Ensure variants are included for inventory, price, SKU, and modal
            orderBy: { createdAt: 'asc' }, // Consistent variant ordering
          },
          inventory: { // For inventoryByLocation map
            select: {
              quantity: true,
              warehouseId: true,
              warehouse: { select: { name: true, shopifyLocationGid: true } }
            }
          },
          shop: { include: { NotificationSettings: true } } // For metric calculations
        },
        take: PRODUCTS_PER_PAGE,
        skip: skip,
      }),
      prisma.product.count({ where: { shopId: shopRecord.id } }),
      prisma.warehouse.findMany({ where: { shopId: shopRecord.id } }),
    ]);

    const productsForTable = productsFromDB.map(p => {
      // Calculate total inventory from the product's inventory records if available,
      // otherwise sum up variant quantities as a fallback.
      // The schema has product.inventory which is product-location based, and variant.inventoryQuantity which is total for variant.
      // For product total inventory, summing p.inventory is more accurate if it's kept up-to-date.
      const totalInventory = p.inventory.reduce((sum, inv) => sum + inv.quantity, 0);
      const firstVariant = p.variants?.[0];

      const inventoryByLocation = p.inventory.reduce((acc, inv) => {
        acc[inv.warehouseId] = {
          quantity: inv.quantity,
          shopifyLocationGid: inv.warehouse.shopifyLocationGid,
          // warehouseName: inv.warehouse.name // warehouseName could be added to ProductForTable if needed directly
        };
        return acc;
      }, {} as ProductForTable['inventoryByLocation']);

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
          title: v.title ?? v.sku ?? 'Variant',
          sku: v.sku,
          price: v.price?.toString(),
          inventoryQuantity: v.inventoryQuantity, // This is the total for the variant
          inventoryItemId: v.inventoryItemId,
        })),
        inventoryByLocation: inventoryByLocation, // Add the map here
      };
    });

    const totalPages = Math.ceil(totalProducts / PRODUCTS_PER_PAGE);
    const pageInfo = {
      currentPage: page,
      totalPages: totalPages,
      totalResults: totalProducts,
      nextPageUrl: page < totalPages ? `/app/products?page=${page + 1}` : undefined,
      prevPageUrl: page > 1 ? `/app/products?page=${page - 1}` : undefined,
    };

    const warehousesForModal = allWarehouses.map(w => ({
      id: w.id,
      name: w.name,
      shopifyLocationGid: w.shopifyLocationGid
    }));

    return json({ products: productsForTable, warehouses: warehousesForModal, pageInfo, shopDomain: session.shop } as LoaderData);
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Unknown error";
    console.error("Error fetching products for table:", message, error);
    const defaultPageInfo = { currentPage: 1, totalPages: 0, totalResults: 0 };
    return json({ products: [], warehouses: [], error: `Failed to fetch products: ${message}`, pageInfo: defaultPageInfo, shopDomain: session.shop } as LoaderData, { status: 500 });
  }
};

export const action = async ({ request }: ActionFunctionArgs): Promise<Response> => {
  const { session } = await authenticate.admin(request);
  const shopRecord = await prisma.shop.findUnique({ where: { shop: session.shop } });
  if (!shopRecord) throw new Response("Shop not found", { status: 404 });

  const formData = await request.formData();
  const intent = formData.get("intent");

  if (intent === INTENT.UPDATE_INVENTORY) {
    const variantId = formData.get("variantId") as string;
    const newQuantityStr = formData.get("newQuantity") as string;
    // const warehouseId = formData.get("warehouseId") as string; // Prisma Warehouse ID, useful for local logging if needed
    const shopifyLocationGid = formData.get("shopifyLocationGid") as string;

    let errorMessages: Record<string, string> = {};
    if (!variantId || typeof variantId !== 'string' || variantId.trim() === "") {
      errorMessages.variantId = "Invalid or missing Variant ID.";
    }
    if (newQuantityStr === null || newQuantityStr.trim() === "") {
      errorMessages.newQuantity = "Missing new quantity.";
    }
    if (!shopifyLocationGid || typeof shopifyLocationGid !== 'string' || !shopifyLocationGid.startsWith("gid://shopify/Location/")) {
      errorMessages.shopifyLocationGid = "Invalid or missing Shopify Location GID.";
    }

    const newQuantity = parseInt(newQuantityStr, 10);
    if (isNaN(newQuantity) || newQuantity < 0) {
      errorMessages.newQuantity = (errorMessages.newQuantity ? errorMessages.newQuantity + " " : "") + "Quantity must be a non-negative integer.";
    }

    if (Object.keys(errorMessages).length > 0) {
      return json({ errors: errorMessages, error: "Validation failed." }, { status: 400 });
    }

    try {
      const updateResult = await updateInventoryQuantityInShopifyAndDB(
        session.shop,
        variantId!, // Already validated not null/empty
        newQuantity, // Already validated
        shopifyLocationGid! // Already validated not null/empty
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
          message: updateResult.message || "Inventory updated successfully in Shopify and local database, and product metrics recalculated.",
          inventoryAdjustmentGroupId: updateResult.inventoryAdjustmentGroupId
        });
      } // This 'else' was for 'if (productToUpdate)'. If not, we fall through to the generic success.

      // This return is reached if productToUpdate was null (e.g. variant existed but product was somehow gone)
      // or if the specific logic block for productToUpdate didn't have its own return.
      return json({
        success: true,
        message: updateResult.message || "Inventory updated successfully. Metrics recalculation might have been skipped if product data was inconsistent.",
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
  const { products, error, shopDomain, pageInfo } = useLoaderData<typeof loader>();
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
+          {pageInfo.totalPages > 1 && (
+            <BlockStack distribution="center">
+              <Pagination
+                hasPrevious={!!pageInfo.prevPageUrl}
+                onPrevious={() => navigate(pageInfo.prevPageUrl!)}
+                hasNext={!!pageInfo.nextPageUrl}
+                onNext={() => navigate(pageInfo.nextPageUrl!)}
+                label={`${pageInfo.currentPage} of ${pageInfo.totalPages}`}
+              />
+            </BlockStack>
+          )}
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
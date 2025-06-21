// app/routes/app.products.tsx

import { json, type ActionFunctionArgs, type LoaderFunctionArgs } from "@remix-run/node";
import { useLoaderData, useNavigate } from "@remix-run/react"; // Removed useFetcher as it's not used in the final component code provided by user
import { Page, BlockStack, Card, Text, TextField, Icon, Banner, IndexTable, type IndexTableProps, Pagination } from "@shopify/polaris";
import { SearchIcon } from '@shopify/polaris-icons'; // Corrected icon import
import { useState, useMemo, useCallback } from "react";
import prisma from "~/db.server";
import { authenticate } from "~/shopify.server";
import { ProductModal } from "~/components/ProductModal";
import { CustomBadge, type CustomStatus } from "~/components/common/Badge"; // CustomStatus is now exported
import { calculateProductMetrics } from "~/services/product.service";
import { updateInventoryQuantityInShopifyAndDB } from "~/services/inventory.service";
import { INTENT } from "~/utils/intents";

// --- TYPE DEFINITIONS ---
// This variant type is specific for the modal's needs.
interface ProductVariantForModal {
  id: string; // Prisma Variant ID
  shopifyVariantId: string; // Shopify Variant GID
  title: string; // Variant title (e.g., "Small", "Red") or product title if no specific variant title
  sku?: string | null;
  price?: string | null; // Should be string for display, Prisma Decimal needs conversion
  inventoryQuantity?: number | null; // Total inventory for this variant across all locations
  inventoryItemId?: string | null; // Shopify InventoryItem GID
}

// This is the main type for products displayed in the table and passed to the modal
export interface ProductForTable {
  id: string; // Prisma Product ID
  shopifyId: string; // Shopify Product GID
  title: string;
  vendor: string;
  price: string; // Typically price of the first/primary variant, as string
  sku: string;   // Typically SKU of the first/primary variant
  inventory: number; // Total inventory for the product across all variants/locations shown in this row
  salesVelocity: number | null;
  stockoutDays: number | null;
  status: string | null; // From Prisma: 'Healthy', 'Low', 'Critical', 'Unknown'
  variantsForModal: ProductVariantForModal[]; // All variants of this product for the modal
  // Inventory by specific warehouse location (Prisma warehouse ID -> quantity and Shopify Location GID)
  inventoryByLocation: Record<string, { quantity: number; shopifyLocationGid: string | null }>;
}

interface LoaderData {
  products: ProductForTable[];
  warehouses: Array<{ id: string; name: string; shopifyLocationGid: string | null }>; // For ProductModal
  error?: string;
  shopDomain: string; // For constructing Shopify admin links if needed
  pageInfo: {
    currentPage: number;
    totalPages: number;
    totalResults: number;
    nextPageUrl?: string;
    prevPageUrl?: string;
  };
}

const PRODUCTS_PER_PAGE = 25;

// Helper to map Prisma product status to a badge status
const mapProductStatusToBadgeCustomStatus = (prismaStatus: string | null): CustomStatus => {
  if (!prismaStatus) return "default";
  switch (prismaStatus.toLowerCase()) {
    case "healthy": return "positive";
    case "low": return "warning";
    case "critical": return "critical";
    default: return "default"; // Or 'info' or some other default
  }
};

// --- LOADER ---
export const loader = async ({ request }: LoaderFunctionArgs): Promise<Response> => {
  const { session } = await authenticate.admin(request);
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
          variants: { // Fetch all variants for the modal and for inventory calculation
            orderBy: { createdAt: 'asc' }, // Consistent ordering
            select: {
              id: true, shopifyId: true, title: true, sku: true, price: true, inventoryQuantity: true, inventoryItemId: true,
            }
          },
          inventory: { // For inventoryByLocation
            select: { quantity: true, warehouseId: true, warehouse: { select: { shopifyLocationGid: true } } }
          },
          // shop: { include: { NotificationSettings: true } }, // Not strictly needed for display but for metrics if calculated here
        },
        take: PRODUCTS_PER_PAGE,
        skip: skip,
      }),
      prisma.product.count({ where: { shopId: shopRecord.id } }),
      prisma.warehouse.findMany({
        where: { shopId: shopRecord.id },
        select: { id: true, name: true, shopifyLocationGid: true }
      }),
    ]);

    const productsForTable = productsFromDB.map((p): ProductForTable => { // Explicit return type
      // Calculate total inventory for the product (sum of all its variants' quantities or sum of inventory records)
      // The example uses p.inventory which is Inventory[] related to Product.
      // This assumes Inventory model has a direct relation to Product and holds location-specific stock.
      const totalInventory = p.inventory.reduce((sum: number, inv: { quantity: number }) => sum + inv.quantity, 0);
      const firstVariant = p.variants?.[0]; // For primary display fields like SKU/Price

      const inventoryByLocation = p.inventory.reduce((acc: ProductForTable['inventoryByLocation'], inv) => {
        acc[inv.warehouseId] = { quantity: inv.quantity, shopifyLocationGid: inv.warehouse.shopifyLocationGid };
        return acc;
      }, {} as ProductForTable['inventoryByLocation']);

      return {
        id: p.id,
        shopifyId: p.shopifyId,
        title: p.title,
        vendor: p.vendor,
        price: firstVariant?.price?.toString() ?? '0.00', // Ensure price is string
        sku: firstVariant?.sku ?? 'N/A',
        inventory: totalInventory, // This is the sum from p.inventory records
        salesVelocity: p.salesVelocityFloat, // Assuming salesVelocityFloat is on Product model
        stockoutDays: p.stockoutDays,     // Assuming stockoutDays is on Product model
        status: p.status,                 // Assuming status is on Product model
        variantsForModal: p.variants.map(v => ({ // Map Prisma variants to modal structure
          id: v.id,
          shopifyVariantId: v.shopifyId ?? '', // Ensure not null
          title: v.title ?? v.sku ?? 'Variant', // Fallback for variant title
          sku: v.sku,
          price: v.price?.toString(),
          inventoryQuantity: v.inventoryQuantity,
          inventoryItemId: v.inventoryItemId,
        })),
        inventoryByLocation: inventoryByLocation,
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

    return json({ products: productsForTable, warehouses: allWarehouses, pageInfo, shopDomain: session.shop });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Unknown error";
    console.error("Error fetching products for table:", message, error);
    const defaultPageInfo = { currentPage: 1, totalPages: 0, totalResults: 0 };
    return json({ products: [], warehouses: [], error: `Failed to fetch products: ${message}`, pageInfo: defaultPageInfo, shopDomain: session.shop }, { status: 500 });
  }
};

// --- ACTION ---
export const action = async ({ request }: ActionFunctionArgs) => {
  const { session } = await authenticate.admin(request);
  const formData = await request.formData();
  const intent = formData.get("intent");

  if (intent === INTENT.UPDATE_INVENTORY) {
    const variantId = formData.get("variantId") as string; // This is Prisma Variant ID
    const newQuantityStr = formData.get("newQuantity") as string;
    const shopifyLocationGid = formData.get("shopifyLocationGid") as string; // Shopify Location GID

    const newQuantity = parseInt(newQuantityStr, 10);
    if (!variantId || !shopifyLocationGid || isNaN(newQuantity) || newQuantity < 0) {
      return json({ error: "Invalid form data submitted. Variant ID, Location GID, and valid quantity are required." }, { status: 400 });
    }

    try {
      // Service function expects Prisma Variant ID
      const updateResult = await updateInventoryQuantityInShopifyAndDB(session.shop, variantId, newQuantity, shopifyLocationGid);

      if (!updateResult.success) {
        return json({ error: updateResult.error, userErrors: updateResult.userErrors }, { status: 400 });
      }

      // After successful Shopify update, find the parent product and recalculate its metrics
      const updatedVariant = await prisma.variant.findUnique({
        where: { id: variantId }, // Prisma Variant ID
        select: { productId: true }
      });

      if (updatedVariant?.productId) {
        const productToUpdate = await prisma.product.findUnique({
          where: { id: updatedVariant.productId },
          include: {
            variants: { select: { inventoryQuantity: true } }, // For recalculating total inventory
            shop: { include: { NotificationSettings: true } } // For thresholds
          }
        });

        if (productToUpdate) {
          const notificationSetting = productToUpdate.shop.NotificationSettings?.[0];
          const lowStockThresholdUnits = notificationSetting?.lowStockThreshold ?? productToUpdate.shop.lowStockThreshold ?? 10;
          const criticalStockThresholdUnits = notificationSetting?.criticalStockThresholdUnits ?? Math.min(5, Math.floor(lowStockThresholdUnits * 0.3));
          const criticalStockoutDays = notificationSetting?.criticalStockoutDays ?? 3;
          const salesVelocityThresholdForTrending = notificationSetting?.salesVelocityThreshold ?? 50; // Example

          const shopSettingsForMetrics = { lowStockThresholdUnits, criticalStockThresholdUnits, criticalStockoutDays };
          // Prepare product data for calculateProductMetrics
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
      return json({ success: true, message: updateResult.message }); // Return success from action
    } catch (e: unknown) {
      const message = e instanceof Error ? e.message : "Failed to update inventory or recalculate metrics.";
      console.error(message, e);
      return json({ error: message }, { status: 500 });
    }
  }

  return json({ error: "Invalid intent" }, { status: 400 });
};


// --- COMPONENT ---
export default function AppProductsPage() {
  const { products, warehouses, error, pageInfo } = useLoaderData<LoaderData>();
  const [selectedProduct, setSelectedProduct] = useState<ProductForTable | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [sortColumn, setSortColumn] = useState<keyof ProductForTable | null>('title'); // Default sort
  const [sortDirection, setSortDirection] = useState<'ascending' | 'descending'>('ascending');
  const navigate = useNavigate();

  const handleSearchChange = useCallback((value: string) => setSearchTerm(value), []);

  const filteredAndSortedProducts = useMemo(() => {
    let result = products.filter(p =>
      p.title.toLowerCase().includes(searchTerm.toLowerCase()) ||
      p.vendor.toLowerCase().includes(searchTerm.toLowerCase()) ||
      p.sku.toLowerCase().includes(searchTerm.toLowerCase())
    );
    if (sortColumn) {
      result.sort((a, b) => {
        const aValue = a[sortColumn];
        const bValue = b[sortColumn];
        let comparison = 0;

        // Handle null or undefined values by pushing them to the end or beginning
        if (aValue === null || aValue === undefined) comparison = 1; // a is greater (comes after)
        else if (bValue === null || bValue === undefined) comparison = -1; // b is greater
        else if (typeof aValue === 'number' && typeof bValue === 'number') {
          comparison = aValue - bValue;
        } else {
          comparison = String(aValue).localeCompare(String(bValue));
        }
        return sortDirection === 'ascending' ? comparison : -comparison;
      });
    }
    return result;
  }, [products, searchTerm, sortColumn, sortDirection]);

  const handleSort = useCallback((index: number, direction: 'ascending' | 'descending') => {
    // Ensure this mapping is correct and matches your headings
    const columns: (keyof ProductForTable)[] = ['title', 'vendor', 'sku', 'price', 'inventory', 'salesVelocity', 'stockoutDays', 'status'];
    setSortColumn(columns[index]);
    setSortDirection(direction);
  }, []);

  // Removed 'numeric' prop from headings as it's not a valid IndexTable.Heading property
  const headings: IndexTableProps['headings'] = [
    { title: 'Product', id: 'title' }, { title: 'Vendor', id: 'vendor' }, { title: 'SKU', id: 'sku' },
    { title: 'Price', id: 'price' }, { title: 'Inventory', id: 'inventory' },
    { title: 'Sales Velocity (day)', id: 'salesVelocity' }, { title: 'Stockout (days)', id: 'stockoutDays' },
    { title: 'Status', id: 'status' },
  ];

  const rowMarkup = filteredAndSortedProducts.map((product: ProductForTable, index: number) => ( // Added explicit type for product
    <IndexTable.Row id={product.id} key={product.id} position={index} onNavigation={() => setSelectedProduct(product)}>
      <IndexTable.Cell><Text variant="bodyMd" fontWeight="bold" as="span">{product.title}</Text></IndexTable.Cell>
      <IndexTable.Cell>{product.vendor}</IndexTable.Cell>
      <IndexTable.Cell>{product.sku}</IndexTable.Cell>
      <IndexTable.Cell><Text as="span" numeric>${product.price}</Text></IndexTable.Cell>
      <IndexTable.Cell><Text as="span" numeric>{product.inventory}</Text></IndexTable.Cell>
      <IndexTable.Cell><Text as="span" numeric>{product.salesVelocity?.toFixed(2) ?? 'N/A'}</Text></IndexTable.Cell>
      <IndexTable.Cell><Text as="span" numeric>{product.stockoutDays?.toFixed(0) ?? 'N/A'}</Text></IndexTable.Cell>
      <IndexTable.Cell><CustomBadge customStatus={mapProductStatusToBadgeCustomStatus(product.status)}>{product.status || 'N/A'}</CustomBadge></IndexTable.Cell>
    </IndexTable.Row>
  ));

  if (error) {
    return <Page title="Products"><Banner title="Error" tone="critical"><p>{error}</p></Banner></Page>;
  }

  return (
    <Page title="Products" fullWidth>
      <BlockStack gap="400">
        <TextField label="Filter products" labelHidden value={searchTerm} onChange={handleSearchChange} prefix={<Icon source={SearchIcon} />} placeholder="Search by product title, vendor, or SKU" autoComplete="off" />
        <Card>
          <IndexTable
            resourceName={{ singular: 'product', plural: 'products' }}
            itemCount={filteredAndSortedProducts.length}
            headings={headings}
            selectable={false} // As per user's code
            sortable={[true, true, true, true, true, true, true, true]} // Matches number of headings
            onSort={handleSort as IndexTableProps['onSort']} // Cast to satisfy Polaris type, ensure handleSort matches expected signature
            sortColumnIndex={sortColumn ? headings.findIndex(h => h.id === sortColumn) : undefined}
            sortDirection={sortDirection}
          >
            {rowMarkup}
          </IndexTable>
          {filteredAndSortedProducts.length === 0 && (<div style={{ padding: 'var(--p-space-400)', textAlign: 'center' }}><Text as="p" tone="subdued">No products found.</Text></div>)}
          {pageInfo.totalPages > 1 && (
            <div style={{ padding: 'var(--p-space-400)', display: 'flex', justifyContent: 'center' }}>
              <Pagination
                hasPrevious={!!pageInfo.prevPageUrl}
                onPrevious={() => navigate(pageInfo.prevPageUrl!)} // Ensure URL is not undefined
                hasNext={!!pageInfo.nextPageUrl}
                onNext={() => navigate(pageInfo.nextPageUrl!)}     // Ensure URL is not undefined
                label={`Page ${pageInfo.currentPage} of ${pageInfo.totalPages}`}
              />
            </div>
          )}
        </Card>
      </BlockStack>
      {selectedProduct && (
        <ProductModal
          open={!!selectedProduct}
          onClose={() => setSelectedProduct(null)}
          product={selectedProduct}
          warehouses={warehouses} // Pass warehouses to the modal
        />
      )}
    </Page>
  );
}
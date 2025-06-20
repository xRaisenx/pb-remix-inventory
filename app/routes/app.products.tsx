// app/routes/app.products.tsx

import { json, type ActionFunctionArgs, type LoaderFunctionArgs } from "@remix-run/node";
import { useLoaderData, useNavigate, useSubmit } from "@remix-run/react"; // Added useSubmit
import { Page, Layout, BlockStack, Card, Text, TextField, Icon, Banner, IndexTable, type IndexTableProps } from "@shopify/polaris"; // Combined imports
import { SearchIcon } from '@shopify/polaris-icons'; // Corrected Icon import
import { useState, useMemo, useCallback } from "react";
import { Prisma } from "@prisma/client";
import prisma from "~/db.server";
import { authenticate } from "~/shopify.server";
import { ProductModal } from "~/components/ProductModal";
import { CustomBadge } from "~/components/common/Badge"; // Import CustomBadge
import type { CustomStatus } from "~/components/common/Badge"; // Import CustomStatus type

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
    case "active": return "positive";
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
        }
      }
    });

    const productsForTable = productsFromDB.map(p => {
      const totalInventory = p.variants.reduce((sum, v) => sum + (v.inventoryQuantity || 0), 0);
      const firstVariant = p.variants?.[0];

      return {
        id: p.id,
        shopifyId: p.shopifyId,
        title: p.title,
        vendor: p.vendor,
        price: firstVariant?.price?.toString() ?? '0.00',
        sku: firstVariant?.sku ?? 'N/A',
        inventory: totalInventory,
        salesVelocity: p.salesVelocityFloat, // Already a number or null
        stockoutDays: p.stockoutDays,     // Already a number or null
        status: p.status, // Direct from schema
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
    const variantId = formData.get("variantId") as string;
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
      const updatedVariant = await prisma.variant.update({
        where: { id: variantId }, // Assuming Prisma Variant ID is used
        data: { inventoryQuantity: newQuantity },
      });

      if (updatedVariant && updatedVariant.productId) {
        const productToUpdate = await prisma.product.findUnique({
          where: { id: updatedVariant.productId },
          include: { variants: { select: { inventoryQuantity: true, price: true, sku: true, id: true, shopifyId: true, title: true, inventoryItemId: true } } } // Ensure all needed fields for ProductWithVariants + salesVelocityFloat
        });

        if (productToUpdate) {
          // product.service.ts is now more critical with the schema changes.
          // Assuming calculateProductMetrics and updateAllProductMetricsForShop are adapted or this logic is brought here.
          // For now, we'll assume a simplified update or that product.service.ts will be reviewed in a later step.
          // The user's schema has salesVelocityFloat, stockoutDays, status, trending on Product.
          // These should ideally be updated by a dedicated service (like product.service.ts)
          // For the action, just updating the variant is the primary goal.
          // A full metrics recalc might be too heavy here or better done by a background job / webhook.
          // However, the original code DID try to update them. Let's try to keep that.

          const { calculateProductMetrics } = await import("~/services/product.service"); // product.service.ts will need to be compatible.

          // Construct ProductWithVariants compatible object for calculateProductMetrics
          const productWithVariantsForCalc = {
            ...productToUpdate,
            // salesVelocityFloat is on productToUpdate directly from schema
            variants: productToUpdate.variants.map(v => ({ inventoryQuantity: v.inventoryQuantity || 0})),
          };

          // shopSettings for calculateProductMetrics
          const shopSettings = {
            lowStockThresholdUnits: shopRecord.lowStockThreshold ?? 10,
            criticalStockThresholdUnits: shopRecord.notificationSettings?.[0]?.criticalStockThresholdUnits ?? Math.min(5, Math.floor((shopRecord.lowStockThreshold ?? 10) * 0.3)),
            criticalStockoutDays: shopRecord.notificationSettings?.[0]?.criticalStockoutDays ?? 3,
          };

          const metrics = calculateProductMetrics(productWithVariantsForCalc, shopSettings);

          const salesVelocityThresholdForTrending = shopRecord.notificationSettings?.[0]?.salesVelocityThreshold ?? 50;
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
      return json({ success: true, updatedVariant });
    } catch (e: unknown) {
      console.error("Failed to update inventory:", e);
      if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2025') {
        return json({ error: "Variant not found. Failed to update inventory." }, { status: 404 });
      }
      return json({ error: "Failed to update inventory due to a server error." }, { status: 500 });
    }
  }
  return json({ error: "Invalid intent." }, { status: 400 });
};

export default function AppProductsPage() {
  const { products, error, shopDomain } = useLoaderData<typeof loader>();
  const [selectedProduct, setSelectedProduct] = useState<ProductForTable | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  // Sort state from user's example - good addition
  const [sortColumn, setSortColumn] = useState<keyof ProductForTable | 'vendor' | 'sku' | 'price' | 'inventory' | 'salesVelocity' | 'stockoutDays' | null>('title');
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
        const aValue = a[sortColumn as keyof ProductForTable]; // Type assertion
        const bValue = b[sortColumn as keyof ProductForTable];
        let comparison = 0;
        if (typeof aValue === 'number' && typeof bValue === 'number') {
          comparison = (aValue ?? 0) - (bValue ?? 0);
        } else if (typeof aValue === 'string' && typeof bValue === 'string') {
          comparison = aValue.localeCompare(bValue);
        } else if (aValue === null || aValue === undefined) {
          comparison = -1; // nulls/undefined first
        } else if (bValue === null || bValue === undefined) {
          comparison = 1;  // nulls/undefined first
        }
        return sortDirection === 'ascending' ? comparison : -comparison;
      });
    }
    return result;
  }, [products, searchTerm, sortColumn, sortDirection]);

  const resourceName = { singular: 'product', plural: 'products' };

  const handleSort = useCallback(
    (headingIndex: number, direction: 'ascending' | 'descending') => {
      const columns: (keyof ProductForTable | 'vendor' | 'sku' | 'price' | 'inventory' | 'salesVelocity' | 'stockoutDays')[] =
        ['title', 'vendor', 'sku', 'price', 'inventory', 'salesVelocity', 'stockoutDays', 'status'];
      setSortColumn(columns[headingIndex]);
      setSortDirection(direction);
    },
    [],
  );

  const headings: IndexTableProps['headings'] = [
    { title: 'Product', id: 'title' },
    { title: 'Vendor', id: 'vendor' },
    { title: 'SKU', id: 'sku'},
    { title: 'Price', id: 'price', numeric: true },
    { title: 'Inventory', id: 'inventory', numeric: true },
    { title: 'Sales Velocity (day)', id: 'salesVelocity', numeric: true },
    { title: 'Stockout (days)', id: 'stockoutDays', numeric: true },
    { title: 'Status', id: 'status' },
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
          prefix={<Icon source={SearchIcon} />} // Corrected Icon usage
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
          shopDomain={shopDomain}
        />
      )}
    </Page>
  );
}
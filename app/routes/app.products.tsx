// app/routes/app.products.tsx

import { json, type ActionFunctionArgs, type LoaderFunctionArgs } from "@remix-run/node";
import { useLoaderData, useNavigate } from "@remix-run/react";
import { Page, Layout, BlockStack, Card, Text, TextField, Icon, Banner } from "@shopify/polaris";
import { IndexTable, type IndexTableProps } from '@shopify/polaris';
import { SearchMinor } from '@shopify/polaris-icons';
import { useState, useMemo, useCallback } from "react";
import { Prisma } from "@prisma/client"; // Import Prisma for error types
import prisma from "~/db.server";
import { authenticate } from "~/shopify.server";
import { ProductModal } from "~/components/ProductModal";
import { Badge } from "~/components/common/Badge";
import { calculateProductStatus, type VariantForStatus } from "~/utils/product-status.server";

// Define types for data structure
interface ProductVariantForModal {
  id: string; // Prisma Variant ID
  shopifyVariantId: string; // Shopify Variant GID
  title: string;
  sku?: string | null;
  price?: string | null;
  inventoryQuantity?: number | null;
  inventoryItemId: string; // Shopify InventoryItem GID
}
export interface ProductForTable {
  id: string; // Prisma Product ID
  shopifyId: string;
  title: string;
  vendor: string;
  price: string;
  sku: string;
  inventory: number;
  salesVelocity: number;
  stockoutDays: number;
  status: "Critical" | "Low" | "Healthy" | "Unknown";
  variantsForModal: ProductVariantForModal[];
}

interface LoaderData {
  products: ProductForTable[];
  error?: string;
}

/**
 * Loader function to fetch products and calculate their inventory status.
 */
export const loader = async ({ request }: LoaderFunctionArgs): Promise<Response> => {
  const { session } = await authenticate.admin(request);
  const shopRecord = await prisma.shop.findUnique({ where: { shop: session.shop } });
  if (!shopRecord) throw new Response("Shop not found", { status: 404 });

  try {
    const productsFromDB = await prisma.product.findMany({
      where: { shopId: shopRecord.id },
      orderBy: { title: 'asc' },
      include: {
        variants: {
          select: {
            id: true,
            sku: true,
            price: true,
            inventoryQuantity: true,
            shopifyId: true, // Assuming you have shopifyId on Variant model
            inventoryItemId: true // Assuming you have inventoryItemId on Variant model
          }
        }
      }
    });

    const lowStockThreshold = shopRecord.lowStockThreshold ?? 10;

    const productsForTable = productsFromDB.map(p => {
      const variantsForStatusCalc: VariantForStatus[] = p.variants.map(v => ({
        inventoryQuantity: v.inventoryQuantity,
      }));
      const productStatus = calculateProductStatus(variantsForStatusCalc, lowStockThreshold);

      return {
        id: p.id,
        shopifyId: p.shopifyId,
        title: p.title,
        vendor: p.vendor,
        price: p.variants?.[0]?.price?.toString() ?? '0.00',
        sku: p.variants?.[0]?.sku ?? 'N/A',
        inventory: p.variants.reduce((sum, v) => sum + (v.inventoryQuantity || 0), 0),
        salesVelocity: p.salesVelocityFloat ?? 0,
        stockoutDays: p.stockoutDays ?? 0,
        status: productStatus,
        variantsForModal: p.variants.map(v => ({
          id: v.id,
          shopifyVariantId: v.shopifyId ?? '', // Use actual data if available
          title: v.sku || 'Variant',
          sku: v.sku,
          price: v.price?.toString(),
          inventoryQuantity: v.inventoryQuantity,
          inventoryItemId: v.inventoryItemId ?? '', // Use actual data if available
        })),
      };
    });
    return json({ products: productsForTable } as LoaderData);
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Unknown error";
    console.error("Error fetching products for table:", message, error);
    return json({ products: [], error: `Failed to fetch products: ${message}` } as LoaderData, { status: 500 });
  }
};

/**
 * Action function to handle product-related actions, like updating inventory.
 */
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
      // **FIX START: This is the merged and corrected logic**
      const updatedVariant = await prisma.variant.update({
        where: { id: variantId },
        data: { inventoryQuantity: newQuantity },
      });

      // After updating a variant, recalculate and update the parent product's metrics.
      if (updatedVariant && updatedVariant.productId) {
        const productToUpdate = await prisma.product.findUnique({
          where: { id: updatedVariant.productId },
          include: { variants: { select: { inventoryQuantity: true } } }
        });

        if (productToUpdate) {
          // Dynamically import to avoid circular dependency issues
          const { calculateProductMetrics } = await import("~/services/product.service");

          const shopSettings = {
            lowStockThresholdUnits: shopRecord.lowStockThreshold ?? 10,
            criticalStockThresholdUnits: Math.min(5, Math.floor((shopRecord.lowStockThreshold ?? 10) * 0.3)),
            criticalStockoutDays: 3,
          };

          const metrics = calculateProductMetrics(productToUpdate, shopSettings);
          const salesVelocityThresholdForTrending = shopRecord.notificationSettings?.salesVelocityThreshold ?? 50;
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
      // **FIX END**
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

/**
 * Renders the products page with a sortable and filterable list.
 */
export default function AppProductsPage() {
  const { products, error } = useLoaderData<typeof loader>();
  const [selectedProduct, setSelectedProduct] = useState<ProductForTable | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [sortColumn, setSortColumn] = useState<keyof ProductForTable | null>('title');
  const [sortDirection, setSortDirection] = useState<'ascending' | 'descending'>('ascending');

  const handleSearchChange = useCallback((value: string) => setSearchTerm(value), []);

  const filteredAndSortedProducts = useMemo(() => {
    let result = products;
    if (searchTerm) {
      result = result.filter(p =>
        p.title.toLowerCase().includes(searchTerm.toLowerCase()) ||
        p.vendor.toLowerCase().includes(searchTerm.toLowerCase())
      );
    }
    if (sortColumn) {
      result.sort((a, b) => {
        const aValue = a[sortColumn];
        const bValue = b[sortColumn];
        let comparison = 0;
        if (typeof aValue === 'number' && typeof bValue === 'number') {
          comparison = aValue - bValue;
        } else if (typeof aValue === 'string' && typeof bValue === 'string') {
          comparison = aValue.localeCompare(bValue);
        }
        return sortDirection === 'ascending' ? comparison : -comparison;
      });
    }
    return result;
  }, [products, searchTerm, sortColumn, sortDirection]);

  const resourceName = { singular: 'product', plural: 'products' };

  const handleSort = useCallback(
    (headingIndex: number, direction: 'ascending' | 'descending') => {
      const columns: (keyof ProductForTable)[] = ['title', 'price', 'inventory', 'salesVelocity', 'stockoutDays', 'status'];
      setSortColumn(columns[headingIndex]);
      setSortDirection(direction);
    },
    [],
  );

  const headings: IndexTableProps['headings'] = [
    { title: 'Product', id: 'title' },
    { title: 'Price', id: 'price' },
    { title: 'Inventory', id: 'inventory' },
    { title: 'Sales Velocity (day)', id: 'salesVelocity' },
    { title: 'Stockout (days)', id: 'stockoutDays' },
    { title: 'Status', id: 'status' },
  ];

  const rowMarkup = filteredAndSortedProducts.map(
    (product, index) => (
      <IndexTable.Row
        id={product.id}
        key={product.id}
        position={index}
        onClick={() => setSelectedProduct(product)}
      >
        <IndexTable.Cell>
          <Text variant="bodyMd" fontWeight="bold" as="span">
            {product.title}
          </Text>
          <br />
          <Text variant="bodySm" tone="subdued" as="span">
            {product.vendor}
          </Text>
        </IndexTable.Cell>
        <IndexTable.Cell>${product.price}</IndexTable.Cell>
        <IndexTable.Cell>{product.inventory}</IndexTable.Cell>
        <IndexTable.Cell>{product.salesVelocity.toFixed(2)}</IndexTable.Cell>
        <IndexTable.Cell>{product.stockoutDays.toFixed(0)}</IndexTable.Cell>
        <IndexTable.Cell><Badge customStatus={product.status}>{product.status}</Badge></IndexTable.Cell>
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
      primaryAction={{ content: 'Sync Products', onAction: () => console.log('Sync clicked') }}
    >
      <BlockStack gap="400">
        <TextField
          label="Filter products"
          labelHidden
          value={searchTerm}
          onChange={handleSearchChange}
          prefix={<Icon source={SearchMinor} />}
          placeholder="Search by product title or vendor"
          autoComplete="off"
        />
        <Card>
          <IndexTable
            resourceName={resourceName}
            itemCount={filteredAndSortedProducts.length}
            headings={headings}
            selectable={false}
            sortable={[true, true, true, true, true, true]}
            onSort={handleSort}
            sortColumnIndex={sortColumn ? headings.findIndex(h => h.id === sortColumn) : undefined}
            sortDirection={sortDirection}
          >
            {rowMarkup}
          </IndexTable>
          {filteredAndSortedProducts.length === 0 && (
             <div style={{padding: '20px', textAlign: 'center'}}>
                <Text as="p" tone="subdued">No products found matching your criteria.</Text>
            </div>
          )}
        </Card>
      </BlockStack>
      {selectedProduct && (
        <ProductModal
          open={!!selectedProduct}
          onClose={() => setSelectedProduct(null)}
          product={selectedProduct}
        />
      )}
    </Page>
  );
}
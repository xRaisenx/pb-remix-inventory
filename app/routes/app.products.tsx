// app/routes/app.products.tsx

import { json, type ActionFunctionArgs, type LoaderFunctionArgs } from "@remix-run/node";
import { useLoaderData, useNavigate } from "@remix-run/react";
import { Page, BlockStack, Card, Text, TextField, Icon, Banner, IndexTable, type IndexTableProps, Pagination } from "@shopify/polaris";
import { SearchMajor } from '@shopify/polaris-icons';
import { useState, useMemo, useCallback } from "react";
import { Prisma } from "@prisma/client";
import prisma from "~/db.server";
import { authenticate } from "~/shopify.server";
import { ProductModal } from "~/components/ProductModal";
import { CustomBadge } from "~/components/common/Badge";
import type { CustomStatus } from "~/components/common/Badge";
import { calculateProductMetrics } from "~/services/product.service";
import { updateInventoryQuantityInShopifyAndDB } from "~/services/inventory.service";
import { INTENT } from "~/utils/intents";

// --- TYPE DEFINITIONS ---
interface ProductVariantForModal {
  id: string;
  shopifyVariantId: string;
  title: string;
  sku?: string | null;
  price?: string | null;
  inventoryQuantity?: number | null;
  inventoryItemId?: string | null;
}

export interface ProductForTable {
  id: string;
  shopifyId: string;
  title: string;
  vendor: string;
  price: string;
  sku: string;
  inventory: number;
  salesVelocity: number | null;
  stockoutDays: number | null;
  status: string | null;
  variantsForModal: ProductVariantForModal[];
  inventoryByLocation: Record<string, { quantity: number; shopifyLocationGid: string | null }>;
}

interface LoaderData {
  products: ProductForTable[];
  warehouses: Array<{ id: string; name: string; shopifyLocationGid: string | null }>;
  error?: string;
  shopDomain: string;
  pageInfo: {
    currentPage: number;
    totalPages: number;
    totalResults: number;
    nextPageUrl?: string;
    prevPageUrl?: string;
  };
}

const PRODUCTS_PER_PAGE = 25;

const mapProductStatusToBadgeCustomStatus = (prismaStatus: string | null): CustomStatus => {
  if (!prismaStatus) return "default";
  switch (prismaStatus.toLowerCase()) {
    case "healthy": return "positive";
    case "low": return "warning";
    case "critical": return "critical";
    default: return "default";
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
          variants: { orderBy: { createdAt: 'asc' } },
          inventory: { select: { quantity: true, warehouseId: true, warehouse: { select: { shopifyLocationGid: true } } } },
          shop: { include: { NotificationSettings: true } },
        },
        take: PRODUCTS_PER_PAGE,
        skip: skip,
      }),
      prisma.product.count({ where: { shopId: shopRecord.id } }),
      prisma.warehouse.findMany({ where: { shopId: shopRecord.id }, select: { id: true, name: true, shopifyLocationGid: true } }),
    ]);

    const productsForTable = productsFromDB.map(p => {
      const totalInventory = p.inventory.reduce((sum, inv) => sum + inv.quantity, 0);
      const firstVariant = p.variants?.[0];
      const inventoryByLocation = p.inventory.reduce((acc, inv) => {
        acc[inv.warehouseId] = { quantity: inv.quantity, shopifyLocationGid: inv.warehouse.shopifyLocationGid };
        return acc;
      }, {} as ProductForTable['inventoryByLocation']);

      const notificationSetting = p.shop.NotificationSettings?.[0];
      const lowStockThresholdUnits = notificationSetting?.lowStockThreshold ?? p.shop.lowStockThreshold ?? 10;
      const criticalStockThresholdUnits = notificationSetting?.criticalStockThresholdUnits ?? Math.min(5, Math.floor(lowStockThresholdUnits * 0.3));
      const criticalStockoutDays = notificationSetting?.criticalStockoutDays ?? 3;
      const shopSettingsForMetrics = { lowStockThresholdUnits, criticalStockThresholdUnits, criticalStockoutDays };
      const productWithVariantsForCalc = { ...p, variants: p.variants.map(v => ({ inventoryQuantity: v.inventoryQuantity || 0 })) };
      const calculatedMetrics = calculateProductMetrics(productWithVariantsForCalc, shopSettingsForMetrics);

      return {
        id: p.id,
        shopifyId: p.shopifyId,
        title: p.title,
        vendor: p.vendor,
        price: firstVariant?.price?.toString() ?? '0.00',
        sku: firstVariant?.sku ?? 'N/A',
        inventory: totalInventory,
        salesVelocity: p.salesVelocityFloat,
        stockoutDays: p.stockoutDays,
        status: p.status,
        variantsForModal: p.variants.map(v => ({
          id: v.id,
          shopifyVariantId: v.shopifyId ?? '',
          title: v.title ?? v.sku ?? 'Variant',
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
    const variantId = formData.get("variantId") as string;
    const newQuantityStr = formData.get("newQuantity") as string;
    const shopifyLocationGid = formData.get("shopifyLocationGid") as string;

    const newQuantity = parseInt(newQuantityStr, 10);
    if (!variantId || !shopifyLocationGid || isNaN(newQuantity) || newQuantity < 0) {
      return json({ error: "Invalid form data submitted." }, { status: 400 });
    }

    try {
      const updateResult = await updateInventoryQuantityInShopifyAndDB(session.shop, variantId, newQuantity, shopifyLocationGid);

      if (!updateResult.success) {
        return json({ error: updateResult.error, userErrors: updateResult.userErrors }, { status: 400 });
      }

      // On success, trigger metrics recalculation for the affected product
      const updatedVariant = await prisma.variant.findUnique({ where: { id: variantId }, select: { productId: true } });
      if (updatedVariant?.productId) {
        const productToUpdate = await prisma.product.findUnique({
          where: { id: updatedVariant.productId },
          include: { variants: { select: { inventoryQuantity: true } }, shop: { include: { NotificationSettings: true } } }
        });
        if (productToUpdate) {
          const notificationSetting = productToUpdate.shop.NotificationSettings?.[0];
          const lowStockThresholdUnits = notificationSetting?.lowStockThreshold ?? productToUpdate.shop.lowStockThreshold ?? 10;
          const criticalStockThresholdUnits = notificationSetting?.criticalStockThresholdUnits ?? Math.min(5, Math.floor(lowStockThresholdUnits * 0.3));
          const criticalStockoutDays = notificationSetting?.criticalStockoutDays ?? 3;
          const salesVelocityThresholdForTrending = notificationSetting?.salesVelocityThreshold ?? 50;
          const shopSettingsForMetrics = { lowStockThresholdUnits, criticalStockThresholdUnits, criticalStockoutDays };
          const productWithVariantsForCalc = { ...productToUpdate, variants: productToUpdate.variants.map(v => ({ inventoryQuantity: v.inventoryQuantity || 0 })) };
          const metrics = calculateProductMetrics(productWithVariantsForCalc, shopSettingsForMetrics);
          const trending = (productToUpdate.salesVelocityFloat ?? 0) > salesVelocityThresholdForTrending;
          await prisma.product.update({
            where: { id: productToUpdate.id },
            data: { stockoutDays: metrics.stockoutDays, status: metrics.status, trending: trending },
          });
        }
      }

      return json({ success: true, message: updateResult.message });
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
  const { products, warehouses, error, shopDomain, pageInfo } = useLoaderData<LoaderData>();
  const [selectedProduct, setSelectedProduct] = useState<ProductForTable | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [sortColumn, setSortColumn] = useState<keyof ProductForTable | null>('title');
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
        const aIsNull = aValue === null || aValue === undefined;
        const bIsNull = bValue === null || bValue === undefined;
        if (aIsNull && bIsNull) comparison = 0;
        else if (aIsNull) comparison = -1;
        else if (bIsNull) comparison = 1;
        else if (typeof aValue === 'number' && typeof bValue === 'number') comparison = aValue - bValue;
        else comparison = String(aValue).localeCompare(String(bValue));
        return sortDirection === 'ascending' ? comparison : -comparison;
      });
    }
    return result;
  }, [products, searchTerm, sortColumn, sortDirection]);

  const handleSort = useCallback((index: number, direction: 'ascending' | 'descending') => {
    const columns: (keyof ProductForTable)[] = ['title', 'vendor', 'sku', 'price', 'inventory', 'salesVelocity', 'stockoutDays', 'status'];
    setSortColumn(columns[index]);
    setSortDirection(direction);
  }, []);

  const headings: IndexTableProps['headings'] = [
    { title: 'Product', id: 'title' }, { title: 'Vendor', id: 'vendor' }, { title: 'SKU', id: 'sku' },
    { title: 'Price', id: 'price', numeric: true }, { title: 'Inventory', id: 'inventory', numeric: true },
    { title: 'Sales Velocity (day)', id: 'salesVelocity', numeric: true }, { title: 'Stockout (days)', id: 'stockoutDays', numeric: true },
    { title: 'Status', id: 'status' },
  ];

  const rowMarkup = filteredAndSortedProducts.map((product, index) => (
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
    <Page title="Products">
      <BlockStack gap="400">
        <TextField label="Filter products" labelHidden value={searchTerm} onChange={handleSearchChange} prefix={<Icon source={SearchMajor} />} placeholder="Search by product title, vendor, or SKU" autoComplete="off" />
        <Card>
          <IndexTable
            resourceName={{ singular: 'product', plural: 'products' }}
            itemCount={filteredAndSortedProducts.length}
            headings={headings}
            selectable={false}
            sortable={[true, true, true, true, true, true, true, true]}
            onSort={handleSort}
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
                onPrevious={() => navigate(pageInfo.prevPageUrl!)}
                hasNext={!!pageInfo.nextPageUrl}
                onNext={() => navigate(pageInfo.nextPageUrl!)}
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
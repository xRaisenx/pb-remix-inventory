// app/routes/app.products.tsx

import { json, type ActionFunctionArgs, type LoaderFunctionArgs } from "@remix-run/node";
import { useLoaderData, useNavigate } from "@remix-run/react";
import { useState, useMemo, useCallback } from "react";
import prisma from "~/db.server";
import { authenticate } from "~/shopify.server";
import { ProductModal } from "~/components/ProductModal";
import { PlanetBeautyLayout } from "~/components/PlanetBeautyLayout";
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

// Map product names to CSS classes for styling (matching example)
const getProductClassName = (title: string): string => {
  const titleLower = title.toLowerCase();
  if (titleLower.includes('anastasia') && titleLower.includes('brow')) return 'anastasia-brow-gel';
  if (titleLower.includes('elta') && titleLower.includes('md')) return 'elta-md-sunscreen';
  if (titleLower.includes('borghese') && titleLower.includes('serum')) return 'borghese-serum';
  if (titleLower.includes('kerastase') && titleLower.includes('shampoo')) return 'kerastase-shampoo';
  if (titleLower.includes('mario') && titleLower.includes('badescu')) return 'mario-badescu-spray';
  if (titleLower.includes('t3') && titleLower.includes('hair')) return 't3-hair-dryer';
  return 'default-product';
};

// Map status to badge styling
const getStatusBadge = (status: string | null) => {
  if (!status) return { className: 'pb-badge-default', text: 'Unknown' };
  
  switch (status.toLowerCase()) {
    case 'healthy':
      return { className: 'pb-badge-success', text: 'Healthy' };
    case 'low':
      return { className: 'pb-badge-warning', text: 'Low Stock' };
    case 'critical':
      return { className: 'pb-badge-critical', text: 'Critical' };
    default:
      return { className: 'pb-badge-default', text: status };
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
          variants: {
            orderBy: { createdAt: 'asc' },
            select: {
              id: true, shopifyId: true, title: true, sku: true, price: true, inventoryQuantity: true, inventoryItemId: true,
            }
          },
          inventory: {
            select: { quantity: true, warehouseId: true, warehouse: { select: { shopifyLocationGid: true } } }
          },
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

    const productsForTable = productsFromDB.map((p): ProductForTable => {
      const totalInventory = p.inventory.reduce((sum: number, inv: { quantity: number }) => sum + inv.quantity, 0);
      const firstVariant = p.variants?.[0];

      const inventoryByLocation = p.inventory.reduce((acc: ProductForTable['inventoryByLocation'], inv) => {
        acc[inv.warehouseId] = { quantity: inv.quantity, shopifyLocationGid: inv.warehouse.shopifyLocationGid };
        return acc;
      }, {} as ProductForTable['inventoryByLocation']);

      return {
        id: p.id,
        shopifyId: p.shopifyId,
        title: p.title,
        vendor: p.vendor || "",
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
      return json({ error: "Invalid form data submitted. Variant ID, Location GID, and valid quantity are required." }, { status: 400 });
    }

    try {
      const updateResult = await updateInventoryQuantityInShopifyAndDB(session.shop, variantId, newQuantity, shopifyLocationGid);

      if (!updateResult.success) {
        return json({ error: updateResult.error, userErrors: updateResult.userErrors }, { status: 400 });
      }

      const updatedVariant = await prisma.variant.findUnique({
        where: { id: variantId },
        select: { productId: true }
      });

      if (updatedVariant?.productId) {
        const productToUpdate = await prisma.product.findUnique({
          where: { id: updatedVariant.productId },
          include: {
            variants: { select: { inventoryQuantity: true } },
            shop: { include: { NotificationSettings: true } }
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
  const { products, warehouses, error, pageInfo } = useLoaderData<LoaderData>();
  const [selectedProduct, setSelectedProduct] = useState<ProductForTable | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [sortColumn, setSortColumn] = useState<keyof ProductForTable>('title');
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('asc');
  const navigate = useNavigate();

  const handleSearchChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    setSearchTerm(e.target.value);
  }, []);

  const filteredAndSortedProducts = useMemo(() => {
    let result = products.filter(p => {
      const matchesSearch = p.title.toLowerCase().includes(searchTerm.toLowerCase()) ||
                          p.vendor.toLowerCase().includes(searchTerm.toLowerCase()) ||
                          p.sku.toLowerCase().includes(searchTerm.toLowerCase());
      
      const matchesStatus = statusFilter === 'all' || 
                          (p.status && p.status.toLowerCase() === statusFilter);
      
      return matchesSearch && matchesStatus;
    });

    result.sort((a, b) => {
      const aValue = a[sortColumn];
      const bValue = b[sortColumn];
      let comparison = 0;

      if (aValue === null || aValue === undefined) comparison = 1;
      else if (bValue === null || bValue === undefined) comparison = -1;
      else if (typeof aValue === 'number' && typeof bValue === 'number') {
        comparison = aValue - bValue;
      } else {
        comparison = String(aValue).localeCompare(String(bValue));
      }
      return sortDirection === 'asc' ? comparison : -comparison;
    });

    return result;
  }, [products, searchTerm, statusFilter, sortColumn, sortDirection]);

  const handleSort = (column: keyof ProductForTable) => {
    if (sortColumn === column) {
      setSortDirection(sortDirection === 'asc' ? 'desc' : 'asc');
    } else {
      setSortColumn(column);
      setSortDirection('asc');
    }
  };

  if (error) {
    return (
      <PlanetBeautyLayout>
        <div className="pb-alert-critical">
          <p>Error: {error}</p>
        </div>
      </PlanetBeautyLayout>
    );
  }

  return (
    <PlanetBeautyLayout>
      <div className="pb-space-y-6">
        {/* Page Header */}
        <div className="pb-flex pb-justify-between pb-items-center">
          <h1 className="pb-text-2xl pb-font-bold">Products</h1>
          <div className="pb-text-sm" style={{ color: '#718096' }}>
            {pageInfo.totalResults} total products
          </div>
        </div>

        {/* Search and Filters */}
        <div className="pb-card">
          <div className="pb-flex pb-flex-wrap pb-gap-4 pb-items-center">
            <div className="pb-flex-1 pb-min-w-64">
              <input
                type="text"
                className="pb-input"
                placeholder="Search products, vendors, or SKUs..."
                value={searchTerm}
                onChange={handleSearchChange}
              />
            </div>
            <div>
              <select
                className="pb-select"
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value)}
              >
                <option value="all">All Status</option>
                <option value="healthy">Healthy</option>
                <option value="low">Low Stock</option>
                <option value="critical">Critical</option>
              </select>
            </div>
            <div className="pb-text-sm" style={{ color: '#718096' }}>
              {filteredAndSortedProducts.length} results
            </div>
          </div>
        </div>

        {/* Products Table */}
        <div className="pb-card pb-overflow-x-auto">
          <table className="pb-table">
            <thead>
              <tr>
                <th onClick={() => handleSort('title')} className="cursor-pointer">
                  Product {sortColumn === 'title' && (sortDirection === 'asc' ? '↑' : '↓')}
                </th>
                <th onClick={() => handleSort('vendor')} className="cursor-pointer">
                  Vendor {sortColumn === 'vendor' && (sortDirection === 'asc' ? '↑' : '↓')}
                </th>
                <th onClick={() => handleSort('sku')} className="cursor-pointer">
                  SKU {sortColumn === 'sku' && (sortDirection === 'asc' ? '↑' : '↓')}
                </th>
                <th onClick={() => handleSort('price')} className="cursor-pointer">
                  Price {sortColumn === 'price' && (sortDirection === 'asc' ? '↑' : '↓')}
                </th>
                <th onClick={() => handleSort('inventory')} className="cursor-pointer">
                  Inventory {sortColumn === 'inventory' && (sortDirection === 'asc' ? '↑' : '↓')}
                </th>
                <th onClick={() => handleSort('salesVelocity')} className="cursor-pointer">
                  Sales/Day {sortColumn === 'salesVelocity' && (sortDirection === 'asc' ? '↑' : '↓')}
                </th>
                <th onClick={() => handleSort('stockoutDays')} className="cursor-pointer">
                  Stockout (Days) {sortColumn === 'stockoutDays' && (sortDirection === 'asc' ? '↑' : '↓')}
                </th>
                <th onClick={() => handleSort('status')} className="cursor-pointer">
                  Status {sortColumn === 'status' && (sortDirection === 'asc' ? '↑' : '↓')}
                </th>
              </tr>
            </thead>
            <tbody>
              {filteredAndSortedProducts.map((product) => {
                const statusBadge = getStatusBadge(product.status);
                return (
                  <tr 
                    key={product.id} 
                    className="cursor-pointer hover:bg-gray-50"
                    onClick={() => setSelectedProduct(product)}
                  >
                    <td>
                      <div className="pb-flex pb-items-center">
                        <div className={`pb-product-icon ${getProductClassName(product.title)} mr-3`}></div>
                        <div>
                          <div className="pb-font-medium">{product.title}</div>
                        </div>
                      </div>
                    </td>
                    <td>{product.vendor}</td>
                    <td className="pb-font-mono pb-text-sm">{product.sku}</td>
                    <td>${product.price}</td>
                    <td>
                      <span className={product.inventory < 10 ? 'text-red-600 pb-font-bold' : ''}>
                        {product.inventory}
                      </span>
                    </td>
                    <td>{product.salesVelocity?.toFixed(1) ?? 'N/A'}</td>
                    <td>
                      <span className={(product.stockoutDays ?? 0) < 3 ? 'text-red-600 pb-font-bold' : ''}>
                        {product.stockoutDays?.toFixed(1) ?? 'N/A'}
                      </span>
                    </td>
                    <td>
                      <span className={statusBadge.className}>
                        {statusBadge.text}
                      </span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>

          {filteredAndSortedProducts.length === 0 && (
            <div className="pb-text-center pb-p-8" style={{ color: '#718096' }}>
              No products found matching your search criteria.
            </div>
          )}
        </div>

        {/* Pagination */}
        {pageInfo.totalPages > 1 && (
          <div className="pb-flex pb-justify-center pb-items-center pb-space-x-4">
            <button
              className="pb-btn-secondary"
              onClick={() => {
                if (pageInfo.prevPageUrl) {
                  navigate(pageInfo.prevPageUrl);
                }
              }}
              disabled={!pageInfo.prevPageUrl}
            >
              Previous
            </button>
            <span className="pb-text-sm">
              Page {pageInfo.currentPage} of {pageInfo.totalPages}
            </span>
            <button
              className="pb-btn-secondary"
              onClick={() => {
                if (pageInfo.nextPageUrl) {
                  navigate(pageInfo.nextPageUrl);
                }
              }}
              disabled={!pageInfo.nextPageUrl}
            >
              Next
            </button>
          </div>
        )}
      </div>

      {/* Product Modal */}
      {selectedProduct && (
        <ProductModal
          open={!!selectedProduct}
          onClose={() => setSelectedProduct(null)}
          product={selectedProduct}
          warehouses={warehouses}
        />
      )}
    </PlanetBeautyLayout>
  );
}
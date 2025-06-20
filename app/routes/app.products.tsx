import { json, type ActionFunctionArgs, type LoaderFunctionArgs } from "@remix-run/node";
import { useFetcher, useLoaderData, useNavigate } from "@remix-run/react";
import { Page, Layout, BlockStack, Card, Text, TextField, Icon, Button as PolarisButton } from "@shopify/polaris";
import { IndexTable, IndexTableProps } from '@shopify/polaris';
import { SearchMinor } from '@shopify/polaris-icons';
import { useState, useMemo, useCallback } from "react";
import prisma from "~/db.server";
import { authenticate } from "~/shopify.server";
import { ProductModal } from "~/components/ProductModal"; // Assuming ProductModal path
import { Badge } from "~/components/common/Badge"; // Common Badge

// Define types for data structure
interface ProductVariantForModal {
  id: string; // Prisma Variant ID
  shopifyVariantId: string; // Shopify Variant GID (placeholder for now)
  title: string; // Variant title or SKU
  sku?: string | null;
  price?: string | null;
  inventoryQuantity?: number | null;
  inventoryItemId: string; // Shopify InventoryItem GID (placeholder for now)
}
export interface ProductForTable {
  id: string; // Prisma Product ID
  shopifyId: string;
  title: string;
  vendor: string;
  price: string;
  sku: string;
  inventory: number;
  salesLastWeek: number; // Placeholder
  salesVelocity: number;
  stockoutDays: number;
  status: string;
  variantsForModal: ProductVariantForModal[];
}

interface LoaderData {
  products: ProductForTable[];
  error?: string;
}

// Loader Function
export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { session } = await authenticate.admin(request);
  const shopRecord = await prisma.shop.findUnique({ where: { shop: session.shop } });
  if (!shopRecord) throw new Response("Shop not found", { status: 404 });
  const shopId = shopRecord.id;

  try {
    const productsFromDB = await prisma.product.findMany({
      where: { shopId },
      orderBy: { title: 'asc' },
      include: {
        variants: {
          select: {
            id: true,
            sku: true,
            price: true,
            inventoryQuantity: true,
            // shopifyId: true, // Assuming you have shopifyId on Variant model for shopifyVariantId
            // inventoryItemId: true // Assuming you have inventoryItemId on Variant model
          }
        }
      }
    });

    const productsForTable = productsFromDB.map(p => ({
      id: p.id,
      shopifyId: p.shopifyId,
      title: p.title,
      vendor: p.vendor,
      price: p.variants?.[0]?.price?.toString() ?? '0.00',
      sku: p.variants?.[0]?.sku ?? 'N/A',
      inventory: p.variants.reduce((sum, v) => sum + (v.inventoryQuantity || 0), 0),
      salesLastWeek: 0, // Placeholder
      salesVelocity: p.salesVelocityFloat ?? 0,
      stockoutDays: p.stockoutDays ?? 0,
      status: p.status ?? 'Unknown',
      variantsForModal: p.variants.map(v => ({
        id: v.id,
        // shopifyVariantId: v.shopifyId || '', // Map if available
        shopifyVariantId: '', // Placeholder
        title: v.sku || 'Variant', // Use SKU as title, or a specific title field if you add one
        sku: v.sku,
        price: v.price?.toString(),
        inventoryQuantity: v.inventoryQuantity,
        // inventoryItemId: v.inventoryItemId || '', // Map if available
        inventoryItemId: '', // Placeholder
      })),
    }));
    return json({ products: productsForTable });
  } catch (error) {
    console.error("Error fetching products for table:", error);
    return json({ products: [], error: "Failed to fetch products" }, { status: 500 });
  }
};

// Action Function
export const action = async ({ request }: ActionFunctionArgs) => {
  const { session } = await authenticate.admin(request);
  const shopRecord = await prisma.shop.findUnique({ where: { shop: session.shop } });
  if (!shopRecord) throw new Response("Shop not found", { status: 404 });
  // const shopId = shopRecord.id;

  const formData = await request.formData();
  const intent = formData.get("intent");

  if (intent === 'updateInventory') {
    const variantId = formData.get("variantId") as string;
    const newQuantityStr = formData.get("newQuantity") as string;

    if (!variantId || newQuantityStr === null) {
      return json({ error: "Missing variantId or newQuantity" }, { status: 400 });
    }
    const newQuantity = parseInt(newQuantityStr, 10);
    if (isNaN(newQuantity)) {
      return json({ error: "Invalid quantity" }, { status: 400 });
    }

    try {
      // Ensure this variant belongs to the current shop indirectly if needed, or add direct shopId check
      const updatedVariant = await prisma.variant.update({
        where: { id: variantId },
        data: { inventoryQuantity: newQuantity }, // Directly set new quantity
      });

      // TODO: Potentially re-calculate and update parent Product's status
      // This might be better handled by a background job or a more complex update logic here.

      return json({ success: true, updatedVariant });
    } catch (error) {
      console.error("Failed to update inventory:", error);
      return json({ error: "Failed to update inventory" }, { status: 500 });
    }
  }
  return json({ error: "Invalid intent" }, { status: 400 });
};


// Component Function
export default function AppProductsPage() {
  const { products, error } = useLoaderData<LoaderData>();
  const navigate = useNavigate(); // For navigation actions if any

  const [selectedProduct, setSelectedProduct] = useState<ProductForTable | null>(null);
  const [searchTerm, setSearchTerm] = useState('');

  // Basic sort state - extend as needed
  const [sortColumn, setSortColumn] = useState<keyof ProductForTable | null>(null);
  const [sortDirection, setSortDirection] = useState<'ascending' | 'descending'>('ascending');

  const handleSearchChange = useCallback((value: string) => setSearchTerm(value), []);

  const filteredProducts = useMemo(() => {
    let result = products;
    if (searchTerm) {
      result = result.filter(p => p.title.toLowerCase().includes(searchTerm.toLowerCase()));
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
      // Map headingIndex to your sortable columns
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

  const rowMarkup = filteredProducts.map(
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
          <Text variant="bodySm" color="subdued" as="span">
            {product.vendor}
          </Text>
        </IndexTable.Cell>
        <IndexTable.Cell>${product.price}</IndexTable.Cell>
        <IndexTable.Cell>{product.inventory}</IndexTable.Cell>
        <IndexTable.Cell>{product.salesVelocity.toFixed(2)}</IndexTable.Cell>
        <IndexTable.Cell>{product.stockoutDays.toFixed(0)}</IndexTable.Cell>
        <IndexTable.Cell><Badge customStatus={product.status?.toLowerCase() as any}>{product.status}</Badge></IndexTable.Cell>
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
      primaryAction={{ content: 'Add Product', onAction: () => console.log('Add product clicked') }} // Placeholder
    >
      <BlockStack gap="400">
        <TextField
          label="Filter products"
          labelHidden
          value={searchTerm}
          onChange={handleSearchChange}
          prefix={<Icon source={SearchMinor} />}
          placeholder="Search by product title"
          autoComplete="off"
        />
        <Card>
          <IndexTable
            resourceName={resourceName}
            itemCount={filteredProducts.length}
            headings={headings}
            selectable={false} // No checkboxes for now
            sortable={[true, true, true, true, true, true]} // Which columns are sortable
            onSort={handleSort}
            sortColumnIndex={sortColumn ? headings.findIndex(h => h.id === sortColumn) : undefined}
            sortDirection={sortDirection}
          >
            {rowMarkup}
          </IndexTable>
          {filteredProducts.length === 0 && (
             <div style={{padding: '20px', textAlign: 'center'}}>
                <Text as="p" color="subdued">No products found matching your criteria.</Text>
            </div>
          )}
        </Card>
      </BlockStack>
      {selectedProduct && (
        <ProductModal
          open={!!selectedProduct}
          onClose={() => setSelectedProduct(null)}
          product={selectedProduct}
          // onUpdateInventoryAction is handled by fetcher.submit in modal
        />
      )}
    </Page>
  );
}

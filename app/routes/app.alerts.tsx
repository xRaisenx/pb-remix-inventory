// app/routes/app.alerts.tsx
import { json, type LoaderFunctionArgs } from "@remix-run/node";
import { useLoaderData } from "@remix-run/react";
import { Page, Card, DataTable, Text, EmptyState, Link } from "@shopify/polaris";
import { authenticate } from "~/shopify.server";
import prisma  from "~/db.server";

// Define a type for the data structure of low-stock items
interface LowStockItem {
  inventoryId: string;
  productId: string;
  productTitle: string;
  warehouseId: string;
  warehouseName: string;
  quantity: number;
  // Potentially add shopifyProductId or variantId if needed for deep links
}

interface LoaderData {
  lowStockItems: LowStockItem[];
  error?: string;
  lowStockThreshold: number;
}

const LOW_STOCK_THRESHOLD = 10; // Define the threshold here

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { session } = await authenticate.admin(request);
  const shopDomain = session.shop;

  try {
    const shop = await prisma.shop.findUnique({ where: { shop: shopDomain } });
    if (!shop) {
      return json({ lowStockItems: [], error: "Shop not found.", lowStockThreshold: LOW_STOCK_THRESHOLD }, { status: 404 });
    }

    const lowStockRecords = await prisma.inventory.findMany({
      where: {
        warehouse: {
          shopId: shop.id,
        },
        quantity: {
          lt: LOW_STOCK_THRESHOLD, // Less than the threshold
        },
      },
      include: {
        product: { select: { id: true, title: true, shopifyId: true } }, // Assuming shopifyId is on Product model
        warehouse: { select: { id: true, name: true } },
      },
      orderBy: [
        { product: { title: 'asc' } },
        { warehouse: { name: 'asc' } },
      ]
    });

    const lowStockItems: LowStockItem[] = lowStockRecords.map(inv => ({
      inventoryId: inv.id,
      productId: inv.product.id,
      productTitle: inv.product.title,
      warehouseId: inv.warehouse.id,
      warehouseName: inv.warehouse.name,
      quantity: inv.quantity,
    }));

    return json({ lowStockItems, lowStockThreshold: LOW_STOCK_THRESHOLD });
  } catch (error) {
    console.error("Error fetching low stock items:", error);
    return json({ lowStockItems: [], error: "Failed to fetch low stock items.", lowStockThreshold: LOW_STOCK_THRESHOLD }, { status: 500 });
  }
};

export default function AlertsPage() {
  const { lowStockItems, error, lowStockThreshold } = useLoaderData<LoaderData>();

  if (error) {
    return (
      <Page title={`Low Stock Alerts (Threshold: < ${lowStockThreshold} units)`}>
        <Card>
          <div style={{padding: 'var(--p-space-400)'}}>
            <Text as="h2" variant="headingMd" tone="critical">Error loading alerts</Text>
            <Text as="p">{error}</Text>
          </div>
        </Card>
      </Page>
    );
  }

  const rows = lowStockItems.map(item => [
    <Link key={item.productId} url={`/app/products/${item.productId}`}>{item.productTitle}</Link>, // Assuming a product detail page exists
    item.warehouseName,
    item.quantity,
  ]);

  return (
    <Page
      title={`Low Stock Alerts (Threshold: < ${lowStockThreshold} units)`}
      subtitle={lowStockItems.length > 0 ? `Found ${lowStockItems.length} items needing attention.` : ""}
    >
      <Card>
        {lowStockItems.length === 0 ? (
          <EmptyState
            heading="No low stock items"
            image="https://cdn.shopify.com/s/files/1/0262/4074/files/emptystate-success.png" // Success image
          >
            <p>All products are currently above the low stock threshold of {lowStockThreshold} units.</p>
          </EmptyState>
        ) : (
          <DataTable
            columnContentTypes={["text", "text", "numeric"]}
            headings={["Product Title", "Warehouse", "Current Quantity"]}
            rows={rows}
            footerContent={`Showing ${lowStockItems.length} low stock items`}
          />
        )}
      </Card>
    </Page>
  );
}

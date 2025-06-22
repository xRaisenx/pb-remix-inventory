// app/routes/app.reports.tsx

import { json, type ActionFunctionArgs, type LoaderFunctionArgs } from "@remix-run/node";
import { Form, useLoaderData, useNavigation } from "@remix-run/react";
import { Page, Card, Text, Button, BlockStack, Banner } from "@shopify/polaris"; // Replaced AlphaCard with Card, Added Banner
import type { Prisma } from "@prisma/client"; // Correct Prisma import for types
import { authenticate } from "~/shopify.server";
import prisma from "~/db.server";
import { stringify } from "csv-stringify/sync"; // For CSV generation

// TypeScript Interfaces
interface ReportProductSummary {
  id: string;
  title: string;
  status: string | null;
  category: string | null; // Assuming category is on Product model
  trending: boolean | null;
  stockoutDays: number | null;
  salesVelocityFloat: number | null; // Ensure this field exists on Product model
  variants: Array<{
    price: Prisma.Decimal | null; // Prisma Decimal type
    inventoryQuantity: number | null;
  }>;
}

interface VisualSummaryData {
  totalInventoryValue: number;
  percentageLowStock: number;
  percentageCriticalStock: number;
  topTrendingProducts: Array<{ title: string; salesVelocityFloat: number | null }>;
  averageStockoutDays: number;
  inventoryByCategory: Array<{ category: string; totalQuantity: number }>;
  averageSalesVelocity: number;
}

interface LoaderData {
  visualSummary: VisualSummaryData;
  error?: string;
}

// Loader Function
export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { session } = await authenticate.admin(request);
  const shopRecord = await prisma.shop.findUnique({ where: { shop: session.shop } });
  if (!shopRecord) {
    // It's better to throw a Response for Remix to handle standard error boundaries
    throw new Response("Shop not found", { status: 404 });
  }
  const shopId = shopRecord.id;

  try {
    const productsForSummary: ReportProductSummary[] = await prisma.product.findMany({
      where: { shopId },
      select: {
        id: true,
        title: true,
        status: true,
        category: true, // Make sure 'category' is a field on your Product model
        trending: true,
        stockoutDays: true,
        salesVelocityFloat: true, // Make sure 'salesVelocityFloat' is a field
        variants: {
          select: {
            price: true,
            inventoryQuantity: true,
          }
        }
      }
    });

    let totalInventoryValue = 0;
    let lowStockCount = 0;
    let criticalStockCount = 0;
    let totalStockoutDays = 0;
    let productsWithStockoutDays = 0;
    let totalSalesVelocity = 0;
    let productsWithSalesVelocity = 0;
    const inventoryByCategoryMap = new Map<string, number>();

    productsForSummary.forEach((p: ReportProductSummary) => { // Explicit type for p
      p.variants.forEach((v: { price: Prisma.Decimal | null; inventoryQuantity: number | null }) => { // Explicit type for v
        if (v.price && v.inventoryQuantity) {
          totalInventoryValue += Number(v.price) * v.inventoryQuantity; // Convert Decimal to Number
        }
        const category = p.category || 'Uncategorized';
        const currentCategoryQty = inventoryByCategoryMap.get(category) || 0;
        inventoryByCategoryMap.set(category, currentCategoryQty + (v.inventoryQuantity || 0));
      });

      if (p.status === 'Low') lowStockCount++;
      if (p.status === 'Critical') criticalStockCount++;
      if (p.stockoutDays !== null && p.stockoutDays > 0 && isFinite(p.stockoutDays)) { // Check for finite numbers
        totalStockoutDays += p.stockoutDays;
        productsWithStockoutDays++;
      }
      if (p.salesVelocityFloat !== null) {
        totalSalesVelocity += p.salesVelocityFloat;
        productsWithSalesVelocity++;
      }
    });

    const totalProducts = productsForSummary.length;
    const visualSummary: VisualSummaryData = {
      totalInventoryValue: parseFloat(totalInventoryValue.toFixed(2)),
      percentageLowStock: totalProducts > 0 ? parseFloat(((lowStockCount / totalProducts) * 100).toFixed(1)) : 0,
      percentageCriticalStock: totalProducts > 0 ? parseFloat(((criticalStockCount / totalProducts) * 100).toFixed(1)) : 0,
      topTrendingProducts: productsForSummary
        .filter(p => p.trending)
        .sort((a, b) => (b.salesVelocityFloat || 0) - (a.salesVelocityFloat || 0))
        .slice(0, 3)
        .map(p => ({ title: p.title, salesVelocityFloat: p.salesVelocityFloat })),
      averageStockoutDays: productsWithStockoutDays > 0 ? parseFloat((totalStockoutDays / productsWithStockoutDays).toFixed(1)) : 0,
      inventoryByCategory: Array.from(inventoryByCategoryMap)
        .map(([category, totalQuantity]: [string, number]) => ({ category, totalQuantity })) // Explicit types for map
        .sort((a,b) => b.totalQuantity - a.totalQuantity),
      averageSalesVelocity: productsWithSalesVelocity > 0 ? parseFloat((totalSalesVelocity / productsWithSalesVelocity).toFixed(1)) : 0,
    };
    return json({ visualSummary });

  } catch (error) {
    console.error("Error calculating visual summary:", error);
    const defaultVisualSummary: VisualSummaryData = { // Fallback data
      totalInventoryValue: 0, percentageLowStock: 0, percentageCriticalStock: 0,
      topTrendingProducts: [], averageStockoutDays: 0, inventoryByCategory: [], averageSalesVelocity: 0,
    };
    return json({ visualSummary: defaultVisualSummary, error: "Failed to load visual summary data." }, { status: 500 });
  }
};

export const action = async ({ request }: ActionFunctionArgs) => {
  const { session } = await authenticate.admin(request);
  const shopDomain = session.shop;

  try {
    const shop = await prisma.shop.findUnique({ where: { shop: shopDomain } });
    if (!shop) {
      throw new Response("Shop not found", { status: 404 });
    }

    const products = await prisma.product.findMany({
      where: { shopId: shop.id },
      select: {
        title: true,
        vendor: true,
        status: true,
        category: true, // Ensure category exists on Product model
        trending: true,
        stockoutDays: true,
        salesVelocityFloat: true, // Ensure salesVelocityFloat exists
        lastRestockedDate: true, // Ensure lastRestockedDate exists
        variants: { // Select necessary variant details
          select: { sku: true, price: true, inventoryQuantity: true, /* title: true if needed */ }
        },
        inventory: { // For warehouse locations
          select: { warehouse: { select: { name: true, } }, quantity: true, }
        }
      },
      orderBy: { title: 'asc' }
    });

    const headers = [
      "Product Name", "SKU", "Vendor", "Category", "Price",
      "Total Inventory", "Sales Velocity (units/day)",
      "Est. Stockout (days)", "Status", "Trending",
      "Last Restocked Date", "Warehouse Location(s)"
    ];

    const csvRows = products.map(product => {
      // Explicitly type product for clarity if complex
      const totalInventory = product.variants.reduce((sum: number, v: {inventoryQuantity: number | null}) => sum + (v.inventoryQuantity || 0), 0);
      const warehouseNames = [...new Set(product.inventory
        .filter(inv => inv.quantity > 0)
        .map(inv => inv.warehouse.name))]
        .join(', ') || 'N/A';
      const firstVariant = product.variants?.[0]; // For SKU and Price

      return [
        product.title,
        firstVariant?.sku ?? 'N/A',
        product.vendor ?? 'N/A',
        product.category ?? 'N/A',
        firstVariant?.price?.toString() ?? '0.00', // Convert Decimal to string
        totalInventory,
        product.salesVelocityFloat?.toString() ?? '0',
        product.stockoutDays?.toString() ?? '0',
        product.status ?? 'N/A',
        product.trending ? 'Yes' : 'No',
        product.lastRestockedDate ? new Date(product.lastRestockedDate).toLocaleDateString() : 'N/A',
        warehouseNames,
      ];
    });

    const output = stringify([headers, ...csvRows]);

    return new Response(output, {
      headers: {
        "Content-Type": "text/csv",
        "Content-Disposition": `attachment; filename="inventory_report_${new Date().toISOString().split('T')[0]}.csv"`,
      },
    });

  } catch (error) {
    console.error("Error generating product inventory CSV:", error);
    if (error instanceof Response) throw error; // Re-throw response errors
    // For other errors, return a generic error response
    throw new Response("Failed to generate CSV report due to a server error.", { status: 500 });
  }
};


export default function AppReportsPage() {
  const { visualSummary, error } = useLoaderData<LoaderData>();
  const navigation = useNavigation();
  const isGeneratingCsv = navigation.state === "submitting" && navigation.formData?.get("_action") === "generate_csv"; // Check intent if multiple actions

  return (
    <Page title="Inventory Reports & Summaries">
      <BlockStack gap="600"> {/* Increased gap for better separation */}
        <Card>
          <BlockStack gap="400">
            <Text as="h2" variant="headingLg">Visual Inventory Summaries</Text>
            {error && (
              // Use Banner for errors for consistency with Polaris
              <Banner title="Error Loading Summary" tone="critical" onDismiss={() => { /* Can clear error state if managed locally */ }}>
                <p>{error}</p>
              </Banner>
            )}
            {!error && visualSummary && (
              <BlockStack gap="300">
                <Text as="p"><strong>Total Inventory Value:</strong> ${visualSummary.totalInventoryValue.toLocaleString(undefined, {minimumFractionDigits: 2, maximumFractionDigits: 2})}</Text>
                <Text as="p">
                  <strong>Stock Health:</strong> Low Stock: {visualSummary.percentageLowStock}% | Critical Stock: {visualSummary.percentageCriticalStock}%
                </Text>
                <Text as="p"><strong>Average Days Until Stockout:</strong> {visualSummary.averageStockoutDays} days</Text>
                <Text as="p"><strong>Average Sales Velocity:</strong> {visualSummary.averageSalesVelocity} units/day</Text>

                <div> {/* Using div for grouping; could be BlockStack */}
                  <Text as="p" fontWeight="semibold">Top Trending Products (by Sales Velocity):</Text>
                  {visualSummary.topTrendingProducts.length > 0 ? (
                    <BlockStack gap="100">
                      {visualSummary.topTrendingProducts.map(p => (
                        <Text key={p.title} as="p">&nbsp;&nbsp;- {p.title} (Velocity: {p.salesVelocityFloat?.toFixed(1) ?? 'N/A'})</Text>
                      ))}
                    </BlockStack>
                  ) : <Text as="p" tone="subdued">No trending products identified.</Text>}
                </div>

                <div> {/* Using div for grouping */}
                  <Text as="p" fontWeight="semibold">Inventory Distribution by Category:</Text>
                  {visualSummary.inventoryByCategory.length > 0 ? (
                    <BlockStack gap="100">
                      {visualSummary.inventoryByCategory.map(cat => (
                        <Text key={cat.category} as="p">&nbsp;&nbsp;- {cat.category}: {cat.totalQuantity.toLocaleString()} units</Text>
                      ))}
                    </BlockStack>
                  ) : <Text as="p" tone="subdued">No category data available.</Text>}
                </div>
              </BlockStack>
            )}
          </BlockStack>
        </Card>

        <Card>
          <BlockStack gap="400">
            <Text as="h2" variant="headingLg">Download Full Report</Text>
            <Text as="p" variant="bodyMd"> {/* Added as="p" for Text component */}
              Generate and download a full inventory report in CSV format.
            </Text>
            <Form method="post">
              {/* If you have multiple actions, you might need a hidden input for intent */}
              {/* <input type="hidden" name="_action" value="generate_csv" /> */}
              <Button submit disabled={isGeneratingCsv} variant="primary" fullWidth>
                {isGeneratingCsv ? "Generating..." : "Generate CSV Report"}
              </Button>
            </Form>
          </BlockStack>
        </Card>
      </BlockStack>
    </Page>
  );
}

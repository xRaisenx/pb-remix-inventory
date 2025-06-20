// app/routes/app.reports.tsx

import { json, type ActionFunctionArgs, type LoaderFunctionArgs } from "@remix-run/node";
import { Form, useLoaderData, useNavigation } from "@remix-run/react";
import { Page, Card, Text, Button, BlockStack, AlphaCard } from "@shopify/polaris"; // Added AlphaCard for newer designs
import type { Prisma } from "@prisma/client"; // For Prisma.Decimal type
import { authenticate } from "~/shopify.server";
import prisma from "~/db.server";
import { stringify } from "csv-stringify/sync";

// TypeScript Interfaces
interface ReportProductSummary {
  id: string;
  title: string;
  status: string | null;
  category: string | null;
  trending: boolean | null;
  stockoutDays: number | null;
  salesVelocityFloat: number | null;
  variants: Array<{
    price: Prisma.Decimal | null;
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
        category: true,
        trending: true,
        stockoutDays: true,
        salesVelocityFloat: true,
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

    productsForSummary.forEach(p => {
      p.variants.forEach(v => {
        if (v.price && v.inventoryQuantity) {
          // Ensure v.price is treated as a number for multiplication
          totalInventoryValue += Number(v.price) * v.inventoryQuantity;
        }
        const category = p.category || 'Uncategorized';
        const currentCategoryQty = inventoryByCategoryMap.get(category) || 0;
        inventoryByCategoryMap.set(category, currentCategoryQty + (v.inventoryQuantity || 0));
      });

      if (p.status === 'Low') lowStockCount++;
      if (p.status === 'Critical') criticalStockCount++;
      if (p.stockoutDays !== null && p.stockoutDays > 0) {
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
        .slice(0, 3) // Top 3
        .map(p => ({ title: p.title, salesVelocityFloat: p.salesVelocityFloat })),
      averageStockoutDays: productsWithStockoutDays > 0 ? parseFloat((totalStockoutDays / productsWithStockoutDays).toFixed(1)) : 0,
      inventoryByCategory: Array.from(inventoryByCategoryMap).map(([category, totalQuantity]) => ({ category, totalQuantity })).sort((a,b) => b.totalQuantity - a.totalQuantity),
      averageSalesVelocity: productsWithSalesVelocity > 0 ? parseFloat((totalSalesVelocity / productsWithSalesVelocity).toFixed(1)) : 0,
    };
    return json({ visualSummary });

  } catch (error) {
    console.error("Error calculating visual summary:", error);
    const defaultVisualSummary: VisualSummaryData = {
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
        id: true, // Needed for any keying if done client side, good practice
        title: true,
        vendor: true, // Added vendor to select
        status: true,
        category: true,
        trending: true,
        stockoutDays: true,
        salesVelocityFloat: true,
        lastRestockedDate: true,
        variants: {
          select: {
            sku: true,
            price: true,
            inventoryQuantity: true,
          }
        },
        inventory: { // To get warehouse information
          select: {
            warehouse: {
              select: {
                name: true,
              }
            },
            quantity: true, // To find warehouse with highest quantity if needed
          }
        }
      },
      orderBy: { title: 'asc' }
    });

    const reportPreamble = [["Inventory Report Version: 1.0"], []]; // Empty row for spacing
    const headers = [
      "Product Name", "SKU", "Vendor", "Category", "Price",
      "Total Inventory", "Sales Last Week", "Sales Velocity (units/day)",
      "Est. Stockout (days)", "Status", "Trending",
      "Last Restocked Date", "Warehouse Location(s)"
    ];

    if (products.length === 0) {
      const emptyCsvOutput = stringify([...reportPreamble, headers]);
      return new Response(emptyCsvOutput, {
        headers: {
          "Content-Type": "text/csv",
          "Content-Disposition": "attachment; filename=\"product_inventory_report_v1.0_empty.csv\"",
        },
      });
    }

    const csvRows = products.map(product => {
      const totalInventory = product.variants.reduce((sum, v) => sum + (v.inventoryQuantity || 0), 0);
      const warehouseNames = [...new Set(product.inventory.filter(inv => inv.quantity > 0).map(inv => inv.warehouse.name))].join(', ') || 'N/A';

      return [
        product.title,
        product.variants?.[0]?.sku ?? 'N/A',
        product.vendor ?? 'N/A',
        product.category ?? 'N/A',
        product.variants?.[0]?.price?.toString() ?? '0.00',
        totalInventory,
        'N/A', // Sales Last Week - placeholder
        product.salesVelocityFloat?.toString() ?? '0',
        product.stockoutDays?.toString() ?? '0',
        product.status ?? 'N/A',
        product.trending ? 'Yes' : 'No',
        product.lastRestockedDate ? new Date(product.lastRestockedDate).toLocaleDateString() : 'N/A',
        warehouseNames,
      ];
    });

    const output = stringify([...reportPreamble, headers, ...csvRows]);

    return new Response(output, {
      headers: {
        "Content-Type": "text/csv",
        "Content-Disposition": "attachment; filename=\"product_inventory_report_v1.0.csv\"",
      },
    });

  } catch (error) {
    console.error("Error generating product inventory CSV:", error);
    if (error instanceof Response) throw error;
    throw new Response("Failed to generate CSV report due to a server error.", { status: 500 });
  }
};

export default function AppReportsPage() {
  const loaderData = useLoaderData<LoaderData>();
  const navigation = useNavigation();
  // Check if the form submitted was specifically the CSV export one
  const isGeneratingCsv = navigation.state === "submitting" && navigation.formData?.get("_action") === "generate_csv";

  const { visualSummary, error } = loaderData;

  return (
    <Page title="Inventory Reports & Summaries">
      <BlockStack gap="600">
        <AlphaCard>
          <BlockStack gap="400">
            <Text as="h2" variant="headingLg">Visual Inventory Summaries</Text>
            {error && (
              <Text tone="critical">Error loading visual summaries: {error}</Text>
            )}
            {!error && visualSummary && (
              <BlockStack gap="300">
                <Text as="p"><strong>Total Inventory Value:</strong> ${visualSummary.totalInventoryValue.toLocaleString(undefined, {minimumFractionDigits: 2, maximumFractionDigits: 2})}</Text>
                <Text as="p">
                  <strong>Stock Health:</strong> Low Stock: {visualSummary.percentageLowStock}% | Critical Stock: {visualSummary.percentageCriticalStock}%
                </Text>
                <Text as="p"><strong>Average Days Until Stockout:</strong> {visualSummary.averageStockoutDays} days</Text>
                <Text as="p"><strong>Average Sales Velocity:</strong> {visualSummary.averageSalesVelocity} units/day</Text>

                <div>
                  <Text as="p" fontWeight="semibold">Top Trending Products (by Sales Velocity):</Text>
                  {visualSummary.topTrendingProducts.length > 0 ? (
                    <BlockStack gap="100">
                      {visualSummary.topTrendingProducts.map(p => (
                        <Text key={p.title} as="p">  - {p.title} (Velocity: {p.salesVelocityFloat?.toFixed(1) ?? 'N/A'})</Text>
                      ))}
                    </BlockStack>
                  ) : <Text as="p" tone="subdued">No trending products identified.</Text>}
                </div>

                <div>
                  <Text as="p" fontWeight="semibold">Inventory Distribution by Category:</Text>
                  {visualSummary.inventoryByCategory.length > 0 ? (
                    <BlockStack gap="100">
                      {visualSummary.inventoryByCategory.map(cat => (
                        <Text key={cat.category} as="p">  - {cat.category}: {cat.totalQuantity.toLocaleString()} units</Text>
                      ))}
                    </BlockStack>
                  ) : <Text as="p" tone="subdued">No category data available.</Text>}
                </div>
              </BlockStack>
            )}
          </BlockStack>
        </AlphaCard>

        <AlphaCard>
          <BlockStack gap="400">
            <Text as="h2" variant="headingLg">Download Full Report</Text>
            <Text as="p" variant="bodyMd">
              Generate and download a full inventory report in CSV format.
            </Text>
            <Form method="post">
              {/* Hidden input to differentiate if multiple actions were on the page */}
              <input type="hidden" name="_action" value="generate_csv" />
              <Button submit disabled={isGeneratingCsv} variant="primary" fullWidth>
                {isGeneratingCsv ? "Generating..." : "Generate CSV Report"}
              </Button>
            </Form>
          </BlockStack>
        </AlphaCard>
      </BlockStack>
    </Page>
  );
}

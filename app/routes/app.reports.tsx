// app/routes/app.reports.tsx

import type { ActionFunctionArgs } from "@remix-run/node";
import { Form, useNavigation } from "@remix-run/react";
import { Page, Card, Text, Button, BlockStack } from "@shopify/polaris";
import { authenticate } from "~/shopify.server";
import prisma  from "~/db.server";
import { stringify } from "csv-stringify/sync"; // Using sync version for server-side action

export const action = async ({ request }: ActionFunctionArgs) => {
  const { session } = await authenticate.admin(request);
  const shopDomain = session.shop;

  // For this action, we only expect it to be triggered by the export button.
  // No specific form data is needed other than the intent to export.

  try {
    const shop = await prisma.shop.findUnique({ where: { shop: shopDomain } });
    if (!shop) {
      // Should not happen for an authenticated request
      throw new Response("Shop not found", { status: 404 });
    }

    const inventoryRecords = await prisma.inventory.findMany({
      where: { warehouse: { shopId: shop.id } },
      include: {
        product: { select: { title: true, shopifyId: true } },
        warehouse: { select: { name: true, location: true } },
      },
      orderBy: [
        { product: { title: 'asc' } },
        { warehouse: { name: 'asc' } },
      ]
    });

    const headers = ["Product Title", "Shopify Product ID", "Warehouse Name", "Warehouse Location", "Quantity"];

    if (inventoryRecords.length === 0) {
      // Return an empty CSV with only headers if no records found.
      const emptyCsvOutput = stringify([headers]);
       return new Response(emptyCsvOutput, {
        headers: {
          "Content-Type": "text/csv",
          "Content-Disposition": "attachment; filename=\"inventory_export_empty.csv\"",
        },
      });
    }

    const csvData = inventoryRecords.map(inv => [
      inv.product.title,
      inv.product.shopifyId, // Assuming shopifyId is on Product model
      inv.warehouse.name,
      inv.warehouse.location,
      inv.quantity,
    ]);

    const output = stringify([headers, ...csvData]);

    return new Response(output, {
      headers: {
        "Content-Type": "text/csv",
        "Content-Disposition": "attachment; filename=\"inventory_export.csv\"",
      },
    });

  } catch (error) {
    console.error("Error generating inventory CSV:", error);
    // In case of error, redirect back or return an error response
    // For simplicity, re-throwing to be caught by ErrorBoundary or returning simple error
    if (error instanceof Response) throw error;
    // Consider a more user-friendly error response or redirect with error message
    throw new Response("Failed to generate CSV report due to a server error.", { status: 500 });
  }
};

// No loader needed for this page as it's action-driven for export.
// If we were to display a list of past reports, a loader would be added.

export default function AppReportsPage() {
  const navigation = useNavigation();
  const isSubmitting = navigation.state === "submitting"; // True when the form is submitted

  return (
    <Page title="Inventory Reports">
      <Card>
        <BlockStack gap="400">
          <Text as="p" variant="bodyMd">
            Generate and download a full inventory report in CSV format.
            This report includes product titles, Shopify Product IDs, warehouse names, warehouse locations, and current quantities.
          </Text>
          <Form method="post"> {/* This form triggers the action */}
            <Button disabled={isSubmitting} variant="primary" fullWidth>
              Generate Report
            </Button>
          </Form>
          {/*
            Placeholder for other report types or features:
            <Text as="h2" variant="headingMd" style={{marginTop: 'var(--p-space-600)'}}>
              Future Report Options
            </Text>
            <Text as="p" tone="subdued">
              More report types like sales summaries, historical inventory, or AI-driven forecast reports will be available here.
            </Text>
          */}
        </BlockStack>
      </Card>
    </Page>
  );
}

// app/routes/app.warehouses.tsx
import { json, redirect, type ActionFunctionArgs, type LoaderFunctionArgs } from "@remix-run/node"; // Added redirect
import { Form, useLoaderData } from "@remix-run/react"; // Added Form, useNavigation
import { Page, Card, DataTable, Text, Button, EmptyState, InlineStack } from "@shopify/polaris"; // Added InlineStack
import { authenticate } from "~/shopify.server";
import prisma  from "~/db.server";
import type { Warehouse } from "@prisma/client";

interface LoaderData {
  warehouses: Warehouse[];
  error?: string; // For displaying errors from loader
  actionError?: string; // For displaying errors from actions (if not using flash messages)
  actionSuccess?: string; // For displaying success messages (if not using flash messages)
}

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { session } = await authenticate.admin(request);
  const shopDomain = session.shop;

  // Note: Flash messages for actionError/actionSuccess are commented out for simplicity.
  // If implemented, they would be retrieved from the session here and passed to the component.

  try {
    const shop = await prisma.shop.findUnique({ where: { shop: shopDomain } });
    if (!shop) {
      return json<LoaderData>({ warehouses: [], error: "Shop not found." }, { status: 404 });
    }

    const warehouses = await prisma.warehouse.findMany({
      where: { shopId: shop.id },
      orderBy: { name: 'asc' },
    });
    return json<LoaderData>({ warehouses });
  } catch (error) {
    console.error("Error fetching warehouses:", error);
    return json<LoaderData>({ warehouses: [], error: "Failed to fetch warehouses." }, { status: 500 });
  }
};

export const action = async ({ request }: ActionFunctionArgs) => {
  const { session } = await authenticate.admin(request);
  const shopDomain = session.shop;
  const formData = await request.formData();
  const formAction = formData.get("_action") as string;

  // Note: Flash message setup is commented out. Action responses are direct JSON or redirects.

  if (formAction === "delete_warehouse") {
    const warehouseId = formData.get("warehouseId") as string;
    if (!warehouseId) {
      // This error would ideally be shown to the user, e.g., via flash message or returning it in loader data.
      // For now, it's a direct JSON response, but loader would need to handle it.
      return json({ actionError: "Warehouse ID missing for deletion." }, { status: 400});
    }

    try {
      const shop = await prisma.shop.findUnique({ where: { shop: shopDomain } });
      if (!shop) {
        return json({ actionError: "Shop not found." }, { status: 404});
      }

      const deleteResult = await prisma.warehouse.deleteMany({
        where: {
          id: warehouseId,
          shopId: shop.id, // Ensure deletion is scoped to the current shop
        },
      });

      if (deleteResult.count === 0) {
         // Warehouse either didn't exist or didn't belong to this shop.
         return json({ actionError: "Warehouse not found or you don't have permission to delete it." }, { status: 404});
      }
      // On successful deletion, redirect to refresh the list.
      return redirect("/app/warehouses");

    } catch (error) {
      console.error("Error deleting warehouse:", error);
      // This error needs to be communicated to the user.
      return json({ actionError: "Failed to delete warehouse due to a server error." }, { status: 500});
    }
  }

  return json({ actionError: "Invalid action specified." }, { status: 400});
};


export default function WarehousesPage() {
  // The loaderData might include actionError/actionSuccess if not using session-based flash messages.
  // However, after a POST action that returns JSON, Remix doesn't automatically call the loader again
  // unless it's a redirect. So, action feedback from non-redirect JSON responses from 'action'
  // would typically be handled by useActionData(), not useLoaderData() for the action's outcome.
  // For simplicity, this example primarily relies on redirects for success and direct error display for loader errors.
  const { warehouses, error /*, actionError, actionSuccess */ } = useLoaderData<LoaderData>();
  // const navigation = useNavigation(); // Useful for global loading state or optimistic UI.

  // Display loader errors
  if (error) {
    return (
      <Page title="Warehouses">
        <Card>
          <div style={{padding: 'var(--p-space-400)'}}>
            <Text as="h2" variant="headingMd" tone="critical">Error loading warehouses</Text>
            <Text as="p">{error}</Text>
          </div>
        </Card>
      </Page>
    );
  }

  // Action errors from non-redirect responses would be available via useActionData()
  // For example: const actionData = useActionData<typeof action>();
  // And then you could display actionData?.actionError if it exists.

  const rows = warehouses.map(w => [
    w.name,
    w.location,
    <InlineStack gap="200" key={w.id}>
      <Button url={`./${w.id}/edit`} size="slim">Edit</Button>
      <Form method="post" onSubmit={(event) => { if (!confirm('Are you sure you want to delete this warehouse? This cannot be undone.')) { event.preventDefault(); } }}>
        <input type="hidden" name="_action" value="delete_warehouse" />
        <input type="hidden" name="warehouseId" value={w.id} />
        <Button submit variant="secondary" tone="critical" size="slim"
          // Optimistic UI: disable button while this specific form is submitting
          // loading={navigation.state === 'submitting' && navigation.formData?.get('warehouseId') === w.id && navigation.formData?.get('_action') === 'delete_warehouse'}
        >
          Delete
        </Button>
      </Form>
    </InlineStack>
  ]);

  return (
    <Page
      title="Warehouses"
      primaryAction={{
        content: "Add Warehouse",
        url: typeof "/app/warehouses/new" === "string"
          ? "/app/warehouses/new"
          : (console.warn("[Polaris] primaryAction.url is not a string!", "/app/warehouses/new"), "")
      }}
    >
      {/*
        If using useActionData() for feedback from the delete action:
        {actionData?.actionError && <Banner title="Error" tone="critical"><p>{actionData.actionError}</p></Banner>}
        {actionData?.actionSuccess && <Banner title="Success"><p>{actionData.actionSuccess}</p></Banner>}
      */}
      <Card>
        {warehouses.length === 0 ? (
          <EmptyState
            heading="No warehouses yet"
            action={{
              content: "Add Warehouse",
              url: typeof "/app/warehouses/new" === "string"
                ? "/app/warehouses/new"
                : (console.warn("[Polaris] EmptyState.action.url is not a string!", "/app/warehouses/new"), "")
            }}
            image="https://cdn.shopify.com/s/files/1/0262/4074/files/emptystate-files.png"
          >
            <p>Create and manage your local warehouses to track inventory across different locations.</p>
          </EmptyState>
        ) : (
          <DataTable
            columnContentTypes={["text", "text", "text"]}
            headings={["Warehouse Name", "Location Address", "Actions"]}
            rows={rows}
            footerContent={`Showing ${warehouses.length} warehouses`}
          />
        )}
      </Card>
    </Page>
  );
}

// app/routes/app.warehouses.new.tsx

import { json, redirect, type ActionFunctionArgs, type LoaderFunctionArgs } from "@remix-run/node";
import { Form, useActionData, useLoaderData, useNavigation } from "@remix-run/react";
import { Page, Card, TextField, Button, BlockStack, Banner, Select } from "@shopify/polaris";
import { authenticate } from "~/shopify.server";
import prisma from "~/db.server";
import { z } from "zod";
import type { PrismaClient } from "@prisma/client";

// Zod schema for validation
const WarehouseSchema = z.object({
  name: z.string().min(1, { message: "Warehouse name cannot be empty." }),
  location: z.string().min(1, { message: "Location address cannot be empty." }),
  shopifyLocationGid: z.string().optional().or(z.literal('')),
});

interface ShopifyLocationOption {
  id: string;
  name: string;
}

interface LoaderData {
  shopifyLocations: ShopifyLocationOption[];
  error?: string;
}

interface ActionData {
  errors?: {
    name?: string[];
    location?: string[];
    shopifyLocationGid?: string[];
    form?: string[]; // For general form errors
  };
}

export const loader = async ({ request }: LoaderFunctionArgs): Promise<ReturnType<typeof json<LoaderData>>> => {
  const { admin } = await authenticate.admin(request);

  let shopifyLocations: ShopifyLocationOption[] = [];
  try {
    const response = await admin.graphql(
      `#graphql
      query shopifyLocations {
        locations(first: 250) {
          edges { node { id name } }
        }
      }`
    );
    const locationsData = await response.json();
    if (locationsData.data?.locations?.edges) {
      shopifyLocations = locationsData.data.locations.edges.map((edge: { node: ShopifyLocationOption }) => edge.node);
    }
  } catch (error) {
    console.error("Failed to fetch Shopify locations for linking:", error);
    return json({ shopifyLocations: [], error: "Could not load Shopify Locations. Please try again." }, { status: 500 });
  }

  return json({ shopifyLocations });
};

export const action = async ({ request }: ActionFunctionArgs) => {
  const { session } = await authenticate.admin(request);
  const shopDomain = session.shop;
  const formData = await request.formData();

  const name = formData.get("name");
  const location = formData.get("location");
  const shopifyLocationGid = formData.get("shopifyLocationGid");

  const validationResult = WarehouseSchema.safeParse({
    name,
    location,
    shopifyLocationGid,
  });

  if (!validationResult.success) {
    const fieldErrors = validationResult.error.flatten().fieldErrors;
    return json<ActionData>({ errors: fieldErrors as ActionData['errors'] }, { status: 400 });
  }

  const { name: validatedName, location: validatedLocation, shopifyLocationGid: validatedShopifyLocationGid } = validationResult.data;

  try {
    const shop = await prisma.shop.findUnique({ where: { shop: shopDomain } });
    if (!shop) {
      return json<ActionData>({ errors: { form: ["Shop not found."] } }, { status: 404 });
    }

    const existingWarehouseByName = await prisma.warehouse.findFirst({
      where: { shopId: shop.id, name: validatedName }
    });
    if (existingWarehouseByName) {
      return json<ActionData>({ errors: { name: ["A warehouse with this name already exists."] } }, { status: 400 });
    }

    if (validatedShopifyLocationGid && validatedShopifyLocationGid !== "") {
      const existingWarehouseByShopifyGid = await prisma.warehouse.findFirst({
        where: { shopifyLocationGid: validatedShopifyLocationGid, shopId: shop.id }
      });
      if (existingWarehouseByShopifyGid) {
        return json<ActionData>({ errors: { shopifyLocationGid: ["This Shopify Location is already linked to another warehouse for this shop."] } }, { status: 400 });
      }
    }

    await prisma.warehouse.create({
      data: {
        id: validatedName,
        shopId: shop.id,
        name: validatedName,
        location: validatedLocation,
        shopifyLocationGid: validatedShopifyLocationGid === "" ? null : validatedShopifyLocationGid,
        updatedAt: new Date(),
      },
    });
    return redirect("/app/warehouses");
  } catch (error: unknown) {
    console.error("Error creating warehouse:", error);
    if (error instanceof Error && error.message.includes('P2002')) {
      return json<ActionData>({ errors: { form: ["Unique constraint violation. A warehouse with this name or Shopify Location may already exist."] } }, { status: 400 });
    }
    return json<ActionData>({ errors: { form: ["An unexpected error occurred. Please try again."] } }, { status: 500 });
  }
};

export default function NewWarehouse() {
  const { shopifyLocations, error: loaderError } = useLoaderData<LoaderData>();
  const actionData = useActionData<ActionData>();
  const navigation = useNavigation();
  const isSubmitting = navigation.state === "submitting";

  return (
    <Page
      title="New Warehouse"
      backAction={{ content: "Warehouses", url: "/app/warehouses" }}
    >
      <Card>
        {/* The Remix Form component handles the POST. No onSubmit is needed. */}
        <Form method="post">
          <BlockStack gap="400">
            {actionData?.errors?.form && (
              <Banner title="Error" tone="critical">
                <p>{Array.isArray(actionData.errors.form) ? actionData.errors.form.join(", ") : actionData.errors.form}</p>
              </Banner>
            )}
            <TextField
              label="Warehouse Name"
              name="name"
              value=""
              error={actionData?.errors?.name?.join(", ")}
              autoComplete="off"
            />
            <TextField
              label="Location Address"
              name="location"
              value=""
              error={actionData?.errors?.location?.join(", ")}
              autoComplete="off"
              multiline={3}
            />
            <Select
              label="Link to Shopify Location (Optional)"
              name="shopifyLocationGid"
              options={[
                { label: "None (Local Warehouse Only)", value: "" },
                ...(shopifyLocations?.map(loc => ({ label: loc.name, value: loc.id })) || [])
              ]}
              value=""
              error={actionData?.errors?.shopifyLocationGid?.join(", ")}
              helpText="Link to an existing Shopify Location to enable inventory syncing."
              disabled={!!loaderError}
            />
            {loaderError && <Banner tone="critical">{loaderError}</Banner>}
            <Button submit loading={isSubmitting} variant="primary">
              Save Warehouse
            </Button>
          </BlockStack>
        </Form>
      </Card>
    </Page>
  );
}

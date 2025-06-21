// app/routes/app.warehouses.new.tsx

import { json, redirect, type ActionFunctionArgs, type LoaderFunctionArgs } from "@remix-run/node";
// Corrected: Removed useNavigate, added useNavigation, Form, useActionData
import { Form, useActionData, useLoaderData, useNavigation } from "@remix-run/react";
// Corrected: Added BlockStack, Banner, Select from Polaris
import { Page, Card, TextField, Button, BlockStack, Banner, Select } from "@shopify/polaris";
import { authenticate } from "~/shopify.server";
import { Prisma } from "@prisma/client";
import prisma from "~/db.server";
import { z } from "zod";

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
  // success?: boolean; // Not strictly needed if redirecting on success
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

  // Extract values directly from formData for Zod parsing
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
        where: { shopifyLocationGid: validatedShopifyLocationGid, shopId: shop.id } // Ensure it's for the same shop if GID isn't globally unique in your logic
      });
      if (existingWarehouseByShopifyGid) {
        return json<ActionData>({ errors: { shopifyLocationGid: ["This Shopify Location is already linked to another warehouse for this shop."] } }, { status: 400 });
      }
    }

    await prisma.warehouse.create({
      data: {
        shopId: shop.id,
        name: validatedName,
        location: validatedLocation,
        shopifyLocationGid: validatedShopifyLocationGid === "" ? null : validatedShopifyLocationGid,
      },
    });
    return redirect("/app/warehouses");
  } catch (error) {
    console.error("Error creating warehouse:", error);
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
      const targetFields = Array.isArray(error.meta?.target) ? error.meta.target : [];
      if (targetFields.includes('shopifyLocationGid') && targetFields.includes('shopId')) { // Example for composite unique constraint
         return json<ActionData>({ errors: { shopifyLocationGid: ["This Shopify Location is already linked (DB constraint)."] } }, { status: 400 });
      } else if (targetFields.includes('name') && targetFields.includes('shopId')) {
         return json<ActionData>({ errors: { name: ["Warehouse name conflict (DB constraint)."] } }, { status: 400 });
      }
    }
    return json<ActionData>({ errors: { form: ["An unexpected error occurred. Please try again."] } }, { status: 500 });
  }
};

export default function NewWarehouse() {
  // Corrected: Type assertion for useLoaderData
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
        {/* FIX: Removed the unnecessary onSubmit handler from the Form */}
        <Form method="post">
          <BlockStack gap="400">
            {actionData?.errors?.form && (
              <Banner title="Error" tone="critical">
                {/* Ensure errors.form is an array before join, or handle if it's a single string */}
                <p>{Array.isArray(actionData.errors.form) ? actionData.errors.form.join(", ") : actionData.errors.form}</p>
              </Banner>
            )}
            <TextField
              label="Warehouse Name"
              name="name"
              defaultValue="" // Keep defaultValue for uncontrolled component behavior in Remix Form
              error={actionData?.errors?.name ? (Array.isArray(actionData.errors.name) ? actionData.errors.name.join(", ") : actionData.errors.name) : undefined}
              autoComplete="off"
            />
            <TextField
              label="Location Address"
              name="location"
              defaultValue=""
              error={actionData?.errors?.location ? (Array.isArray(actionData.errors.location) ? actionData.errors.location.join(", ") : actionData.errors.location) : undefined}
              autoComplete="off"
              multiline={3}
            />
            <Select
              label="Link to Shopify Location (Optional)"
              name="shopifyLocationGid"
              options={[
                { label: "None (Local Warehouse Only)", value: "" }, // Ensure value is string for Select
                ...(shopifyLocations?.map(loc => ({ label: loc.name, value: loc.id })) || [])
              ]}
              defaultValue=""
              error={actionData?.errors?.shopifyLocationGid ? (Array.isArray(actionData.errors.shopifyLocationGid) ? actionData.errors.shopifyLocationGid.join(", ") : actionData.errors.shopifyLocationGid) : undefined}
              helpText="Link to an existing Shopify Location to enable inventory syncing."
              disabled={!!loaderError} // Use loaderError to disable
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

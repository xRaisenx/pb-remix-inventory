// app/routes/app.warehouses.$warehouseId.edit.tsx

import React from "react";
import { json, redirect, type ActionFunctionArgs, type LoaderFunctionArgs } from "@remix-run/node";
import { Form, useActionData, useLoaderData, useNavigate, useNavigation, useParams, useRouteError } from "@remix-run/react";
import { Page, Card, TextField, Button, Banner, BlockStack, Text, Spinner, EmptyState, Select } from "@shopify/polaris"; // Added Select
import { authenticate } from "~/shopify.server";
import prisma  from "~/db.server";
import { z } from "zod";
import type { Warehouse } from "@prisma/client";

// Zod schema for validation
const WarehouseSchema = z.object({
  name: z.string().min(1, { message: "Warehouse name cannot be empty." }),
  location: z.string().min(1, { message: "Location address cannot be empty." }),
  shopifyLocationGid: z.string().optional().or(z.literal('')), // Added
});

interface ShopifyLocationOption {
  id: string;
  name: string;
}

interface LoaderData {
  warehouse: Warehouse;
  shopifyLocations: ShopifyLocationOption[];
  loaderError?: string; // For errors fetching Shopify locations specifically
}

interface ActionData {
  errors?: {
    name?: string[];
    location?: string[];
    shopifyLocationGid?: string[]; // Added
    form?: string[];
  };
}

export const loader = async ({ request, params }: LoaderFunctionArgs): Promise<ReturnType<typeof json<LoaderData>>> => {
  const { admin } = await authenticate.admin(request); // admin token for GraphQL
  const warehouseId = params.warehouseId;

  if (!warehouseId) {
    throw new Response("Warehouse ID parameter is missing.", { status: 400 });
  }

  const warehouse = await prisma.warehouse.findUnique({
    where: { id: warehouseId },
  });

  if (!warehouse) {
    throw new Response("Warehouse not found.", { status: 404 });
  }

  let shopifyLocations: ShopifyLocationOption[] = [];
  let loaderError: string | undefined = undefined;
  try {
    const response = await admin.graphql(
      `#graphql
      query shopifyLocations {
        locations(first: 250) { # Shopify limits to 250 by default
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
    loaderError = "Could not load Shopify Locations. Linking will be unavailable. Please try again later.";
    // Proceed with loading the page but indicate that locations couldn't be fetched.
  }

  return json({ warehouse, shopifyLocations, loaderError });
};

export const action = async ({ request, params }: ActionFunctionArgs) => {
  const { admin, session } = await authenticate.admin(request);
  const shopDomain = session.shop;
  const warehouseId = params.warehouseId;
  const formData = await request.formData();

  if (!warehouseId) {
    return json<ActionData>({ errors: { form: ["Warehouse ID missing for update."] } }, { status: 400 });
  }

  const name = formData.get("name") as string;
  const location = formData.get("location") as string;
  const shopifyLocationGid = formData.get("shopifyLocationGid") as string; // Added

  const validationResult = WarehouseSchema.safeParse({ name, location, shopifyLocationGid });

  if (!validationResult.success) {
    const fieldErrors = validationResult.error.flatten().fieldErrors;
    return json<ActionData>({ errors: fieldErrors as ActionData['errors'] }, { status: 400 });
  }

  const { name: validatedName, location: validatedLocation, shopifyLocationGid: validatedShopifyLocationGid } = validationResult.data;

  try {
    const shop = await prisma.shop.findUnique({ where: { shop: shopDomain } });
    if (!shop) {
      return json<ActionData>({ errors: { form: ["Shop not found. Cannot update warehouse."] } }, { status: 404 });
    }

    // Ensure the warehouse being updated belongs to the current shop
    const warehouseToUpdate = await prisma.warehouse.findFirst({
      where: { id: warehouseId, shopId: shop.id }
    });
    if (!warehouseToUpdate) {
        return json<ActionData>({ errors: { form: ["Warehouse not found or access denied."] } }, { status: 404 });
    }

    // Check for duplicate warehouse name for the same shop, excluding the current warehouse
    const existingWarehouseByName = await prisma.warehouse.findFirst({
      where: {
        shopId: shop.id,
        name: validatedName,
        NOT: { id: warehouseId }
      }
    });
    if (existingWarehouseByName) {
      return json<ActionData>({ errors: { name: ["Another warehouse with this name already exists."] } }, { status: 400 });
    }

    // Check if shopifyLocationGid is already linked to another warehouse, if provided
    if (validatedShopifyLocationGid && validatedShopifyLocationGid !== "") {
        const existingWarehouseByLocationGid = await prisma.warehouse.findFirst({
            where: {
                shopifyLocationGid: validatedShopifyLocationGid,
                NOT: { id: warehouseId } // Exclude self
            }
        });
        if (existingWarehouseByLocationGid) {
            return json<ActionData>({ errors: { shopifyLocationGid: ["This Shopify Location is already linked to another local warehouse."] } }, { status: 400 });
        }
    }

    await prisma.warehouse.update({
      where: { id: warehouseId },
      data: {
        name: validatedName,
        location: validatedLocation,
        ...(validatedShopifyLocationGid && validatedShopifyLocationGid !== "" ? { shopifyLocationGid: validatedShopifyLocationGid } : {}),
      },
    });
    return redirect("/app/warehouses");
  } catch (error: any) {
    console.error("Error updating warehouse:", error);
    if (error.code === 'P2002' && error.meta?.target?.includes('shopifyLocationGid')) {
        return json<ActionData>({ errors: { shopifyLocationGid: ["This Shopify Location is already linked (DB constraint)."] } }, { status: 400 });
    }
    return json<ActionData>({ errors: { form: ["Failed to update warehouse. Please try again."] } }, { status: 500 });
  }
};

export default function EditWarehousePage() {
  const { warehouse, shopifyLocations, loaderError } = useLoaderData<LoaderData>();
  const actionData = useActionData<ActionData>();
  const navigate = useNavigate();
  const navigation = useNavigation();
  const isSubmitting = navigation.state === "submitting";

  const locationOptions = [
    { label: "None (Local Warehouse Only)", value: "" },
    ...(shopifyLocations?.map(loc => ({ label: loc.name, value: loc.id })) || [])
  ];

  // Add state to control the Select value
  const [selectedShopifyLocationGid, setSelectedShopifyLocationGid] = React.useState<string>(
    warehouse.shopifyLocationGid ?? ""
  );

  React.useEffect(() => {
    setSelectedShopifyLocationGid(warehouse.shopifyLocationGid ?? "");
  }, [warehouse.shopifyLocationGid]);

  return (
    <Page
      title={`Edit Warehouse: ${warehouse.name}`}
      backAction={{ content: "Warehouses", onAction: () => navigate("/app/warehouses") }}
    >
      <Card>
        <BlockStack gap="400">
          {loaderError && (
            <Banner title="Error loading Shopify Locations" tone="warning">
              <p>{loaderError}</p>
            </Banner>
          )}
          {actionData?.errors?.form && (
            <Banner title="Error updating warehouse" tone="critical">
              <Text as="p">{actionData.errors.form.join(", ")}</Text>
            </Banner>
          )}
          <Form method="post" id={`edit-warehouse-form-${warehouse.id}`}>
            <BlockStack gap="400">
              <TextField
                label="Warehouse Name"
                name="name"
                value={warehouse.name}
                autoComplete="off"
                error={actionData?.errors?.name}
              />
              <TextField
                label="Location Address"
                name="location"
                value={warehouse.location}
                autoComplete="off"
                multiline={3}
                error={actionData?.errors?.location}
              />
              <Select
                label="Link to Shopify Location (Optional)"
                name="shopifyLocationGid"
                options={locationOptions}
                value={selectedShopifyLocationGid}
                onChange={setSelectedShopifyLocationGid}
                helpText="Link this local warehouse to an existing Shopify Location to enable inventory syncing for products managed at that location."
                disabled={!shopifyLocations || shopifyLocations.length === 0 && !loaderError} // Disable if no locations and no error, or if there is a loader error
                error={actionData?.errors?.shopifyLocationGid?.join(", ")}
              />
              <Button submit loading={isSubmitting} variant="primary" fullWidth>
                Save Changes
              </Button>
            </BlockStack>
          </Form>
        </BlockStack>
      </Card>
    </Page>
  );
}

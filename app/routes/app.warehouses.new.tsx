// app/routes/app.warehouses.new.tsx

import { json, redirect, type ActionFunctionArgs, type LoaderFunctionArgs } from "@remix-run/node";
import { Form, useActionData, useLoaderData, useNavigate, useNavigation } from "@remix-run/react";
import { Page, Card, TextField, Button, Banner, Select } from "@shopify/polaris"; // Added Select
import { authenticate } from "~/shopify.server";
import { Prisma } from "@prisma/client";
import prisma  from "~/db.server";
import { z } from "zod";

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
  shopifyLocations: ShopifyLocationOption[];
  error?: string; // For loader-specific errors
}

interface ActionData {
  errors?: {
    name?: string[];
    location?: string[];
    shopifyLocationGid?: string[]; // Added
    form?: string[];
  };
  success?: boolean;
}

export const loader = async ({ request }: LoaderFunctionArgs): Promise<ReturnType<typeof json<LoaderData>>> => {
  const { admin } = await authenticate.admin(request); // Session not strictly needed if only fetching general locations

  let shopifyLocations: ShopifyLocationOption[] = [];
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
    // It's important to decide how to handle this. For now, we'll return an error message.
    // Alternatively, allow page to load without locations, disabling the select.
    return json({ shopifyLocations: [], error: "Could not load Shopify Locations. Please try again." }, { status: 500 });
  }

  return json({ shopifyLocations });
};

export const action = async ({ request }: ActionFunctionArgs) => {
  const { session } = await authenticate.admin(request);
  const shopDomain = session.shop;
  const formData = await request.formData();

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
      return json<ActionData>({ errors: { form: ["Shop not found."] } }, { status: 404 });
    }

    // Check for duplicate warehouse name for the same shop
    const existingWarehouseByName = await prisma.warehouse.findFirst({
      where: { shopId: shop.id, name: validatedName }
    });
    if (existingWarehouseByName) {
      return json<ActionData>({ errors: { name: ["A warehouse with this name already exists."] } }, { status: 400 });
    }

    // Check if shopifyLocationGid is already linked, if provided
    if (validatedShopifyLocationGid && validatedShopifyLocationGid !== "") {
        const existingWarehouse = await prisma.warehouse.findFirst({
          where: { shopifyLocationGid: validatedShopifyLocationGid }
        });
        if (existingWarehouse) {
            return json<ActionData>({ errors: { shopifyLocationGid: ["This Shopify Location is already linked to another warehouse."] } }, { status: 400 });
        }
    }

    await prisma.warehouse.create({
      data: {
        shopId: shop.id,
        name: validatedName,
        location: validatedLocation,
        shopifyLocationGid: validatedShopifyLocationGid || "",
      },
    });
    return redirect("/app/warehouses");
  } catch (error: Prisma.PrismaClientKnownRequestError | any) {
    console.error("Error creating warehouse:", error);
        
    // Handle Prisma unique constraint violation for shopifyLocationGid
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
      const targetFields = Array.isArray(error.meta?.target) ? error.meta.target : [];
      if (targetFields.includes('shopifyLocationGid')) {
        return json<ActionData>({ 
          errors: { 
            shopifyLocationGid: ["This Shopify Location is already linked (DB constraint)."] 
          } 
        }, { status: 400 });
      }
    }
    // If not a known Prisma error, return a generic error
    return json<ActionData>({ errors: { form: ["An unexpected error occurred. Please try again."] } }, { status: 500 });
  }
};

export default function NewWarehouse() {
  const { shopifyLocations, error } = useLoaderData() as LoaderData;
  const actionData = useActionData<ActionData>();
  const navigate = useNavigate();
  const navigation = useNavigation();

  return (
    <Page title="New Warehouse">
      <Card>
        <Form
          method="post"
          onSubmit={(event) => {
            // Client-side navigation to /app/warehouses on successful submit
            const form = event.currentTarget;
            if (actionData?.success) {
              form.reset();
              navigate("/app/warehouses");
            }
          }}
        >
          <TextField
            label="Warehouse Name"
            name="name"
            error={actionData?.errors?.name}
            autoComplete="off"
          />
          <TextField
            label="Location Address"
            name="location"
            error={actionData?.errors?.location}
            autoComplete="off"
          />
          <Select
            label="Shopify Location"
            name="shopifyLocationGid"
            options={[{ label: 'Select a location', value: '' }, ...shopifyLocations.map(loc => ({ label: loc.name, value: loc.id }))]}
            error={actionData?.errors?.shopifyLocationGid}
            placeholder="Optional"
          />
          {error && <Banner tone="critical">{error}</Banner>}
          <Button submit loading={navigation.state === "submitting"}>Save Warehouse</Button>
        </Form>
      </Card>
    </Page>
  );
}

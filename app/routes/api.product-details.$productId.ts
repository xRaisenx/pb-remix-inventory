// app/routes/api.product-details.$productId.ts
import { json, type LoaderFunctionArgs } from "@remix-run/node";
import { authenticate } from "~/shopify.server";
import prisma from "~/db.server";
import type { ProductForTable } from "~/routes/app.products"; // Import the target type
import type { Decimal } from "@prisma/client/runtime/library";

// Define a type for the selected inventory fields
type SelectedInventory = {
    quantity: number;
    warehouseId: string;
    Warehouse: {
        shopifyLocationGid: string | null;
    } | null;
};

// Define a type for the selected variant fields
type SelectedVariant = {
    id: string;
    shopifyId: string | null;
    title: string | null;
    sku: string | null;
    price: Decimal | null;
    inventoryItemId: string | null;
    Inventory: SelectedInventory[];
};

export const loader = async ({ request, params }: LoaderFunctionArgs) => {
  await authenticate.admin(request); // Ensures the request is authenticated
  const shopifyProductId = params.productId;

  if (!shopifyProductId || !shopifyProductId.startsWith("gid://shopify/Product/")) {
    return json({ error: "Invalid Shopify Product ID format." }, { status: 400 });
  }

  try {
    // Fetch the product from your local database using the unique Shopify ID
    const productFromDB = await prisma.product.findUnique({
      where: { shopifyId: shopifyProductId },
      include: {
        Variant: true,
        Inventory: {
          include: {
            Warehouse: {
              select: { shopifyLocationGid: true }
            }
          }
        }
      },
    });

    if (!productFromDB) {
      return json({ error: "Product not found in local database." }, { status: 404 });
    }

    // Calculate total inventory by summing all product inventories
    let totalInventory = 0;
    const inventoryByLocation: ProductForTable['inventoryByLocation'] = {};
    productFromDB.Inventory.forEach((inv: any) => {
      totalInventory += inv.quantity;
      inventoryByLocation[inv.warehouseId] = {
        quantity: inv.quantity,
        shopifyLocationGid: inv.Warehouse?.shopifyLocationGid ?? null
      };
    });
    const firstVariant = productFromDB.Variant?.[0];

    // The inventoryByLocation is now constructed within the variant loop above

    const productForTable: ProductForTable = {
      id: productFromDB.id, // Prisma Product ID
      shopifyId: productFromDB.shopifyId, // Shopify Product GID
      title: productFromDB.title,
      vendor: productFromDB.vendor || "",
      price: firstVariant?.price?.toString() ?? '0.00',
      sku: firstVariant?.sku ?? 'N/A',
      inventory: totalInventory, // This is total across locations IF 'inventory' field means that.
                                 // Or it could be total of variant.inventoryQuantity if that's the source of truth for "overall"
      salesVelocity: productFromDB.salesVelocityFloat, // From Prisma model
      stockoutDays: productFromDB.stockoutDays,       // From Prisma model
      status: productFromDB.status,                   // From Prisma model
      variantsForModal: productFromDB.Variant.map((v: any) => ({
        id: v.id, // Prisma Variant ID
        shopifyVariantId: v.shopifyId ?? '', // Shopify Variant GID
        title: v.title ?? v.sku ?? 'Variant', // Fallback for variant title
        sku: v.sku,
        price: v.price?.toString(),
        // No direct inventory relation, so sum inventory for this variant if possible
        inventoryQuantity: productFromDB.Inventory
          .filter((inv: any) => inv.inventoryItemId === v.inventoryItemId)
          .reduce((sum: number, inv: any) => sum + inv.quantity, 0),
        inventoryItemId: v.inventoryItemId,     // Shopify InventoryItem GID
      })),
      inventoryByLocation: inventoryByLocation,
    };

    // Return the complete object under the "product" key as per user's last snippet for app.inventory.tsx
    return json({ product: productForTable });

  } catch (error) {
    console.error("Error fetching product details for modal:", error);
    // It's good practice to not expose raw error messages in production if they might contain sensitive info
    return json({ error: "An unexpected error occurred while fetching product details." }, { status: 500 });
  }
};

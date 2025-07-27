import { json, redirect, type ActionFunctionArgs, type LoaderFunctionArgs } from "@remix-run/node";
import { useLoaderData, useFetcher, useRouteError } from "@remix-run/react";
import { authenticate } from '../shopify.server';
import prisma from "~/db.server";
import { syncProductsAndInventory } from "~/services/shopify.sync.server";
import { PlanetBeautyLayout } from "~/components/PlanetBeautyLayout";
import { Metrics } from "~/components/Metrics";
import { TrendingProducts } from "~/components/TrendingProducts";
import { ProductAlerts } from "~/components/ProductAlerts";
import { DashboardVisualizations } from "~/components/DashboardVisualizations";
import { AIAssistant } from "~/components/AIAssistant";
import { QuickActions } from "~/components/QuickActions";
import type { DashboardAlertProduct, DashboardTrendingProduct } from "~/types";
import { boundary } from "@shopify/shopify-app-remix/server";

// Hybrid: fetch product images/details from Shopify GraphQL
async function fetchShopifyProducts(session: any, limit = 5) {
  const query = `{
    products(first: ${limit}) {
      nodes {
        id
        title
        images(first: 1) { edges { node { src } } }
        variants(first: 10) { edges { node { id, title, sku, price } } }
      }
    }
  }`;
  const response = await session.admin.graphql(query);
  const data = await response.json();
  return data.data.products.nodes.map((p: any) => ({
    id: p.id,
    title: p.title,
    image: p.images?.edges?.[0]?.node?.src || null,
    variants: p.variants.edges.map((v: any) => v.node)
  }));
}

export const loader = async ({ request }: LoaderFunctionArgs) => {
  try {
    const { session } = await authenticate.admin(request);
    if (!session || !session.shop) {
      return json({ initialSyncCompleted: true, storeName: "stub", totalProducts: 0, lowStockItemsCount: 0, totalInventoryUnits: 0, trendingProducts: [], lowStockProductsForAlerts: [], highSalesTrendProducts: [] });
    }
    const shopDomain = session.shop;
    const shopRecord = await prisma.shop.findUnique({ where: { shop: shopDomain } });
    if (!shopRecord) {
      return json({ initialSyncCompleted: true, storeName: shopDomain.replace(".myshopify.com", ""), totalProducts: 0, lowStockItemsCount: 0, totalInventoryUnits: 0, trendingProducts: [], lowStockProductsForAlerts: [], highSalesTrendProducts: [] });
    }
    if (!shopRecord.initialSyncCompleted) {
      return json({ initialSyncCompleted: false, storeName: shopDomain.replace(".myshopify.com", "") });
    }
    
    // Hybrid: fetch product images/details from Shopify, analytics from Prisma
    const [
      totalProducts,
      lowStockItemsCount,
      totalInventoryUnits,
      shopifyProducts
    ] = await Promise.all([
      prisma.product.count({ where: { shopId: shopDomain } }),
      prisma.product.count({ 
        where: { 
          shopId: shopDomain,
          // Count products with at least one variant with low inventoryQuantity
          Variant: { some: { inventoryQuantity: { lt: 5 } } }
        } 
      }),
      (async () => {
        const variants = await prisma.variant.findMany({
          where: { Product: { shopId: shopDomain } },
          select: { inventoryQuantity: true }
        });
        return variants.reduce((sum, v) => sum + (v.inventoryQuantity ?? 0), 0);
      })(),
      fetchShopifyProducts(session, 5)
    ]);

    return json({
      initialSyncCompleted: true,
      storeName: shopDomain.replace(".myshopify.com", ""),
      totalProducts,
      lowStockItemsCount,
      totalInventoryUnits,
      trendingProducts: shopifyProducts,
      lowStockProductsForAlerts: shopifyProducts,
      highSalesTrendProducts: shopifyProducts
    });
  } catch (error) {
    console.error("[LOADER ERROR] /app._index loader failed:", error);
    throw error;
  }
};

export async function action({ request }: ActionFunctionArgs) {
  const { session } = await authenticate.admin(request);
  if (!session || !session.shop) {
    throw redirect("/auth/login");
  }
  const formData = await request.formData();

  if (formData.get("intent") === "start_initial_sync") {
    try {
      await syncProductsAndInventory(session.shop, session);
      await prisma.shop.update({
        where: { shop: session.shop },
        data: { initialSyncCompleted: true },
      });
      return redirect("/app");
    } catch (error) {
      console.error("Initial sync failed:", error);
      return json({ error: "The initial data sync failed. Please try again or contact support." }, { status: 500 });
    }
  }
  return json({ error: "Invalid action" }, { status: 400 });
}

// Add error boundary for embedded app
export function ErrorBoundary() {
  return boundary.error(useRouteError());
}

export default function DashboardIndex() {
  const loaderData = useLoaderData<typeof loader>();
  const fetcher = useFetcher<typeof action>();

  const isSyncing = fetcher.state === 'submitting';

  if (!loaderData.initialSyncCompleted) {
    return (
      <PlanetBeautyLayout>
        <div className="pb-card">
          <div className="pb-space-y-4">
            <h2 className="pb-text-xl pb-font-medium">Initial Data Sync Required</h2>
            <p>
              To get started, we need to perform an initial sync of your products and inventory from Shopify.
              This may take a few minutes depending on the size of your store.
            </p>
            {isSyncing ? (
              <div className="pb-flex pb-flex-col pb-items-center pb-space-y-4">
                <div className="spinner"></div>
                <p className="pb-text-sm">Sync in progress... Please don't close this page.</p>
              </div>
            ) : (
              <fetcher.Form method="post">
                <input type="hidden" name="intent" value="start_initial_sync" />
                <button 
                  type="submit" 
                  className="pb-btn-primary" 
                  disabled={isSyncing}
                >
                  Start Initial Sync
                </button>
              </fetcher.Form>
            )}
            {fetcher.data?.error && !isSyncing && (
              <div className="pb-alert-critical">{fetcher.data.error}</div>
            )}
          </div>
        </div>
      </PlanetBeautyLayout>
    );
  }

  const isDashboardData = (data: any): data is {
    initialSyncCompleted: boolean;
    totalProducts: number;
    lowStockItemsCount: number;
    totalInventoryUnits: number;
    trendingProducts: DashboardTrendingProduct[];
    lowStockProductsForAlerts: DashboardAlertProduct[];
    highSalesTrendProducts: DashboardAlertProduct[];
    storeName: string;
  } => data && data.initialSyncCompleted === true && typeof data.totalProducts === 'number';

  if (!isDashboardData(loaderData)) {
    return null;
  }

  return (
    <PlanetBeautyLayout>
      <div className="pb-space-y-6">
        <Metrics
          totalProducts={loaderData.totalProducts}
          lowStockItemsCount={loaderData.lowStockItemsCount}
          totalInventoryUnits={loaderData.totalInventoryUnits}
        />
        <DashboardVisualizations />
        <ProductAlerts
          lowStockProducts={loaderData.lowStockProductsForAlerts}
          highSalesTrendProducts={loaderData.highSalesTrendProducts}
        />
        <TrendingProducts products={loaderData.trendingProducts} />
        <div className="pb-grid pb-grid-cols-1 pb-grid-md-cols-2 pb-gap-6">
          <QuickActions />
          <AIAssistant shopId={loaderData.storeName} />
        </div>
      </div>
    </PlanetBeautyLayout>
  );
}
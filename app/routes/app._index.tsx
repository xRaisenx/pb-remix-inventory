import { json, redirect, type ActionFunctionArgs, type LoaderFunctionArgs } from "@remix-run/node";
import { useLoaderData, useFetcher } from "@remix-run/react";
import { authenticate } from "~/shopify.server";
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

export const loader = async ({ request }: LoaderFunctionArgs) => {
  try {
    const { session } = await authenticate.admin(request);
    const { shop: shopDomain } = session;
    const shopRecord = await prisma.shop.findUnique({ where: { shop: shopDomain } });
    if (!shopRecord) throw new Response("Shop not found", { status: 404 });

    if (!shopRecord.initialSyncCompleted) {
      return json({ initialSyncCompleted: false, storeName: shopDomain.replace(".myshopify.com", "") });
    }

    const { id: shopId } = shopRecord;
    const storeName = shopDomain.replace(".myshopify.com", "");

    const totalProducts = await prisma.product.count({ where: { shopId } });
    const lowStockItemsCount = await prisma.product.count({
      where: { shopId, status: { in: ["Low", "Critical"] } },
    });

    const variants: Array<{ inventoryQuantity: number | null }> = await prisma.variant.findMany({
      where: { Product: { shopId } },
      select: { inventoryQuantity: true },
    });
    const totalInventoryUnits = variants.reduce((sum: number, v: { inventoryQuantity: number | null }) => sum + (v.inventoryQuantity || 0), 0);

    const trendingProducts = (await prisma.product.findMany({
      where: { shopId, trending: true },
      take: 3,
      select: {
        id: true, title: true, vendor: true, shopifyId: true, salesVelocityFloat: true, status: true, trending: true,
        Variant: { select: { sku: true, price: true }, take: 1 },
      },
    })).map((p: any) => ({...p, variants: p.Variant.map((v: any) => ({...v, price: v.price?.toString() || "0"}))})) as DashboardTrendingProduct[];

    const lowStockProductsForAlerts = await prisma.product.findMany({
      where: { shopId, status: { in: ["Low", "Critical"] } },
      select: { id: true, title: true, status: true, Variant: { select: { inventoryQuantity: true } } },
      take: 3,
    }).then((products: any[]) => products.map((p: any) => ({
      ...p,
      inventory: p.Variant.reduce((sum: number, v: { inventoryQuantity: number | null }) => sum + (v.inventoryQuantity || 0), 0)
    }))) as DashboardAlertProduct[];

    const highSalesTrendProducts = await prisma.product.findMany({
      where: { shopId, trending: true },
      select: { id: true, title: true, salesVelocityFloat: true, stockoutDays: true },
      take: 3,
      orderBy: { salesVelocityFloat: 'desc' }
    }) as DashboardAlertProduct[];

    const loaderData = {
      initialSyncCompleted: true,
      totalProducts,
      lowStockItemsCount,
      totalInventoryUnits,
      trendingProducts,
      lowStockProductsForAlerts,
      highSalesTrendProducts,
      storeName,
    };
    console.log("[LOADER] /app._index loaderData:", loaderData);
    return json(loaderData);
  } catch (error) {
    console.error("[LOADER ERROR] /app._index loader failed:", error);
    throw error;
  }
};

export async function action({ request }: ActionFunctionArgs) {
  const { session } = await authenticate.admin(request);
  const { shop } = session;
  const formData = await request.formData();

  if (formData.get("intent") === "start_initial_sync") {
    try {
      await syncProductsAndInventory(shop, session);
      await prisma.shop.update({
        where: { shop: shop },
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
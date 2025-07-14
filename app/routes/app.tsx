import type { LoaderFunctionArgs } from "@remix-run/node";
import { json } from "@remix-run/node";
import { Outlet, useLoaderData } from "@remix-run/react";
import { AppLayout } from "~/components/AppLayout";
import { authenticate } from "~/shopify.server";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  console.log("[LOADER] /app starting authentication...");
  console.log("[LOADER] /app request URL:", request.url);
  
  const url = new URL(request.url);
  const shop = url.searchParams.get("shop");
  const host = url.searchParams.get("host");
  
  console.log("[LOADER] /app shop param:", shop);
  console.log("[LOADER] /app host param:", host);
  
  try {
    const { session } = await authenticate.admin(request);
    console.log("[LOADER] /app authentication successful");
    console.log("[LOADER] /app session shop:", session.shop);
    
    return json({
      shop: session.shop,
      host: host || "",
    });
  } catch (error) {
    console.error("[LOADER ERROR] /app authentication failed:", error);
    throw error;
  }
};

export default function App() {
  const { shop, host } = useLoaderData<typeof loader>();

  return (
    <AppLayout>
      <Outlet />
    </AppLayout>
  );
}
import { json } from "@remix-run/node";
import type { LoaderFunctionArgs } from "@remix-run/node";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  console.log("[DEBUG] /app-debug route accessed");
  console.log("[DEBUG] Request URL:", request.url);
  console.log("[DEBUG] Request headers:", Object.fromEntries(request.headers.entries()));
  
  const url = new URL(request.url);
  const shop = url.searchParams.get("shop");
  const host = url.searchParams.get("host");
  
  console.log("[DEBUG] Shop param:", shop);
  console.log("[DEBUG] Host param:", host);
  
  return json({
    message: "Debug route is working",
    shop: shop,
    host: host,
    timestamp: new Date().toISOString(),
    url: request.url
  });
};

export default function AppDebug() {
  return (
    <div style={{ padding: '2rem', textAlign: 'center' }}>
      <h1>App Debug Route</h1>
      <p>This route is working correctly.</p>
      <p>Check the server logs for debugging information.</p>
    </div>
  );
} 
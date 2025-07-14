import { json } from "@remix-run/node";
import type { LoaderFunctionArgs } from "@remix-run/node";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  return json({ 
    message: "Test route is working",
    timestamp: new Date().toISOString(),
    url: request.url
  });
};

export default function TestRoute() {
  return (
    <div style={{ padding: '2rem', textAlign: 'center' }}>
      <h1>Test Route</h1>
      <p>This route is working correctly.</p>
    </div>
  );
} 
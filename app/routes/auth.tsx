// app/routes/auth.tsx
import { authenticate } from "~/shopify.server";
import type { LoaderFunctionArgs } from "@remix-run/node"; // Added for type safety

export async function loader({ request }: LoaderFunctionArgs) { // Added type for request
  return await authenticate.admin(request);
}

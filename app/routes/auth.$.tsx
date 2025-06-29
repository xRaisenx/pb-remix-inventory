import { authenticate } from "~/shopify.server";
import type { LoaderFunctionArgs } from "@remix-run/node";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  await authenticate.admin(request);
  return null; // Should ideally not be reached if authenticate.admin handles redirection
};
import { type LoaderFunctionArgs } from "@remix-run/node";
import { authenticate } from "~/shopify.server";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  console.log("[AUTH SPLAT] Processing auth request:", request.url);
  
  try {
    await authenticate.admin(request);
    console.log("[AUTH SPLAT] Authentication successful");
    return null;
  } catch (error) {
    console.error("[AUTH SPLAT] Authentication error:", error);
    throw error;
  }
};
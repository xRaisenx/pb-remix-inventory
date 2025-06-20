import { redirect, type LoaderFunctionArgs } from "@remix-run/node";
import { authenticate } from "~/shopify.server";

export async function loader({ request }: LoaderFunctionArgs) {
  const url = new URL(request.url);
  console.log('Auth loader called with URL:', url.pathname + url.search);

  try {
    const authResult = await authenticate.admin(request);
    console.log('Authentication successful:', authResult);
    // If authenticate.admin doesn't redirect, return a response or redirect manually
    return authResult; // Or redirect("/app") if needed
  } catch (error) {
    console.error('Authentication error:', error);
    return new Response("Authentication failed", { status: 401 });
  }
}
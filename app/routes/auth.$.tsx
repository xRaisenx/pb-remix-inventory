// app/routes/auth.$.tsx

import { redirect, type LoaderFunctionArgs } from "@remix-run/node";
import { authenticate } from "~/shopify.server"; // Adjusted import path to parent directory

export async function loader({ request }: LoaderFunctionArgs) {
  const url = new URL(request.url);
  console.log('Auth loader called with URL:', url.pathname + url.search);

  // The `authenticate.admin(request)` function from `@shopify/shopify-app-remix`
  // handles the entire OAuth flow for admin users:
  // 1. If the user is not authenticated and this isn't an OAuth callback,
  //    it will redirect the user to Shopify to initiate the OAuth flow.
  // 2. If the request is an OAuth callback from Shopify, it will validate the
  //    callback, exchange the authorization code for an access token,
  //    and create/update the session.
  // 3. If the user already has a valid session, it verifies the session.
  //
  // If authentication is successful (e.g., OAuth callback is processed correctly,
  // or an existing session is validated), `authenticate.admin` will allow
  // execution to continue.
  //
  // With `unstable_newEmbeddedAuthStrategy: true`, after a successful OAuth
  // callback, `authenticate.admin` itself typically handles redirecting the app
  // back to its root URL (`/app`) within the embedded Shopify admin context.
  await authenticate.admin(request);

  // This explicit redirect ensures that if this route is accessed (e.g., directly,
  // or if `authenticate.admin` doesn't throw its own redirect in a specific scenario),
  // the user is always forwarded to the main application page at `/app`.
  console.log('Redirecting to /app');
  throw redirect("/app");
};
import type { LoaderFunctionArgs } from "@remix-run/node";
import { login } from "~/shopify.server";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const url = new URL(request.url);

  if (url.searchParams.get("shop")) {
    throw new Response("Please start auth from the Shopify admin.", {
      status: 400,
    });
  }

  return await login(request);
};
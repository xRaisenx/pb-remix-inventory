import type { LoaderFunctionArgs, LinksFunction } from "@remix-run/node";
import { redirect } from "@remix-run/node";
import { Form, useLoaderData } from "@remix-run/react";
import { Text } from "@shopify/polaris";

// Assuming login is exported from your shopify.server.ts
import { login } from "~/shopify.server"; // Use the Remix alias for absolute imports, adjust if your file is elsewhere

// Assuming styles.module.css is in the same directory as this route file
// e.g., app/routes/styles.module.css or app/routes/_index/styles.module.css
// If it's app/styles/index.module.css, then use:
// import styles from "~/styles/index.module.css?url";
import stylesUrl from "./styles.module.css?url"; // Standard way to import CSS module URLs in Remix

export const links: LinksFunction = () => {
  return [{ rel: "stylesheet", href: stylesUrl }];
};

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const url = new URL(request.url);

  // If a 'shop' parameter is present in the URL, it means Shopify has likely
  // redirected the user here after app installation or from the Shopify admin.
  // In this case, we redirect to the main '/app' route, passing along the
  // shop (and any other) parameters. The '/app' route's loader (or a
  // subsequent auth route like /auth/login if /app is protected) will handle
  // initiating the OAuth flow with this shop.
  if (url.searchParams.get("shop")) {
    // Construct the redirect URL to /app, preserving existing search params
    const appRedirectUrl = new URL("/app", url.origin);
    url.searchParams.forEach((value, key) => {
      appRedirectUrl.searchParams.append(key, value);
    });
    throw redirect(appRedirectUrl.toString());
  }

  // If no 'shop' param, it means the user is visiting the landing page directly.
  // We check if the `login` function is available (it should be if shopify.server is set up).
  // `showForm` will determine if the login form is rendered on the page.
  return { showForm: Boolean(login) };
};

export default function IndexPage() { // Renamed component for clarity
  const { showForm } = useLoaderData<typeof loader>();

  return (
    <div className="index-container"> {/* Using a more generic class name from styles.module.css */}
      <div className="content">
        <h1 className="heading">Welcome to [Your App Name]</h1>
        <p className="text">
          Streamline your Shopify store with [Your App Name] – your solution for [key value proposition].
        </p>

        {showForm && (
          <div className="form-container">
            <Text variant="bodyMd" as="span" alignment="center">
              Already have the app installed or want to install it? Enter your shop domain to get started.
            </Text>
            <Form className="form" method="post" action="/auth/login">
              <label className="label">
                <span>Shop domain</span>
                <input
                  className="input"
                  type="text"
                  name="shop"
                  placeholder="your-store-name.myshopify.com"
                  aria-label="Shop domain"
                />
              </label>
              <button className="button" type="submit">
                Log In / Install
              </button>
            </Form>
          </div>
        )}

        <div className="features-list-container">
          <h2 className="subheading">Why Choose [Your App Name]?</h2>
          <ul className="list">
            <li>
              <strong>Powerful Feature One</strong>: Briefly explain how this feature benefits the merchant.
            </li>
            <li>
              <strong>Efficient Feature Two</strong>: Highlight another key benefit or problem solved.
            </li>
            <li>
              <strong>Seamless Integration</strong>: Mention ease of use or integration with Shopify.
            </li>
          </ul>
        </div>
        {/* You can add more sections like testimonials, pricing overview (if applicable), etc. */}
      </div>
    </div>
  );
}
import { json, type LinksFunction, type LoaderFunctionArgs } from "@remix-run/node";
import { redirect } from "@remix-run/node";
import { Form, useLoaderData } from "@remix-run/react";
import { Text } from "@shopify/polaris";

// Import login from shopify.server.ts
import { login } from "~/shopify.server";

// Import CSS modules properly without ?url
import styles from "./styles.module.css";

export const links: LinksFunction = () => [];

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const url = new URL(request.url);

  // If a 'shop' parameter is present, initiate the auth process immediately.
  // This is the standard flow for new app installations.
  if (url.searchParams.get("shop")) {
    // After login, redirect to the embedded app route, not admin.shopify.com
    const shop = url.searchParams.get("shop");
    const host = url.searchParams.get("host");
    if (shop && host) {
      // Redirect to embedded app entry point
      return redirect(`/app?shop=${encodeURIComponent(shop)}&host=${encodeURIComponent(host)}`);
    }
    return await login(request);
  }

  // If no 'shop' param, show the manual login form.
  return json({ showForm: true });
};

export default function IndexPage() {
  const { showForm } = useLoaderData<{ showForm: boolean }>();

  return (
    <div className={styles.index}>
      <div className={styles.content}>
        <h1 className={styles.heading}>Welcome to Planet Beauty Inventory AI</h1>
        <p className={styles.text}>
          Streamline your Shopify store with Planet Beauty Inventory AI – your solution for intelligent inventory management.
        </p>

        {showForm && (
          <div className={styles.formContainer}>
            <Text variant="bodyMd" as="span" alignment="center">
              Already have the app installed or want to install it? Enter your shop domain to get started.
            </Text>
            <Form className={styles.form} method="post" action="/auth/login">
              <label className={styles.label}>
                <span>Shop domain</span>
                <input
                  className={styles.input}
                  type="text"
                  name="shop"
                  placeholder="your-store-name.myshopify.com"
                  aria-label="Shop domain"
                />
              </label>
              <button className={styles.button} type="submit">
                Log In / Install
              </button>
            </Form>
          </div>
        )}

        <div className={styles.featuresListContainer}>
          <h2 className={styles.subheading}>Why Choose Planet Beauty Inventory AI?</h2>
          <ul className={styles.list}>
            <li>
              <strong>AI-Powered Forecasting</strong>: Predict demand with Gemini 2.0 Flash intelligence.
            </li>
            <li>
              <strong>Smart Alerts</strong>: Never run out of stock with proactive notifications.
            </li>
            <li>
              <strong>Seamless Integration</strong>: Native Shopify integration for beauty retailers.
            </li>
          </ul>
        </div>
      </div>
    </div>
  );
}

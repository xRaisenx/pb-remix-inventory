import { json, type LinksFunction, type LoaderFunctionArgs } from "@remix-run/node";
import { redirect } from "@remix-run/node";
import { Form, useLoaderData } from "@remix-run/react";
import { Page, Card, BlockStack, Text, TextField, Button, FormLayout, InlineStack } from "@shopify/polaris";

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
    const shop = url.searchParams.get("shop");
    const host = url.searchParams.get("host");
    if (shop && host) {
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
    <div className="pb-gradient-page pb-embedded-bg">
      <div className="pb-hero">
        <Text as="h1" variant="heading2xl">
          <span className="pb-gradient-text">Planet Beauty Inventory AI</span>
        </Text>
        <Text as="p" variant="bodyMd" tone="subdued">
          Streamline your Shopify store with AI-powered forecasting, smart alerts, and seamless integration.
        </Text>
      </div>
      <div className="pb-index-container">
        <Page title="" subtitle="" narrowWidth>
          <BlockStack gap="500">
            <Card>
              <div className="pb-glass pb-card-hover" style={{ padding: 20 }}>
                <BlockStack gap="400">
                  <Text as="h2" variant="headingLg">Get started</Text>
                  {showForm && (
                    <Form method="post" action="/auth/login">
                      <FormLayout>
                        <TextField
                          type="text"
                          name="shop"
                          label="Shop domain"
                          helpText="example.myshopify.com"
                          placeholder="your-store-name.myshopify.com"
                          autoComplete="on"
                        />
                        <InlineStack align="end">
                          <Button submit variant="primary">
                            Log In / Install
                          </Button>
                        </InlineStack>
                      </FormLayout>
                    </Form>
                  )}
                </BlockStack>
              </div>
            </Card>

            <Card>
              <div className="pb-glass pb-card-hover" style={{ padding: 20 }}>
                <BlockStack gap="300">
                  <Text as="h2" variant="headingMd">Why Choose Planet Beauty Inventory AI?</Text>
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
                </BlockStack>
              </div>
            </Card>
          </BlockStack>
        </Page>
      </div>
    </div>
  );
}

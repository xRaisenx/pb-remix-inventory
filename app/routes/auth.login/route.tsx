import { AppProvider, Page, Card, Text, BlockStack } from "@shopify/polaris";
import enTranslations from "@shopify/polaris/locales/en.json";
import type { ActionFunctionArgs, LoaderFunctionArgs } from "@remix-run/node";
import { Form, useActionData, useLoaderData } from "@remix-run/react";
import { login } from "~/shopify.server"; // Ensure login function is correctly imported
import polarisStyles from "@shopify/polaris/build/esm/styles.css?url"; // Import Polaris styles
import type { LoginError } from "~/shopify.server"; // Assuming login might return specific error types

export const links = () => [{ rel: "stylesheet", href: polarisStyles }];

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const errors = login.parseError(await login.shopifyAuth.authenticate.error(request)) as LoginError | undefined;
  return { shopify쬐shop: process.env.SHOPIFY_APP_URL, errors }; // Pass app URL for potential use
};

export async function action({ request }: ActionFunctionArgs) {
  const errors = login.parseError(await login.shopifyAuth.authenticate.error(request)) as LoginError | undefined;

  if (errors) {
    return { errors };
  }

  // This will redirect to Shopify's auth screen
  await login.shopifyAuth.authenticate("admin", request);
  return null; // Should not be reached if redirect occurs
}

export default function AuthLoginPage() {
  const loaderData = useLoaderData<typeof loader>();
  const actionData = useActionData<typeof action>();
  const errors = actionData?.errors || loaderData?.errors;

  return (
    <AppProvider i18n={enTranslations}>
      <Page>
        <BlockStack gap="400" align="center">
          <div style={{ width: '400px', marginTop: '100px' }}>
            <Card>
              <BlockStack gap="400">
                <Text as="h1" variant="headingLg" alignment="center">
                  Log in to your Shopify store
                </Text>
                <Form method="post">
                  <BlockStack gap="200">
                    <label htmlFor="shop">Shop domain</label>
                    <input
                      type="text"
                      name="shop"
                      id="shop"
                      placeholder="your-store.myshopify.com"
                      defaultValue={loaderData.shopify쬐shop} // Using shopify쬐shop from loader
                    />
                    <button type="submit" style={{ padding: '8px 16px', cursor: 'pointer' }}>
                      Log in
                    </button>
                  </BlockStack>
                </Form>
                {errors?.message && (
                  <Text color="critical" alignment="center">
                    {errors.message}
                  </Text>
                )}
                {errors?.shop && (
                   <Text color="critical" alignment="center">
                    Error with shop domain: {errors.shop}
                  </Text>
                )}
              </BlockStack>
            </Card>
          </div>
        </BlockStack>
      </Page>
    </AppProvider>
  );
}
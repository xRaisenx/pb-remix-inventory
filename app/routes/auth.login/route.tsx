import { AppProvider, Page, Card, Text, BlockStack, FormLayout, TextField, Button } from "@shopify/polaris";
import enTranslations from "@shopify/polaris/locales/en.json";
import type { ActionFunctionArgs, LoaderFunctionArgs, LinksFunction } from "@remix-run/node"; // Added LinksFunction
import { Form, useActionData, useLoaderData } from "@remix-run/react";
import { login } from "~/shopify.server"; // Corrected import path assuming shopify.server.ts is in app root
import { loginErrorMessage } from "./error.server"; // Assuming this path is correct
import polarisStyles from "@shopify/polaris/build/esm/styles.css?url"; // Ensure ?url suffix

// Corrected links function
export const links: LinksFunction = () => [{ rel: "stylesheet", href: polarisStyles }];

export const loader = async ({ request }: LoaderFunctionArgs) => {
  // The login helper from @shopify/shopify-app-remix can parse errors from the URL
  const errors = login.parseError(await login.error(request));

  // If the "shop" query parameter is present, it means Shopify has redirected back
  // to this page, possibly with an error. Or, the user is trying to log in to a specific shop.
  // The login() helper will handle redirection to Polaris auth if necessary.
  // If already authenticated for this shop, authenticate.admin() in a protected route
  // would redirect them to the app.
  // For the login page itself, we mostly just display errors if any.
  return { errors };
};

export async function action({ request }: ActionFunctionArgs) {
  // This action is triggered when the user submits the login form (shop domain).
  const errors = login.parseError(await login.error(request));

  // If there are errors from a previous attempt (e.g., invalid shop domain format from URL), show them.
  if (errors) {
    return { errors };
  }

  // The login() helper from @shopify/shopify-app-remix will construct the
  // OAuth kickoff URL and redirect the user to Shopify's authentication page.
  // It requires the shop domain from the form submission.
  // If the shop domain is invalid or missing, it might throw an error or return null,
  // which `login.parseError` would then catch on a subsequent load.
  try {
    await login(request); // This will trigger a redirect, so code below might not be reached.
    return null; // Should not be reached if login() redirects.
  } catch (error) {
    // This catch block might be for errors within the login() utility itself,
    // though typically it handles errors by redirecting with error params.
    console.error("Error during login action:", error);
    // Return a generic error or re-throw to an error boundary
    return { errors: { shop: "An unexpected error occurred during login." } };
  }
}

export default function AuthLoginPage() {
  // Use loader data for initial errors (e.g., from Shopify redirect with error params)
  const { errors: loaderErrors } = useLoaderData<typeof loader>();
  // Use action data for errors from form submission attempts
  const actionData = useActionData<typeof action>();
  const formErrors = actionData?.errors || loaderErrors;

  // loginErrorMessage is a helper to get a specific error message for the shop field
  const { shop: shopError } = loginErrorMessage(formErrors); // Corrected variable name

  return (
    <AppProvider i18n={enTranslations}>
      <Page>
        <BlockStack gap="400" align="center"> {/* Corrected: was `VerticalStack` which is not standard Polaris */}
          <div style={{ width: '400px', marginTop: '100px' }}> {/* Added some basic styling for centering */}
            <Card>
              <BlockStack gap="400">
                <Text as="h1" variant="headingLg" alignment="center">
                  Log in to your Shopify store
                </Text>
                {/* The Form component should be from Remix for actions */}
                <Form method="post">
                  <FormLayout>
                    <TextField
                      type="text"
                      name="shop" // This field is used by the login() helper
                      label="Shop domain"
                      labelHidden
                      placeholder="your-store.myshopify.com"
                      autoComplete="on"
                      error={shopError} // Display error for the shop field
                    />
                    <Button submit variant="primary" fullWidth>Log in</Button>
                  </FormLayout>
                </Form>
                {/* Display other general errors if any */}
                {formErrors && !shopError && Object.values(formErrors).some(e => e) && (
                  Object.entries(formErrors).map(([key, value]) =>
                    value && key !== 'shop' ? <Text key={key} as="p" tone="critical">{String(value)}</Text> : null
                  )
                )}
              </BlockStack>
            </Card>
          </div>
        </BlockStack>
      </Page>
    </AppProvider>
  );
}
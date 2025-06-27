import { AppProvider, Page, Card, Text, BlockStack, FormLayout, TextField, Button } from "@shopify/polaris";
import enTranslations from "@shopify/polaris/locales/en.json";
import type { ActionFunctionArgs, LoaderFunctionArgs, LinksFunction } from "@remix-run/node"; // Added LinksFunction
import { Form, useActionData, useLoaderData } from "@remix-run/react";
import { login } from "~/shopify.server"; // Corrected import path assuming shopify.server.ts is in app root
// Removed direct import of loginErrorMessage from client-facing code
import polarisStyles from "@shopify/polaris/build/esm/styles.css?url"; // Ensure ?url suffix

// Corrected links function
export const links: LinksFunction = () => [{ rel: "stylesheet", href: polarisStyles }];

export const loader = async ({ request }: LoaderFunctionArgs) => {
  // This loader is for the /auth/login page.
  // It should display the login form.
  // If Shopify redirects here with an error, the error parameters will be in the URL.
  // Example: /auth/login?shop=your-store.myshopify.com&error=access_denied&error_description=...
  const url = new URL(request.url);
  const errorParam = url.searchParams.get("error");
  const errorDescriptionParam = url.searchParams.get("error_description");
  const shopParam = url.searchParams.get("shop");

  let errors: Record<string, string> = {};
  if (errorParam) {
    errors.shop = errorDescriptionParam || errorParam; // Use error_description if available, else the error code itself.
  }

  // It's also possible this page is loaded due to a direct navigation or after a failed form submission.
  // The `loginErrorMessage` was designed to process errors caught by the Shopify library,
  // which we are removing. For now, we will just pass basic errors.
  // If `error.server.ts` `loginErrorMessage` is generic enough, it could be adapted,
  // but let's simplify first.

  return { errors, shop: shopParam }; // Return any errors parsed from URL
};

export async function action({ request }: ActionFunctionArgs) {
  // This action is triggered when the user submits the login form (shop domain).
  // The login() helper from @shopify/shopify-app-remix will construct the
  // OAuth kickoff URL and redirect the user to Shopify's authentication page.
  // It requires the shop domain from the form submission.

  // The login function from @shopify/shopify-app-remix is designed to throw
  // a Remix Response object to perform the redirect to Shopify's OAuth page.
  // Remix will automatically handle this thrown Response.
  // If login() encounters an actual error (not a redirect Response),
  // that error will propagate and be handled by Remix's error boundaries.
  return login(request);
}

export default function AuthLoginPage() {
  // Use loader data for initial errors (e.g., from Shopify redirect with error params)
  const { errors: loaderErrors } = useLoaderData<typeof loader>();
  // Use action data for errors from form submission attempts
  const actionData = useActionData<typeof action>();
  // Errors are now directly the displayable messages processed by loader/action
  const formErrors = actionData?.errors || loaderErrors;

  // shopError is now directly available if it exists in formErrors
  const shopError = formErrors?.shop;

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
                      disabled={false} // Explicitly set disabled to false
                    />
                    <Button submit variant="primary" fullWidth disabled={false}>Log in</Button>
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
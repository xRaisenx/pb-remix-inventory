import { useState } from "react";
import type { ActionFunctionArgs, LoaderFunctionArgs, LinksFunction } from "@remix-run/node";
import { Form, useActionData, useLoaderData } from "@remix-run/react";
import {
  AppProvider as PolarisAppProvider,
  Button,
  Card,
  FormLayout,
  Page,
  Text,
  TextField,
} from "@shopify/polaris";
import polarisTranslations from "@shopify/polaris/locales/en.json";
import polarisStyles from "@shopify/polaris/build/esm/styles.css?url";

// Ensure these imports are correct and the files exist/are exported properly
import { login } from "~/shopify.server"; // Path should be correct if shopify.server.ts is in app/
import { loginErrorMessage } from "./error.server";
import appStyles from "~/styles/app.css?url"; // Corrected path to app/styles/app.css

export const links: LinksFunction = () => [
  { rel: "stylesheet", href: polarisStyles },
  { rel: "stylesheet", href: appStyles },
];

export const loader = async ({ request }: LoaderFunctionArgs) => {
  // The login function from shopify.server will attempt to extract the shop
  // from the request (e.g., if it's a redirect back with an error query param).
  // loginErrorMessage will parse any errors.
  const errors = loginErrorMessage(await login(request));

  // Pass errors and Polaris translations to the component.
  // The shop parameter is not explicitly passed here, as login() handles it.
  return { errors, polarisTranslations };
};

export const action = async ({ request }: ActionFunctionArgs) => {
  // This handles the form submission.
  // The login function will take the shop domain from the form data in the request
  // and initiate the OAuth flow by redirecting the user to Shopify.
  // If there's an issue before redirecting (e.g., invalid shop format),
  // loginErrorMessage will capture it.
  const errors = loginErrorMessage(await login(request));

  // Return errors to display on the form.
  // If login() successfully initiates OAuth, it will throw a redirect,
  // so this return is typically for pre-redirect validation errors.
  return {
    errors,
  };
};

export default function AuthLoginPage() { // Renamed component for clarity
  const loaderData = useLoaderData<typeof loader>();
  const actionData = useActionData<typeof action>();
  const [shop, setShop] = useState("");

  // Errors can come from the loader (e.g., on initial load with error params)
  // or from the action (e.g., after form submission with invalid shop).
  const { errors } = actionData || loaderData;

  return (
    <PolarisAppProvider i18n={loaderData.polarisTranslations || polarisTranslations}>
      <Page>
        <Card>
          <Form method="post">
            <FormLayout>
              <Text variant="headingMd" as="h2">
                Log in or install
              </Text>
              <TextField
                type="text"
                name="shop" // This name must match what shopify.login expects
                label="Shop domain"
                helpText="Enter your shop domain to log in or install the app (e.g., your-store-name.myshopify.com)"
                value={shop}
                onChange={setShop}
                autoComplete="on"
                error={errors?.shop} // Display shop-specific errors, if any
              />
              {errors && !errors.shop && typeof errors === 'string' && (
                 <Text tone="critical" as="p">{errors}</Text> // Display general errors
              )}
              <Button submit variant="primary">
                Log in / Install
              </Button>
            </FormLayout>
          </Form>
        </Card>
      </Page>
    </PolarisAppProvider>
  );
}
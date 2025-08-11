import { AppProvider as PolarisAppProvider, Page, Card, Text, FormLayout, TextField, Button } from "@shopify/polaris";
import polarisTranslations from "@shopify/polaris/locales/en.json";
import type { ActionFunctionArgs, LoaderFunctionArgs, LinksFunction } from "@remix-run/node"; // Added LinksFunction
import { Form, useActionData, useLoaderData } from "@remix-run/react";
import { login } from "~/shopify.server"; // Corrected import path assuming shopify.server.ts is in app root
import { loginErrorMessage } from "./error.server";
import polarisStyles from "@shopify/polaris/build/esm/styles.css?url"; // Ensure ?url suffix
import { useState } from "react";

// Corrected links function
export const links: LinksFunction = () => [{ rel: "stylesheet", href: polarisStyles }];

// Use shopify.login for /auth/login route as required by embedded auth strategy
export const loader = async ({ request }: LoaderFunctionArgs) => {
  const errors = loginErrorMessage(await login(request));
  return { errors, polarisTranslations };
};

export async function action({ request }: ActionFunctionArgs) {
  // Use shopify.login for /auth/login route as required by embedded auth strategy
  const errors = loginErrorMessage(await login(request));
  return { errors };
}

export default function AuthLoginPage() {
  const loaderData = useLoaderData<typeof loader>();
  const actionData = useActionData<typeof action>();
  const [shop, setShop] = useState("");
  const { errors } = actionData || loaderData;

  return (
    <PolarisAppProvider i18n={loaderData.polarisTranslations}>
      <Page>
        <Card>
          <Form method="post">
            <FormLayout>
              <Text variant="headingMd" as="h2">
                Log in
              </Text>
              <TextField
                type="text"
                name="shop"
                label="Shop domain"
                helpText="example.myshopify.com"
                value={shop}
                onChange={setShop}
                autoComplete="on"
                error={errors.shop}
              />
              <Button submit>Log in</Button>
            </FormLayout>
          </Form>
        </Card>
      </Page>
    </PolarisAppProvider>
  );
}
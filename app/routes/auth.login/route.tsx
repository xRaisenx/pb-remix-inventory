import { useState } from "react";
import type { ActionFunctionArgs, LoaderFunctionArgs, LinksFunction } from "@remix-run/node";
import { json } from "@remix-run/node";
import { Form, useActionData, useLoaderData } from "@remix-run/react";
import { AppProvider, Button, Card, FormLayout, Page, Text, TextField } from "@shopify/polaris";
import polarisStyles from "@shopify/polaris/build/esm/styles.css?url";
import enTranslations from "@shopify/polaris/locales/en.json";
import { login } from "~/shopify.server";
import { loginErrorMessage } from "./error.server";

export const links: LinksFunction = () => [
  { rel: "stylesheet", href: polarisStyles },
];

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const errors = loginErrorMessage(await login(request));
  return json({ errors });
};

export const action = async ({ request }: ActionFunctionArgs) => {
  const errors = loginErrorMessage(await login(request));
  return json({ errors });
};

export default function Auth() {
  const { errors: loaderErrors } = useLoaderData<typeof loader>();
  const actionData = useActionData<typeof action>();
  const [shop, setShop] = useState("");
  const errors = actionData?.errors || loaderErrors;

  return (
    <AppProvider i18n={enTranslations}>
      <Page>
        <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100vh' }}>
          <div style={{ width: '400px' }}>
            <Card>
              <Form method="post">
                <FormLayout>
                  <Text variant="headingMd" as="h1">
                    Log in or install app
                  </Text>
                  <TextField
                    type="text"
                    name="shop"
                    label="Shop domain"
                    helpText="e.g. your-store-name.myshopify.com"
                    value={shop}
                    onChange={setShop}
                    autoComplete="on"
                    error={errors?.shop}
                  />
                  <Button submit variant="primary" fullWidth>
                    Log In / Install
                  </Button>
                </FormLayout>
              </Form>
            </Card>
          </div>
        </div>
      </Page>
    </AppProvider>
  );
}
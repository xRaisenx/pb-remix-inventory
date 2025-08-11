import { AppProvider as PolarisAppProvider, Page, Card, Text, FormLayout, TextField, Button } from "@shopify/polaris";
import polarisTranslations from "@shopify/polaris/locales/en.json";
import type { ActionFunctionArgs, LoaderFunctionArgs, LinksFunction } from "@remix-run/node";
import { Form, useActionData, useLoaderData } from "@remix-run/react";
import { login } from "~/shopify.server";

import polarisStyles from "@shopify/polaris/build/esm/styles.css?url";
import { useState } from "react";

export const links: LinksFunction = () => [{ rel: "stylesheet", href: polarisStyles }];

export const loader = async ({ request }: LoaderFunctionArgs) => {
  // Do not start login here; render the form and let POST handle login to avoid loops
  return { errors: {}, polarisTranslations } as const;
};

export async function action({ request }: ActionFunctionArgs) {
  // Delegate to Shopify login; Response may be a redirect to Shopify or the app
  const result = await login(request);
  if (result && typeof (result as any).status === 'number') {
    return result as any;
  }
  return { errors: {} } as const;
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
          {/* Post to /login which invokes Shopify’s login helper */}
          <Form method="post" action="/login">
            <FormLayout>
              <Text variant="headingMd" as="h2">Log in</Text>
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
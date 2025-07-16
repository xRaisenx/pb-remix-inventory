import { json, type LoaderFunctionArgs } from "@remix-run/node";
import { authenticate } from "~/shopify.server";
import { Card, Text } from "@shopify/polaris";
import { useLoaderData } from "@remix-run/react";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { session } = await authenticate.admin(request);
  return json({ shop: session.shop });
};

export default function AppDashboard() {
  const { shop } = useLoaderData<typeof loader>();
  return (
    <Card>
      <Text as="h2" variant="headingMd">Welcome to Planet Beauty Inventory AI</Text>
      <Text as="p">Shop: {shop}</Text>
      <Text as="h3" variant="headingSm" marginTop="4">🚀 Getting Started</Text>
      <ol>
        <li>Clone the repository: <code>git clone ...</code></li>
        <li>Install dependencies: <code>npm install</code></li>
        <li>Configure <code>.env</code> variables</li>
        <li>Run <code>npm run db:init</code> and <code>npm run db:migrate</code></li>
        <li>Start the app: <code>npm run dev</code></li>
      </ol>
      <Text as="h3" variant="headingSm" marginTop="4">🔑 Environment Variables</Text>
      <pre>
        DATABASE_URL=...
        SHOPIFY_API_KEY=...
        SHOPIFY_API_SECRET=...
        ...
      </pre>
      <Text as="p" marginTop="4">
        For full instructions, see the <a href="/README.md" target="_blank">README</a>.
      </Text>
    </Card>
  );
}

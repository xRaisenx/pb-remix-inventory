import {
  Card,
  Layout,
  Page,
  Text
} from "@shopify/polaris";
// Removed App Bridge TitleBar. Use Polaris Page title instead.

export default function AdditionalPage() {
  return (
    <Page title="Additional page">
      <Layout>
        <Layout.Section>
          <Card>
            <div style={{ padding: "0.25rem" }}>
              <Text as="p">This is an additional page for the Planet Beauty Inventory AI app.</Text>
            </div>
          </Card>
        </Layout.Section>
      </Layout>
    </Page>
  );
}

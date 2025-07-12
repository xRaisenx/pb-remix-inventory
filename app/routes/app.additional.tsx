import {
  Card,
  Layout,
  Link as _Link,
  List as _List,
  Page,
  Text,
  BlockStack as _BlockStack
} from "@shopify/polaris";
import { TitleBar } from "@shopify/app-bridge-react";

export default function AdditionalPage() {
  return (
    <Page>
      <TitleBar title="Additional page" />
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

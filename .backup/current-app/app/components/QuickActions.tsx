import React from "react";
import { Card, ButtonGroup, Button, BlockStack, Text } from "@shopify/polaris";

export function QuickActions() {
  return (
    <Card>
      <BlockStack gap="300">
        <Text variant="headingMd" as="h2">
          Quick Actions
        </Text>
        <ButtonGroup>
          <Button
            url="/app/reports" // Use url prop for navigation
            variant="primary"
            aria-label="Generate Inventory Report"
          >
            Generate Report
          </Button>
          <Button
            url="/app/alerts" // Use url prop for navigation
            aria-label="View All Alerts"
          >
            View Alerts
          </Button>
          <Button
            url="/app/inventory" // Use url prop for navigation
            aria-label="Adjust Inventory"
          >
            Adjust Inventory
          </Button>
        </ButtonGroup>
      </BlockStack>
    </Card>
  );
}

export default QuickActions;

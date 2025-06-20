import React from "react";
import { Card, ButtonGroup, Button, BlockStack, Text } from "@shopify/polaris";
import { Link } from "@remix-run/react";

export function QuickActions() {
  return (
    <Card>
      <BlockStack gap="300">
        <Text variant="headingMd" as="h2">
          Quick Actions
        </Text>
        <ButtonGroup>
          <Button
            as={Link}
            to="/app/reports"
            variant="primary"
            aria-label="Generate Inventory Report"
          >
            Generate Report
          </Button>
          <Button
            as={Link}
            to="/app/alerts"
            aria-label="View All Alerts"
          >
            View Alerts
          </Button>
          <Button
            as={Link}
            to="/app/inventory" // Placeholder link, can be adjusted later
            aria-label="Adjust Inventory"
          >
            Adjust Inventory
          </Button>
          {/* Add more buttons here as needed */}
        </ButtonGroup>
      </BlockStack>
    </Card>
  );
}

export default QuickActions;

import { useState, useCallback } from "react";
import { json, type LoaderFunctionArgs, type ActionFunctionArgs } from "@remix-run/node";
import { useLoaderData, useActionData, useSubmit, useNavigation } from "@remix-run/react";
import {
  Page,
  Layout,
  Card,
  Button,
  Text,
  Badge,
  DataTable,
  Banner,
  Stack,
  Frame,
  Loading,
  Spinner,
  EmptyState,
  ButtonGroup,
  Modal,
  TextContainer,
  ProgressBar,
  Icon,
  Tooltip
} from "@shopify/polaris";
import {
  AlertTriangleIcon,
  TrendingUpIcon,
  ClockIcon,
  RefreshIcon,
  SettingsIcon,
  BellIcon
} from "@shopify/polaris-icons";
import { authenticate } from "~/shopify.server";
import prisma from "~/db.server";
import { runPredictiveAnalysis } from "~/services/predictive-velocity.service";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { admin, session } = await authenticate.admin(request);
  
  if (!session?.shop) {
    return json({ error: "Unauthorized" }, { status: 401 });
  }

  const shopRecord = await prisma.shop.findUnique({
    where: { shop: session.shop },
    include: { NotificationSettings: true }
  });

  if (!shopRecord) {
    return json({ error: "Shop not found" }, { status: 404 });
  }

  try {
    // Get active fast-selling alerts
    const fastSellingAlerts = await prisma.fastSellingAlert.findMany({
      where: { 
        shopId: shopRecord.id,
        isActive: true
      },
      include: {
        Product: {
          select: { 
            title: true, 
            handle: true, 
            quantity: true, 
            salesVelocityFloat: true,
            imageUrl: true
          }
        }
      },
      orderBy: [
        { severity: 'desc' },
        { createdAt: 'desc' }
      ]
    });

    // Get fast-selling products summary
    const fastSellingProducts = await prisma.product.findMany({
      where: {
        shopId: shopRecord.id,
        isFastSelling: true
      },
      select: {
        id: true,
        title: true,
        salesVelocityFloat: true,
        velocityTrend: true,
        predictedStockoutDate: true,
        aiRiskScore: true,
        quantity: true
      },
      orderBy: { salesVelocityFloat: 'desc' },
      take: 10
    });

    // Get velocity predictions
    const predictions = await prisma.salesVelocityPrediction.findMany({
      where: {
        Product: { shopId: shopRecord.id }
      },
      include: {
        Product: {
          select: { title: true, quantity: true }
        }
      },
      orderBy: { lastCalculated: 'desc' },
      take: 50
    });

    // Calculate statistics
    const stats = {
      totalAlerts: fastSellingAlerts.length,
      criticalAlerts: fastSellingAlerts.filter(a => a.severity === 'CRITICAL').length,
      highAlerts: fastSellingAlerts.filter(a => a.severity === 'HIGH').length,
      fastSellingCount: fastSellingProducts.length,
      imminentStockouts: predictions.filter(p => p.daysUntilStockout && p.daysUntilStockout <= 7).length,
      averageVelocity: fastSellingProducts.length > 0 
        ? fastSellingProducts.reduce((sum, p) => sum + (p.salesVelocityFloat || 0), 0) / fastSellingProducts.length 
        : 0,
      lastAnalysis: shopRecord.lastVelocityAnalysis,
      aiEnabled: shopRecord.aiPredictionsEnabled
    };

    return json({
      alerts: fastSellingAlerts,
      fastSellingProducts,
      predictions,
      statistics: stats,
      settings: shopRecord.NotificationSettings?.[0] || null
    });

  } catch (error) {
    console.error('Fast-selling loader error:', error);
    return json({ error: 'Failed to load data' }, { status: 500 });
  }
};

export const action = async ({ request }: ActionFunctionArgs) => {
  const { admin, session } = await authenticate.admin(request);
  
  if (!session?.shop) {
    return json({ error: "Unauthorized" }, { status: 401 });
  }

  const shopRecord = await prisma.shop.findUnique({
    where: { shop: session.shop }
  });

  if (!shopRecord) {
    return json({ error: "Shop not found" }, { status: 404 });
  }

  try {
    const formData = await request.formData();
    const action = formData.get("action");

    switch (action) {
      case "runAnalysis": {
        const result = await runPredictiveAnalysis(shopRecord.id);
        return json({
          success: result.success,
          message: result.success 
            ? `Analysis completed: ${result.alertsGenerated} alerts generated`
            : `Analysis failed: ${result.error}`,
          data: result
        });
      }

      case "dismissAlert": {
        const alertId = formData.get("alertId") as string;
        await prisma.fastSellingAlert.update({
          where: { id: alertId },
          data: { isActive: false, isResolved: true }
        });
        return json({ success: true, message: "Alert dismissed" });
      }

      case "toggleAI": {
        const enabled = formData.get("enabled") === "true";
        await prisma.shop.update({
          where: { id: shopRecord.id },
          data: { aiPredictionsEnabled: enabled }
        });
        return json({ 
          success: true, 
          message: `AI predictions ${enabled ? 'enabled' : 'disabled'}` 
        });
      }

      default:
        return json({ error: "Invalid action" }, { status: 400 });
    }

  } catch (error) {
    console.error('Fast-selling action error:', error);
    return json({ 
      error: 'Action failed', 
      details: error instanceof Error ? error.message : 'Unknown error' 
    }, { status: 500 });
  }
};

export default function FastSellingDashboard() {
  const data = useLoaderData<typeof loader>();
  const actionData = useActionData<typeof action>();
  const submit = useSubmit();
  const navigation = useNavigation();
  const [selectedAlert, setSelectedAlert] = useState<any>(null);
  const [showAnalysisModal, setShowAnalysisModal] = useState(false);

  const isLoading = navigation.state === "submitting";

  const runAnalysis = useCallback(() => {
    submit({ action: "runAnalysis" }, { method: "post" });
  }, [submit]);

  const dismissAlert = useCallback((alertId: string) => {
    submit({ action: "dismissAlert", alertId }, { method: "post" });
  }, [submit]);

  const toggleAI = useCallback((enabled: boolean) => {
    submit({ action: "toggleAI", enabled: enabled.toString() }, { method: "post" });
  }, [submit]);

  if ('error' in data) {
    return (
      <Page title="Fast-Selling Dashboard">
        <Banner status="critical">
          Error loading dashboard: {data.error}
        </Banner>
      </Page>
    );
  }

  const { alerts, fastSellingProducts, statistics, settings } = data;

  // Prepare alerts table data
  const alertsTableRows = alerts.map((alert: any) => [
    <Stack vertical spacing="extraTight" key={alert.id}>
      <Text variant="headingMd">{alert.Product.title}</Text>
      <Text variant="bodySm" color="subdued">{alert.title}</Text>
    </Stack>,
    <Badge 
      status={
        alert.severity === 'CRITICAL' ? 'critical' :
        alert.severity === 'HIGH' ? 'warning' :
        alert.severity === 'MEDIUM' ? 'info' : 'success'
      }
    >
      {alert.severity}
    </Badge>,
    <Stack spacing="tight">
      <Text>{alert.currentVelocity.toFixed(1)} units/day</Text>
      <Badge status={alert.velocityTrend === 'INCREASING' ? 'success' : 'info'}>
        {alert.velocityTrend}
      </Badge>
    </Stack>,
    alert.daysUntilStockout ? (
      <Text color={alert.daysUntilStockout <= 3 ? "critical" : "subdued"}>
        {alert.daysUntilStockout} days
      </Text>
    ) : (
      <Text color="subdued">—</Text>
    ),
    alert.suggestedAction || "Monitor closely",
    <ButtonGroup>
      <Button size="slim" onClick={() => setSelectedAlert(alert)}>
        View Details
      </Button>
      <Button 
        size="slim" 
        variant="tertiary" 
        onClick={() => dismissAlert(alert.id)}
        loading={isLoading}
      >
        Dismiss
      </Button>
    </ButtonGroup>
  ]);

  return (
    <Page
      title="🚀 Fast-Selling Dashboard"
      subtitle="AI-powered predictive sales velocity monitoring"
      primaryAction={{
        content: "Run Analysis",
        icon: RefreshIcon,
        onAction: () => setShowAnalysisModal(true),
        loading: isLoading
      }}
      secondaryActions={[
        {
          content: "Settings",
          icon: SettingsIcon,
          url: "/app/settings"
        }
      ]}
    >
      {isLoading && (
        <Frame>
          <Loading />
        </Frame>
      )}

      {actionData?.message && (
        <Banner 
          status={actionData.success ? "success" : "critical"}
          onDismiss={() => {}}
        >
          {actionData.message}
        </Banner>
      )}

      <Layout>
        {/* Statistics Cards */}
        <Layout.Section>
          <Stack distribution="fillEvenly">
            <Card>
              <Stack vertical spacing="extraTight">
                <Stack alignment="center">
                  <Icon source={AlertTriangleIcon} color="critical" />
                  <Text variant="headingLg">{statistics.criticalAlerts}</Text>
                </Stack>
                <Text variant="bodySm" color="subdued">Critical Alerts</Text>
              </Stack>
            </Card>
            
            <Card>
              <Stack vertical spacing="extraTight">
                <Stack alignment="center">
                  <Icon source={TrendingUpIcon} color="success" />
                  <Text variant="headingLg">{statistics.fastSellingCount}</Text>
                </Stack>
                <Text variant="bodySm" color="subdued">Fast-Selling Products</Text>
              </Stack>
            </Card>
            
            <Card>
              <Stack vertical spacing="extraTight">
                <Stack alignment="center">
                  <Icon source={ClockIcon} color="warning" />
                  <Text variant="headingLg">{statistics.imminentStockouts}</Text>
                </Stack>
                <Text variant="bodySm" color="subdued">Imminent Stockouts</Text>
              </Stack>
            </Card>
            
            <Card>
              <Stack vertical spacing="extraTight">
                <Stack alignment="center">
                  <Text variant="headingLg">{statistics.averageVelocity.toFixed(1)}</Text>
                </Stack>
                <Text variant="bodySm" color="subdued">Avg. Velocity (units/day)</Text>
              </Stack>
            </Card>
          </Stack>
        </Layout.Section>

        {/* AI Status */}
        <Layout.Section>
          <Card>
            <Stack alignment="center" distribution="equalSpacing">
              <Stack alignment="center">
                <Icon source={BellIcon} />
                <Text variant="headingMd">AI Predictions</Text>
                <Badge status={statistics.aiEnabled ? "success" : "critical"}>
                  {statistics.aiEnabled ? "Enabled" : "Disabled"}
                </Badge>
              </Stack>
              
              <Stack alignment="center">
                <Text variant="bodyMd" color="subdued">
                  Last Analysis: {
                    statistics.lastAnalysis 
                      ? new Date(statistics.lastAnalysis).toLocaleString()
                      : "Never"
                  }
                </Text>
                <Button 
                  onClick={() => toggleAI(!statistics.aiEnabled)}
                  loading={isLoading}
                >
                  {statistics.aiEnabled ? "Disable" : "Enable"} AI
                </Button>
              </Stack>
            </Stack>
          </Card>
        </Layout.Section>

        {/* Active Alerts */}
        <Layout.Section>
          <Card>
            <Stack vertical>
              <Text variant="headingMd">Active Fast-Selling Alerts</Text>
              
              {alerts.length === 0 ? (
                <EmptyState
                  heading="No active alerts"
                  description="Your inventory is well-stocked. Run analysis to check for new fast-selling trends."
                  primaryAction={{
                    content: "Run Analysis",
                    onAction: runAnalysis
                  }}
                />
              ) : (
                <DataTable
                  columnContentTypes={['text', 'text', 'text', 'text', 'text', 'text']}
                  headings={[
                    'Product',
                    'Severity',
                    'Velocity',
                    'Days to Stockout',
                    'Suggested Action',
                    'Actions'
                  ]}
                  rows={alertsTableRows}
                />
              )}
            </Stack>
          </Card>
        </Layout.Section>

        {/* Fast-Selling Products */}
        <Layout.Section>
          <Card>
            <Stack vertical>
              <Text variant="headingMd">Top Fast-Selling Products</Text>
              
              {fastSellingProducts.length === 0 ? (
                <Text color="subdued">No fast-selling products detected.</Text>
              ) : (
                <Stack vertical>
                  {fastSellingProducts.slice(0, 5).map((product: any) => (
                    <Stack key={product.id} alignment="center" distribution="equalSpacing">
                      <Stack vertical spacing="extraTight">
                        <Text variant="bodyMd">{product.title}</Text>
                        <Text variant="bodySm" color="subdued">
                          {product.salesVelocityFloat?.toFixed(1)} units/day
                        </Text>
                      </Stack>
                      
                      <Stack alignment="center">
                        <Badge status={
                          product.velocityTrend === 'ACCELERATING' ? 'success' :
                          product.velocityTrend === 'INCREASING' ? 'info' : 'warning'
                        }>
                          {product.velocityTrend}
                        </Badge>
                        
                        <Text variant="bodySm">
                          Stock: {product.quantity || 0}
                        </Text>
                        
                        {product.aiRiskScore && (
                          <Tooltip content={`AI Risk Score: ${(product.aiRiskScore * 100).toFixed(0)}%`}>
                            <ProgressBar 
                              progress={product.aiRiskScore * 100} 
                              size="small"
                              color={product.aiRiskScore > 0.7 ? "critical" : 
                                     product.aiRiskScore > 0.4 ? "warning" : "success"}
                            />
                          </Tooltip>
                        )}
                      </Stack>
                    </Stack>
                  ))}
                </Stack>
              )}
            </Stack>
          </Card>
        </Layout.Section>
      </Layout>

      {/* Analysis Modal */}
      {showAnalysisModal && (
        <Modal
          open={showAnalysisModal}
          onClose={() => setShowAnalysisModal(false)}
          title="Run Predictive Analysis"
          primaryAction={{
            content: "Run Analysis",
            onAction: () => {
              runAnalysis();
              setShowAnalysisModal(false);
            },
            loading: isLoading
          }}
          secondaryActions={[
            {
              content: "Cancel",
              onAction: () => setShowAnalysisModal(false)
            }
          ]}
        >
          <Modal.Section>
            <TextContainer>
              <Text>
                This will analyze all your products using AI to:
              </Text>
              <ul>
                <li>• Calculate advanced sales velocity metrics</li>
                <li>• Predict potential stockouts</li>
                <li>• Generate fast-selling alerts</li>
                <li>• Update risk assessments</li>
                <li>• Send notifications via configured channels</li>
              </ul>
              <Text>
                The analysis may take a few minutes depending on your product count.
              </Text>
            </TextContainer>
          </Modal.Section>
        </Modal>
      )}

      {/* Alert Details Modal */}
      {selectedAlert && (
        <Modal
          open={!!selectedAlert}
          onClose={() => setSelectedAlert(null)}
          title={selectedAlert.title}
        >
          <Modal.Section>
            <Stack vertical>
              <Text variant="bodyMd">{selectedAlert.message}</Text>
              
              <Stack distribution="fillEvenly">
                <Text><strong>Velocity:</strong> {selectedAlert.currentVelocity.toFixed(1)} units/day</Text>
                <Text><strong>Trend:</strong> {selectedAlert.velocityTrend}</Text>
                <Text><strong>Risk:</strong> {selectedAlert.severity}</Text>
              </Stack>
              
              {selectedAlert.aiRecommendation && (
                <Card sectioned>
                  <Stack vertical spacing="tight">
                    <Text variant="headingMd">AI Recommendation</Text>
                    <Text>{selectedAlert.aiRecommendation}</Text>
                  </Stack>
                </Card>
              )}
              
              <Text><strong>Suggested Action:</strong> {selectedAlert.suggestedAction}</Text>
            </Stack>
          </Modal.Section>
        </Modal>
      )}
    </Page>
  );
}
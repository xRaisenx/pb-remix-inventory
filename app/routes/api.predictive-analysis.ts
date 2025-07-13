import type { ActionFunctionArgs, LoaderFunctionArgs } from "@remix-run/node";
import { json } from "@remix-run/node";
import { authenticate } from "~/shopify.server";
import { runPredictiveAnalysis, analyzeProductVelocity } from "~/services/predictive-velocity.service";
import prisma from "~/db.server";

// Run predictive analysis for the entire shop
export const action = async ({ request }: ActionFunctionArgs) => {
  try {
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

    const method = request.method;

    if (method === "POST") {
      // Run full predictive analysis
      const result = await runPredictiveAnalysis(shopRecord.id);
      
      return json({
        success: result.success,
        message: result.success 
          ? `Analysis complete: ${result.alertsGenerated} alerts generated for ${result.productsAnalyzed} products`
          : `Analysis failed: ${result.error}`,
        data: result
      });
    }

    return json({ error: "Method not allowed" }, { status: 405 });

  } catch (error) {
    console.error("Predictive analysis API error:", error);
    return json(
      { 
        error: "Internal server error", 
        details: error instanceof Error ? error.message : "Unknown error" 
      }, 
      { status: 500 }
    );
  }
};

// Get predictive analysis status and recent alerts
export const loader = async ({ request }: LoaderFunctionArgs) => {
  try {
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

    // Get recent fast-selling alerts
    const recentAlerts = await prisma.fastSellingAlert.findMany({
      where: { 
        shopId: shopRecord.id,
        isActive: true,
        createdAt: {
          gte: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000) // Last 7 days
        }
      },
      include: {
        Product: {
          select: { title: true, handle: true, quantity: true }
        }
      },
      orderBy: { createdAt: 'desc' },
      take: 20
    });

    // Get fast-selling products
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

    // Get prediction statistics
    const predictions = await prisma.salesVelocityPrediction.findMany({
      where: {
        Product: { shopId: shopRecord.id }
      },
      select: {
        riskLevel: true,
        confidenceScore: true,
        daysUntilStockout: true
      }
    });

    const stats = {
      totalPredictions: predictions.length,
      highRiskProducts: predictions.filter(p => p.riskLevel === 'HIGH' || p.riskLevel === 'CRITICAL').length,
      averageConfidence: predictions.length > 0 
        ? predictions.reduce((sum, p) => sum + p.confidenceScore, 0) / predictions.length 
        : 0,
      imminentStockouts: predictions.filter(p => p.daysUntilStockout && p.daysUntilStockout <= 7).length,
      lastAnalysis: shopRecord.lastVelocityAnalysis,
      aiEnabled: shopRecord.aiPredictionsEnabled
    };

    return json({
      success: true,
      data: {
        recentAlerts,
        fastSellingProducts,
        statistics: stats
      }
    });

  } catch (error) {
    console.error("Predictive analysis loader error:", error);
    return json(
      { 
        error: "Internal server error", 
        details: error instanceof Error ? error.message : "Unknown error" 
      }, 
      { status: 500 }
    );
  }
};
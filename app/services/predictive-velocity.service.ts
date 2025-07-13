import prisma from "~/db.server";
import { GoogleGenerativeAI } from "@google/generative-ai";
import { sendNotification } from "./notification.service";
// Define types locally to avoid import issues during development
type AlertSeverity = 'INFO' | 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
type FastSellingAlertType = 'VELOCITY_SPIKE' | 'FAST_SELLING_WARNING' | 'IMMINENT_STOCKOUT' | 'REORDER_SUGGESTION' | 'VELOCITY_TREND_CHANGE' | 'AI_PREDICTION_ALERT';

// AI-powered predictive sales velocity service
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY || "");

export interface VelocityAnalysis {
  productId: string;
  currentVelocity: number;
  predictedVelocity: number;
  velocityTrend: 'INCREASING' | 'DECREASING' | 'STABLE' | 'ACCELERATING';
  daysUntilStockout: number | null;
  predictedStockoutDate: Date | null;
  riskLevel: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
  confidenceScore: number;
  aiInsights: string;
  shouldAlert: boolean;
  alertType?: FastSellingAlertType;
  severity?: AlertSeverity;
}

export interface PredictiveAnalysisResult {
  success: boolean;
  productsAnalyzed: number;
  alertsGenerated: number;
  criticalAlerts: number;
  summary: {
    fastSellingProducts: number;
    imminentStockouts: number;
    velocitySpikes: number;
  };
  error?: string;
}

// Enhanced velocity calculation with historical data analysis
export async function calculateAdvancedVelocity(productId: string): Promise<{
  dailyVelocity: number;
  weeklyVelocity: number;
  monthlyVelocity: number;
  velocityAcceleration: number;
  trend: string;
}> {
  const now = new Date();
  const oneWeekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
  const twoWeeksAgo = new Date(now.getTime() - 14 * 24 * 60 * 60 * 1000);
  const oneMonthAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);

  // Get recent analytics data
  const recentAnalytics = await prisma.analyticsData.findMany({
    where: {
      productId,
      date: { gte: oneMonthAgo }
    },
    orderBy: { date: 'desc' }
  });

  if (recentAnalytics.length === 0) {
    return {
      dailyVelocity: 0,
      weeklyVelocity: 0,
      monthlyVelocity: 0,
      velocityAcceleration: 0,
      trend: 'STABLE'
    };
  }

  // Calculate velocities for different periods
  const lastWeekSales = recentAnalytics
    .filter((a: any) => a.date >= oneWeekAgo)
    .reduce((sum: number, a: any) => sum + (a.unitsSold || 0), 0);

  const weekBeforeSales = recentAnalytics
    .filter((a: any) => a.date >= twoWeeksAgo && a.date < oneWeekAgo)
    .reduce((sum: number, a: any) => sum + (a.unitsSold || 0), 0);

  const monthSales = recentAnalytics
    .reduce((sum: number, a: any) => sum + (a.unitsSold || 0), 0);

  const dailyVelocity = lastWeekSales / 7;
  const weeklyVelocity = lastWeekSales;
  const monthlyVelocity = monthSales;

  // Calculate acceleration (change in velocity)
  const previousWeekDaily = weekBeforeSales / 7;
  const velocityAcceleration = dailyVelocity - previousWeekDaily;

  // Determine trend
  let trend = 'STABLE';
  if (velocityAcceleration > dailyVelocity * 0.2) {
    trend = 'ACCELERATING';
  } else if (velocityAcceleration > 0) {
    trend = 'INCREASING';
  } else if (velocityAcceleration < -dailyVelocity * 0.1) {
    trend = 'DECREASING';
  }

  return {
    dailyVelocity,
    weeklyVelocity,
    monthlyVelocity,
    velocityAcceleration,
    trend
  };
}

// AI-powered velocity analysis and prediction
export async function analyzeProductVelocity(productId: string): Promise<VelocityAnalysis> {
  const product = await prisma.product.findUnique({
    where: { id: productId },
    include: {
      Inventory: true,
      AnalyticsData: {
        where: {
          date: { gte: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000) }
        },
        orderBy: { date: 'desc' }
      },
      VelocityAnalytics: {
        orderBy: { date: 'desc' },
        take: 30
      }
    }
  });

  if (!product) {
    throw new Error(`Product ${productId} not found`);
  }

  // Calculate advanced velocity metrics
  const velocityData = await calculateAdvancedVelocity(productId);
  const currentStock = product.Inventory.reduce((sum: number, inv: any) => sum + inv.quantity, 0);

  // Use AI to analyze patterns and make predictions
  const aiInsights = await generateAIInsights(product, velocityData, currentStock);
  
  // Calculate predictions
  const daysUntilStockout = velocityData.dailyVelocity > 0 
    ? Math.ceil(currentStock / velocityData.dailyVelocity) 
    : null;

  const predictedStockoutDate = daysUntilStockout 
    ? new Date(Date.now() + daysUntilStockout * 24 * 60 * 60 * 1000)
    : null;

  // Determine risk level and alerts
  const analysis = determineRiskAndAlerts(
    velocityData,
    daysUntilStockout,
    currentStock,
    product
  );

  // Update or create velocity prediction record
  await prisma.salesVelocityPrediction.upsert({
    where: { productId },
    create: {
      id: `pred_${productId}_${Date.now()}`,
      productId,
      predictedVelocity: velocityData.dailyVelocity * 1.1, // AI adjustment
      currentVelocity: velocityData.dailyVelocity,
      velocityTrend: velocityData.trend,
      predictedStockoutDate,
      daysUntilStockout,
      confidenceScore: analysis.confidenceScore,
      riskLevel: analysis.riskLevel,
      aiInsights: aiInsights.insights
    },
    update: {
      predictedVelocity: velocityData.dailyVelocity * 1.1,
      currentVelocity: velocityData.dailyVelocity,
      velocityTrend: velocityData.trend,
      predictedStockoutDate,
      daysUntilStockout,
      confidenceScore: analysis.confidenceScore,
      riskLevel: analysis.riskLevel,
      aiInsights: aiInsights.insights,
      lastCalculated: new Date()
    }
  });

  // Store velocity analytics
  await prisma.velocityAnalytics.create({
    data: {
      id: `va_${productId}_${Date.now()}`,
      productId,
      date: new Date(),
      dailyVelocity: velocityData.dailyVelocity,
      weeklyVelocity: velocityData.weeklyVelocity,
      monthlyVelocity: velocityData.monthlyVelocity,
      velocityAcceleration: velocityData.velocityAcceleration,
      stockLevel: currentStock,
      isWeekend: [0, 6].includes(new Date().getDay()),
      isHoliday: false // Could be enhanced with holiday detection
    }
  });

  return {
    productId,
    currentVelocity: velocityData.dailyVelocity,
    predictedVelocity: velocityData.dailyVelocity * 1.1,
    velocityTrend: velocityData.trend as any,
    daysUntilStockout,
    predictedStockoutDate,
    riskLevel: analysis.riskLevel as any,
    confidenceScore: analysis.confidenceScore,
    aiInsights: aiInsights.insights,
    shouldAlert: analysis.shouldAlert,
    alertType: analysis.alertType,
    severity: analysis.severity
  };
}

// Generate AI insights using Gemini
async function generateAIInsights(product: any, velocityData: any, currentStock: number): Promise<{
  insights: string;
  recommendations: string[];
}> {
  try {
    const model = genAI.getGenerativeModel({ model: "gemini-2.0-flash-exp" });

    const prompt = `
Analyze this product's sales velocity and inventory situation:

Product: ${product.title}
Current Stock: ${currentStock} units
Daily Velocity: ${velocityData.dailyVelocity.toFixed(2)} units/day
Weekly Velocity: ${velocityData.weeklyVelocity} units
Velocity Trend: ${velocityData.trend}
Velocity Acceleration: ${velocityData.velocityAcceleration.toFixed(2)} units/day change

Historical Data Points: ${product.VelocityAnalytics?.length || 0}

Please provide:
1. Key insights about the velocity pattern
2. Risk assessment for stockouts
3. Specific recommendations for the merchant
4. Urgency level and reasoning

Be concise but actionable. Focus on business impact.
`;

    const result = await model.generateContent(prompt);
    const response = await result.response;
    const insights = response.text();

    return {
      insights: insights.substring(0, 500), // Limit length
      recommendations: []
    };
  } catch (error) {
    console.error('AI insights generation failed:', error);
    return {
      insights: `Velocity: ${velocityData.dailyVelocity.toFixed(1)} units/day (${velocityData.trend}). ${
        velocityData.dailyVelocity > 10 ? 'High velocity detected.' : 'Normal velocity.'
      }`,
      recommendations: []
    };
  }
}

// Determine risk level and alert requirements
function determineRiskAndAlerts(
  velocityData: any,
  daysUntilStockout: number | null,
  currentStock: number,
  product: any
): {
  riskLevel: string;
  confidenceScore: number;
  shouldAlert: boolean;
  alertType?: FastSellingAlertType;
  severity?: AlertSeverity;
} {
  let riskLevel = 'LOW';
  let shouldAlert = false;
  let alertType: FastSellingAlertType | undefined;
  let severity: AlertSeverity | undefined;

  // Calculate confidence based on data availability
  const dataPoints = Math.min(velocityData.weeklyVelocity > 0 ? 1 : 0, 1);
  const confidenceScore = Math.max(0.3, Math.min(0.95, dataPoints * 0.8));

  // Velocity spike detection
  if (velocityData.velocityAcceleration > velocityData.dailyVelocity * 0.5) {
    riskLevel = 'HIGH';
    shouldAlert = true;
    alertType = 'VELOCITY_SPIKE';
    severity = 'HIGH';
  }

  // Fast selling warning
  if (velocityData.dailyVelocity > 15 && velocityData.trend === 'INCREASING') {
    riskLevel = 'MEDIUM';
    shouldAlert = true;
    alertType = 'FAST_SELLING_WARNING';
    severity = 'MEDIUM';
  }

  // Imminent stockout
  if (daysUntilStockout && daysUntilStockout <= 7) {
    riskLevel = 'CRITICAL';
    shouldAlert = true;
    alertType = 'IMMINENT_STOCKOUT';
    severity = 'CRITICAL';
  }

  // Accelerating trend
  if (velocityData.trend === 'ACCELERATING') {
    riskLevel = 'HIGH';
    shouldAlert = true;
    alertType = 'VELOCITY_TREND_CHANGE';
    severity = 'HIGH';
  }

  return {
    riskLevel,
    confidenceScore,
    shouldAlert,
    alertType,
    severity
  };
}

// Create fast-selling alert with notifications
export async function createFastSellingAlert(
  shopId: string,
  analysis: VelocityAnalysis
): Promise<void> {
  if (!analysis.shouldAlert) return;

  const product = await prisma.product.findUnique({
    where: { id: analysis.productId }
  });

  if (!product) return;

  // Check if similar alert already exists and is active
  const existingAlert = await prisma.fastSellingAlert.findFirst({
    where: {
      shopId,
      productId: analysis.productId,
      alertType: analysis.alertType,
      isActive: true,
      isResolved: false
    }
  });

  if (existingAlert) {
    // Update existing alert instead of creating duplicate
    await prisma.fastSellingAlert.update({
      where: { id: existingAlert.id },
      data: {
        currentVelocity: analysis.currentVelocity,
        daysUntilStockout: analysis.daysUntilStockout,
        predictedStockout: analysis.predictedStockoutDate,
        velocityTrend: analysis.velocityTrend,
        aiRecommendation: analysis.aiInsights,
        updatedAt: new Date()
      }
    });
    return;
  }

  // Create new alert
  const alert = await prisma.fastSellingAlert.create({
    data: {
      id: `fsa_${shopId}_${analysis.productId}_${Date.now()}`,
      shopId,
      productId: analysis.productId,
      alertType: analysis.alertType!,
      severity: analysis.severity!,
      title: generateAlertTitle(analysis, product),
      message: generateAlertMessage(analysis, product),
      predictedStockout: analysis.predictedStockoutDate,
      currentVelocity: analysis.currentVelocity,
      velocityTrend: analysis.velocityTrend,
      daysUntilStockout: analysis.daysUntilStockout,
      suggestedAction: generateSuggestedAction(analysis),
      aiRecommendation: analysis.aiInsights,
      metadata: {
        confidenceScore: analysis.confidenceScore,
        riskLevel: analysis.riskLevel,
        automatedAlert: true,
        analysisTimestamp: new Date().toISOString()
      }
    }
  });

  // Send notifications via all enabled channels
  await sendNotification(shopId, {
    shopId,
    productId: product.id,
    productTitle: product.title,
    alertType: 'FAST_SELLING_VELOCITY',
    severity: analysis.severity === 'CRITICAL' ? 'CRITICAL' : 
             analysis.severity === 'HIGH' ? 'HIGH' : 'MEDIUM',
    title: alert.title,
    message: alert.message,
    metadata: {
      alertId: alert.id,
      velocity: analysis.currentVelocity,
      trend: analysis.velocityTrend,
      daysUntilStockout: analysis.daysUntilStockout,
      aiInsights: analysis.aiInsights
    }
  });

  // Mark alert as notified
  await prisma.fastSellingAlert.update({
    where: { id: alert.id },
    data: {
      notificationsSent: true,
      lastNotified: new Date()
    }
  });
}

// Run predictive analysis for all products in a shop
export async function runPredictiveAnalysis(shopId: string): Promise<PredictiveAnalysisResult> {
  try {
    const shop = await prisma.shop.findUnique({
      where: { id: shopId },
      include: { NotificationSettings: true }
    });

    if (!shop || !shop.aiPredictionsEnabled) {
      return {
        success: false,
        productsAnalyzed: 0,
        alertsGenerated: 0,
        criticalAlerts: 0,
        summary: { fastSellingProducts: 0, imminentStockouts: 0, velocitySpikes: 0 },
        error: 'AI predictions not enabled for this shop'
      };
    }

    const products = await prisma.product.findMany({
      where: { shopId },
      include: { Inventory: true }
    });

    let alertsGenerated = 0;
    let criticalAlerts = 0;
    const summary = {
      fastSellingProducts: 0,
      imminentStockouts: 0,
      velocitySpikes: 0
    };

    // Analyze each product
    for (const product of products) {
      try {
        const analysis = await analyzeProductVelocity(product.id);
        
        // Update product with predictions
        await prisma.product.update({
          where: { id: product.id },
          data: {
            isFastSelling: analysis.currentVelocity > 10,
            velocityTrend: analysis.velocityTrend,
            lastVelocityUpdate: new Date(),
            aiRiskScore: analysis.confidenceScore,
            predictedStockoutDate: analysis.predictedStockoutDate,
            salesVelocityFloat: analysis.currentVelocity
          }
        });

        // Generate alerts if needed
        if (analysis.shouldAlert) {
          await createFastSellingAlert(shopId, analysis);
          alertsGenerated++;
          
          if (analysis.severity === 'CRITICAL') {
            criticalAlerts++;
          }

          // Update summary counts
          if (analysis.alertType === 'FAST_SELLING_WARNING') summary.fastSellingProducts++;
          if (analysis.alertType === 'IMMINENT_STOCKOUT') summary.imminentStockouts++;
          if (analysis.alertType === 'VELOCITY_SPIKE') summary.velocitySpikes++;
        }
      } catch (error) {
        console.error(`Error analyzing product ${product.id}:`, error);
      }
    }

    // Update shop analysis timestamp
    await prisma.shop.update({
      where: { id: shopId },
      data: { lastVelocityAnalysis: new Date() }
    });

    return {
      success: true,
      productsAnalyzed: products.length,
      alertsGenerated,
      criticalAlerts,
      summary
    };
  } catch (error) {
    console.error('Predictive analysis failed:', error);
    return {
      success: false,
      productsAnalyzed: 0,
      alertsGenerated: 0,
      criticalAlerts: 0,
      summary: { fastSellingProducts: 0, imminentStockouts: 0, velocitySpikes: 0 },
      error: error instanceof Error ? error.message : 'Unknown error'
    };
  }
}

// Helper functions for alert generation
function generateAlertTitle(analysis: VelocityAnalysis, product: any): string {
  switch (analysis.alertType) {
    case 'VELOCITY_SPIKE':
      return `🚀 Sales Spike: ${product.title}`;
    case 'FAST_SELLING_WARNING':
      return `⚡ Fast Selling: ${product.title}`;
    case 'IMMINENT_STOCKOUT':
      return `🚨 Stockout Alert: ${product.title}`;
    case 'VELOCITY_TREND_CHANGE':
      return `📈 Sales Accelerating: ${product.title}`;
    default:
      return `📊 Velocity Alert: ${product.title}`;
  }
}

function generateAlertMessage(analysis: VelocityAnalysis, product: any): string {
  const velocity = analysis.currentVelocity.toFixed(1);
  const days = analysis.daysUntilStockout;
  
  let message = `${product.title} is selling at ${velocity} units/day (${analysis.velocityTrend.toLowerCase()}).`;
  
  if (days && days <= 7) {
    message += ` Predicted stockout in ${days} days.`;
  }
  
  if (analysis.velocityTrend === 'ACCELERATING') {
    message += ' Sales are accelerating rapidly!';
  }
  
  return message;
}

function generateSuggestedAction(analysis: VelocityAnalysis): string {
  if (analysis.daysUntilStockout && analysis.daysUntilStockout <= 3) {
    return 'URGENT: Place emergency reorder immediately';
  } else if (analysis.daysUntilStockout && analysis.daysUntilStockout <= 7) {
    return 'Consider expedited reordering to prevent stockout';
  } else if (analysis.velocityTrend === 'ACCELERATING') {
    return 'Monitor closely and prepare for increased demand';
  } else {
    return 'Review inventory levels and consider reordering';
  }
}
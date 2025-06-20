// app/services/ai.server.ts
import { GoogleGenerativeAI } from "@google/generative-ai";
import prisma from "~/db.server";
import type { Prisma as PrismaTypes } from '@prisma/client';

// Structured Response Types
export interface AIProductResponseItem {
  id: string; // Internal product ID
  shopifyProductId?: string; // Shopify GID for links
  name: string;
  imageUrl?: string; // Placeholder for now
  price?: string;
  inventory?: number;
  salesVelocity?: number | null;
  stockoutRisk?: string; // e.g., "Low", "Medium", "High" or days
}

export interface AIListResponseItem {
  id: string; // Typically internal product ID
  name: string;
  imageUrl?: string; // Placeholder
  metric1?: string; // e.g., "Inventory: 50"
  metric2?: string; // e.g., "Sales Velocity: 5/day"
  shopifyProductId?: string; // For linking
}

export interface AISummaryResponseData {
    totalProducts?: number;
    lowStockItems?: number; // Count of items with status 'Low' or 'Critical'
    totalInventoryValue?: number; // Requires price and quantity
    activeAlertsCount?: number; // Could be sum of low/critical/trending etc.
    averageSalesVelocity?: number; // Overall average
}

export type AIStructuredResponse =
  | { type: 'text'; content: string; suggestedQuestions?: string[] }
  | { type: 'product'; product: AIProductResponseItem; suggestedQuestions?: string[] }
  | { type: 'list'; title: string; items: AIListResponseItem[]; suggestedQuestions?: string[] }
  | { type: 'summary'; summary: AISummaryResponseData; suggestedQuestions?: string[] }
  | { type: 'error'; message: string };


/**
 * Generates a demand forecast for a given product using Google Gemini AI.
 *
 * @param productId The UUID of the product in our local database.
 * @returns A string containing the demand forecast text.
 * @throws Error if GEMINI_API_KEY is not set, product not found, or if AI model fails.
 */
export async function getDemandForecast(productId: string): Promise<string> {
  // ... (existing getDemandForecast implementation - unchanged for this subtask)
  const geminiApiKey = process.env.GEMINI_API_KEY;
  if (!geminiApiKey) {
    console.error("GEMINI_API_KEY environment variable is not set.");
    throw new Error("AI_SERVICE_NOT_CONFIGURED: GEMINI_API_KEY is missing.");
  }

  const genAI = new GoogleGenerativeAI(geminiApiKey);
  const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });

  const product = await prisma.product.findUnique({
    where: { id: productId },
  });

  if (!product) {
    console.error(`Product with ID ${productId} not found in the database.`);
    throw new Error(`PRODUCT_NOT_FOUND: Product with ID ${productId} does not exist.`);
  }

  const prompt = `For the "Planet Beauty AI Inventory" app, predict sales demand for the product titled "${product.title}" for the next 30 days. Consider its general appeal and provide a brief textual forecast.`;

  try {
    const result = await model.generateContent(prompt);
    const response = result.response;

    if (!response.text || response.text().trim() === "") {
      console.warn(`Gemini AI returned an empty or invalid forecast for product ${productId} (${product.title}). Prompt: "${prompt}"`);
      return "The AI model returned an empty forecast for this product. Please ensure product details are complete or try again later.";
    }
    return response.text();
  } catch (error) {
    console.error(`Error generating content from Gemini AI for product ${productId} (${product.title}):`, error);
    throw new Error("AI_MODEL_ERROR: The AI model failed to generate a forecast due to an internal error.");
  }
}

const defaultSuggestedQuestions = [
    "Which products are low on stock?",
    "What's my total inventory value?",
    "Show me trending products.",
    "What is the sales velocity for [product name]?",
];

export async function getAiChatResponse(userQuery: string, shopId: string): Promise<AIStructuredResponse> {
  const geminiApiKey = process.env.GEMINI_API_KEY;
  if (!geminiApiKey) {
    console.error("GEMINI_API_KEY missing for getAiChatResponse.");
    return { type: 'error', message: "AI service is not configured (missing API key). Please contact support." };
  }

  const shop = await prisma.shop.findUnique({
    where: { id: shopId },
    include: { notificationSettings: true }
  });
  if (!shop) {
    console.error(`Shop not found for ID: ${shopId} in getAiChatResponse.`);
    return { type: 'error', message: "Could not retrieve your shop information. Please try again." };
  }

  const lowStockThreshold = shop.notificationSettings?.lowStockThreshold ?? shop.lowStockThreshold ?? 10;
  const criticalStockThreshold = shop.notificationSettings?.criticalStockThresholdUnits ?? Math.min(5, Math.floor(lowStockThreshold * 0.3));


  const genAI = new GoogleGenerativeAI(geminiApiKey);
  const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });
  const lowerCaseQuery = userQuery.toLowerCase();

  try {
    if (lowerCaseQuery.includes("low inventory") || lowerCaseQuery.includes("low stock") || lowerCaseQuery.includes("critical stock")) {
      const products = await prisma.product.findMany({
        where: {
          shopId: shop.id,
          OR: [ { status: 'Low' }, { status: 'Critical' } ]
        },
        take: 10, // Limit for chat response brevity
        include: { variants: { select: { inventoryQuantity: true }}},
        orderBy: { status: 'asc' } // Show critical first, then low
      });

      if (products.length === 0) {
        return {
            type: 'text',
            content: `No products are currently marked as Low or Critical stock based on the threshold of ${lowStockThreshold} (low) and ${criticalStockThreshold} (critical) units.`,
            suggestedQuestions: defaultSuggestedQuestions
        };
      }
      const listItems: AIListResponseItem[] = products.map(p => {
        const totalInventory = p.variants.reduce((sum, v) => sum + (v.inventoryQuantity || 0), 0);
        return {
          id: p.id,
          name: p.title,
          metric1: `Inventory: ${totalInventory}`,
          metric2: `Status: ${p.status}`,
          shopifyProductId: p.shopifyId,
          // imageUrl: p.imageUrl // if available
        };
      });
      return {
        type: 'list',
        title: 'Low & Critical Stock Items',
        items: listItems,
        suggestedQuestions: ["What are my top selling products?", "Summarize my inventory health."]
      };
    }

    if (lowerCaseQuery.includes("total products") || lowerCaseQuery.includes("inventory summary") || lowerCaseQuery.includes("total inventory value")) {
      const productsForSummary = await prisma.product.findMany({
        where: { shopId },
        select: { status: true, variants: { select: { price: true, inventoryQuantity: true } } }
      });
      let totalInventoryValue = 0;
      let lowStockCount = 0;
      let criticalStockCount = 0;
      productsForSummary.forEach(p => {
          p.variants.forEach(v => {
            if (v.price && v.inventoryQuantity) {
                totalInventoryValue += Number(v.price) * v.inventoryQuantity;
            }
          });
          if (p.status === 'Low') lowStockCount++;
          if (p.status === 'Critical') criticalStockCount++;
      });
      const summaryData: AISummaryResponseData = {
        totalProducts: productsForSummary.length,
        lowStockItems: lowStockCount + criticalStockCount,
        totalInventoryValue: parseFloat(totalInventoryValue.toFixed(2)),
        // activeAlertsCount: lowStockCount + criticalStockCount, // Example
      };
      return { type: 'summary', summary: summaryData, suggestedQuestions: defaultSuggestedQuestions };
    }

    // Example for specific product query - needs more robust intent parsing
    if (lowerCaseQuery.startsWith("show product") || lowerCaseQuery.startsWith("details for")) {
        const productNameQuery = userQuery.split(" ").slice(2).join(" "); // very basic parsing
        const product = await prisma.product.findFirst({
            where: { shopId: shop.id, title: { contains: productNameQuery, mode: 'insensitive' } },
            include: { variants: { select: { price: true, inventoryQuantity: true, sku: true }}}
        });
        if (product) {
            const totalInventory = product.variants.reduce((sum, v) => sum + (v.inventoryQuantity || 0), 0);
            const productItem: AIProductResponseItem = {
                id: product.id,
                shopifyProductId: product.shopifyId,
                name: product.title,
                price: product.variants[0]?.price?.toString() ?? 'N/A',
                inventory: totalInventory,
                salesVelocity: product.salesVelocityFloat,
                stockoutRisk: product.status ?? 'Unknown', // Map status to risk
                // imageUrl: product.imageUrl,
            };
            return { type: 'product', product: productItem, suggestedQuestions: [`What's the sales trend for ${product.title}?`, "Any alerts for this product?"] };
        } else {
            return { type: 'text', content: `Sorry, I couldn't find a product named "${productNameQuery}". Please try the exact name.`, suggestedQuestions: defaultSuggestedQuestions };
        }
    }


    // Fallback to general Gemini query
    const prompt = `As "Planet Beauty AI Inventory Assistant" for shop "${shop.shop}", answer concisely about Shopify inventory, products, sales, or stock based on: "${userQuery}". If unrelated or needing unavailable data (live sales, marketing details), state limitations or ask for product specifics. Be brief.`;
    const result = await model.generateContent(prompt);
    const text = result.response.text();
    return {
        type: 'text',
        content: text.trim() || "I'm sorry, I couldn't process that request. Please try rephrasing.",
        suggestedQuestions: defaultSuggestedQuestions
    };

  } catch (error: any) {
    console.error(`Error in getAiChatResponse for shop ${shopId}, query "${userQuery}":`, error);
    return { type: 'error', message: "I encountered an error while trying to understand that. Please try again later." };
  }
}

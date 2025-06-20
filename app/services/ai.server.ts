// app/services/ai.server.ts

import { GoogleGenerativeAI } from "@google/generative-ai";
import Anthropic from '@anthropic-ai/sdk';
import prisma from "~/db.server";

// MERGE FIX: Using the more detailed structured response types from the main branch
export interface AIProductResponseItem {
  id: string;
  shopifyProductId?: string;
  name: string;
  imageUrl?: string;
  price?: string;
  inventory?: number;
  salesVelocity?: number | null;
  stockoutRisk?: string;
}

export interface AIListResponseItem {
  id: string;
  name: string;
  imageUrl?: string;
  metric1?: string;
  metric2?: string;
  shopifyProductId?: string;
}

export interface AISummaryResponseData {
    totalProducts?: number;
    lowStockItems?: number;
    totalInventoryValue?: number;
    activeAlertsCount?: number;
    averageSalesVelocity?: number;
}

export type AIStructuredResponse =
  | { type: 'product'; product: AIProductResponseItem; suggestedQuestions?: string[] }
  | { type: 'list'; title: string; items: AIListResponseItem[]; suggestedQuestions?: string[] }
  | { type: 'summary'; summary: AISummaryResponseData; suggestedQuestions?: string[] }
  | { type: 'text'; content: string; suggestedQuestions?: string[] }
  | { type: 'error'; message: string };

const defaultSuggestedQuestions = [
    "Which products are low on stock?",
    "What's my total inventory value?",
    "Show me trending products.",
];

export async function getAiChatResponse(userQuery: string, shopId: string): Promise<AIStructuredResponse> {
  const shop = await prisma.shop.findUnique({
    where: { id: shopId },
    select: {
      shop: true,
      aiProvider: true,
      geminiApiKey: true,
      anthropicApiKey: true,
      lowStockThreshold: true,
      notificationSettings: true,
    }
  });

  if (!shop) {
    return { type: 'error', message: "Could not retrieve your shop information." };
  }

  const { aiProvider, geminiApiKey, anthropicApiKey } = shop;

  if (!aiProvider || aiProvider === 'none') {
    return { type: 'error', message: "AI provider not configured. Please select a provider in settings." };
  }

  const lowerCaseQuery = userQuery.toLowerCase();
  const lowStockThreshold = shop.notificationSettings?.lowStockThreshold ?? shop.lowStockThreshold ?? 10;
  const criticalStockThreshold = shop.notificationSettings?.criticalStockThresholdUnits ?? Math.min(5, Math.floor(lowStockThreshold * 0.3));

  // MERGE FIX: Use the intelligent query parsing from the 'main' branch first.
  try {
    if (lowerCaseQuery.includes("low stock") || lowerCaseQuery.includes("critical stock")) {
      const products = await prisma.product.findMany({
        where: { shopId: shop.id, OR: [{ status: 'Low' }, { status: 'Critical' }] },
        take: 10, orderBy: { status: 'asc' }
      });
      if (products.length === 0) return { type: 'text', content: `No products are currently marked as Low or Critical stock.`, suggestedQuestions: defaultSuggestedQuestions };
      const listItems: AIListResponseItem[] = products.map(p => ({ id: p.id, name: p.title, metric1: `Status: ${p.status}`, shopifyProductId: p.shopifyId }));
      return { type: 'list', title: 'Low & Critical Stock Items', items: listItems, suggestedQuestions: ["Summarize my inventory health."] };
    }

    if (lowerCaseQuery.includes("summary") || lowerCaseQuery.includes("total inventory value")) {
      const productsForSummary = await prisma.product.findMany({ where: { shopId }, select: { status: true, variants: { select: { price: true, inventoryQuantity: true } } } });
      let totalInventoryValue = 0;
      productsForSummary.forEach(p => p.variants.forEach(v => { if (v.price && v.inventoryQuantity) totalInventoryValue += Number(v.price) * v.inventoryQuantity; }));
      const summaryData: AISummaryResponseData = { totalProducts: productsForSummary.length, totalInventoryValue: parseFloat(totalInventoryValue.toFixed(2)) };
      return { type: 'summary', summary: summaryData, suggestedQuestions: defaultSuggestedQuestions };
    }
  } catch (dbError) {
    console.error("DB error during structured response generation:", dbError);
    return { type: 'error', message: "I had trouble accessing the database to answer that." };
  }

  // MERGE FIX: If no structured response was generated, fall back to the generic AI call from the feature branch.
  const prompt = `You are "Planet Beauty AI Inventory Assistant". A user from shop named "${shop.shop}" asked: "${userQuery}". Provide a helpful, concise answer ONLY related to Shopify inventory management. If the query is unrelated, politely state that you can only assist with inventory-related questions. Be brief.`;

  if (aiProvider === 'gemini') {
    if (!geminiApiKey) return { type: 'error', message: "Gemini API key is missing." };
    try {
      const genAI = new GoogleGenerativeAI(geminiApiKey);
      const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });
      const result = await model.generateContent(prompt);
      const text = result.response.text()?.trim() || "Sorry, I couldn't process that with Gemini.";
      return { type: 'text', content: text, suggestedQuestions: defaultSuggestedQuestions };
    } catch (error) {
      console.error(`Error with Gemini API for shop ${shopId}:`, error);
      return { type: 'error', message: "Error communicating with Gemini API." };
    }
  } else if (aiProvider === 'anthropic') {
    if (!anthropicApiKey) return { type: 'error', message: "Anthropic API key is missing." };
    try {
      const anthropic = new Anthropic({ apiKey: anthropicApiKey });
      const msg = await anthropic.messages.create({ model: "claude-3-haiku-20240307", max_tokens: 1024, messages: [{ role: "user", content: prompt }] });
      const text = msg.content[0]?.type === 'text' ? msg.content[0].text.trim() : "Sorry, I couldn't process that with Anthropic.";
      return { type: 'text', content: text, suggestedQuestions: defaultSuggestedQuestions };
    } catch (error) {
      console.error(`Error with Anthropic API for shop ${shopId}:`, error);
      return { type: 'error', message: "Error communicating with Anthropic API." };
    }
  }

  return { type: 'error', message: "Invalid AI provider selected." };
}
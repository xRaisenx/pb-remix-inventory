// app/services/ai.server.ts
import { GoogleGenerativeAI } from "@google/generative-ai";
import Anthropic from '@anthropic-ai/sdk'; // Import Anthropic SDK
import prisma from "~/db.server";

// Define the structured response type matching AIAssistant.tsx expectations
interface AiStructuredResponse {
  type: 'product' | 'list' | 'summary' | 'text';
  data: any;
  followUpQuestions?: string[];
}

/**
 * Generates a demand forecast for a given product using Google Gemini AI.
 * (Commented out for this subtask to focus on getAiChatResponse)
 */
// export async function getDemandForecast(productId: string): Promise<string> {
//   const geminiApiKey = process.env.GEMINI_API_KEY;
//   if (!geminiApiKey) {
//     console.error("GEMINI_API_KEY environment variable is not set.");
//     throw new Error("AI_SERVICE_NOT_CONFIGURED: GEMINI_API_KEY is missing.");
//   }
//   // ... rest of the function
// }

export async function getAiChatResponse(userQuery: string, shopId: string): Promise<AiStructuredResponse> {
  const shop = await prisma.shop.findUnique({
    where: { id: shopId },
    select: {
      shop: true, // For prompts
      aiProvider: true,
      geminiApiKey: true,
      anthropicApiKey: true,
      lowStockThreshold: true, // If needed for specific queries later
    }
  });

  if (!shop) {
    console.error(`Shop not found for ID: ${shopId} in getAiChatResponse.`);
    return { type: 'text', data: { text: "Could not retrieve your shop information. Please try again." } };
  }

  const { aiProvider, geminiApiKey, anthropicApiKey } = shop;

  if (!aiProvider || aiProvider === 'none') {
    return { type: 'text', data: { text: "AI provider not configured. Please select a provider in settings." } };
  }

  // For now, the hardcoded query logic will be bypassed.
  // This section can be reinstated later with proper structured response generation.
  /*
  const lowerCaseQuery = userQuery.toLowerCase();
  const lowStockThreshold = shop.lowStockThreshold ?? 10;

  if (lowerCaseQuery.includes("low inventory") || lowerCaseQuery.includes("low stock")) {
    // ... logic to fetch low stock items ...
    // This should return AiStructuredResponse, e.g. a list card
    return { type: 'text', data: { text: "Low stock feature under development for new AI structure." } };
  }
  // ... other hardcoded queries ...
  */

  // Generic prompt for both providers (can be customized further)
  const prompt = `You are "Planet Beauty AI Inventory Assistant". A user from shop named "${shop.shop}" asked: "${userQuery}".
  Provide a helpful, concise answer ONLY related to Shopify inventory management, product data, sales trends, or stock levels.
  If the query is about a specific product not mentioned, or data you don't have access to (like live sales, detailed customer data, or specific marketing campaign details), state that you need more specific product information or that you cannot access that type of data.
  If the query is clearly unrelated to inventory, product management, or sales trends for an e-commerce beauty store, politely state that you can only assist with inventory-related questions for their Shopify store.
  Do not make up data if you don't have it. Be brief.`;

  if (aiProvider === 'gemini') {
    if (!geminiApiKey) {
      return { type: 'text', data: { text: "Gemini API key is missing. Please configure it in settings." } };
    }
    try {
      const genAI = new GoogleGenerativeAI(geminiApiKey);
      const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });
      const result = await model.generateContent(prompt);
      const response = result.response;
      const text = response.text()?.trim() || "Sorry, I couldn't process that with Gemini.";
      // Example follow-up questions (can be made dynamic later)
      const followUpQuestions = ["What are my top selling products?", "Show me products with low stock."];
      return { type: 'text', data: { text }, followUpQuestions };
    } catch (error) {
      console.error(`Error communicating with Gemini API for shop ${shopId}:`, error);
      return { type: 'text', data: { text: "Error communicating with Gemini API. Please try again later." } };
    }
  } else if (aiProvider === 'anthropic') {
    if (!anthropicApiKey) {
      return { type: 'text', data: { text: "Anthropic API key is missing. Please configure it in settings." } };
    }
    try {
      const anthropic = new Anthropic({ apiKey: anthropicApiKey });
      const msg = await anthropic.messages.create({
        model: "claude-3-haiku-20240307",
        max_tokens: 1024,
        messages: [{ role: "user", content: prompt }], // Using the same refined prompt
      });
      const text = msg.content[0]?.type === 'text' ? msg.content[0].text.trim() : "Sorry, I couldn't process that with Anthropic.";
      // Example follow-up questions
      const followUpQuestions = ["Summarize my inventory health.", "Which products need reordering soon?"];
      return { type: 'text', data: { text }, followUpQuestions };
    } catch (error) {
      console.error(`Error communicating with Anthropic API for shop ${shopId}:`, error);
      return { type: 'text', data: { text: "Error communicating with Anthropic API. Please try again later." } };
    }
  } else {
    // Should not happen if initial check for aiProvider is correct
    return { type: 'text', data: { text: "Invalid AI provider selected." } };
  }
}

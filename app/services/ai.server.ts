// app/services/ai.server.ts
import { GoogleGenerativeAI } from "@google/generative-ai";
import prisma from "~/db.server";

/**
 * Generates a demand forecast for a given product using Google Gemini AI.
 *
 * @param productId The UUID of the product in our local database.
 * @returns A string containing the demand forecast text.
 * @throws Error if GEMINI_API_KEY is not set, product not found, or if AI model fails.
 */
export async function getDemandForecast(productId: string): Promise<string> {
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

export async function getAiChatResponse(userQuery: string, shopId: string): Promise<string> {
  const geminiApiKey = process.env.GEMINI_API_KEY;
  if (!geminiApiKey) {
    console.error("GEMINI_API_KEY missing for getAiChatResponse.");
    // User-friendly message, as this is called from a chat interface
    return "AI service is not configured (missing API key). Please contact support.";
  }

  const shop = await prisma.shop.findUnique({ where: { id: shopId } });
  if (!shop) {
    console.error(`Shop not found for ID: ${shopId} in getAiChatResponse.`);
    return "Could not retrieve your shop information. Please try again.";
  }
  const lowStockThreshold = shop.lowStockThreshold ?? 10; // Use shop's threshold or default

  const genAI = new GoogleGenerativeAI(geminiApiKey);
  const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });

  const lowerCaseQuery = userQuery.toLowerCase();

  try {
    if (lowerCaseQuery.includes("low inventory") || lowerCaseQuery.includes("low stock")) {
      const lowStockItems = await prisma.inventory.findMany({
        where: {
            quantity: { lt: lowStockThreshold },
            warehouse: { shopId: shop.id }
        },
        take: 5, // Limit for chat response brevity
        include: {
            product: { select: { title: true } },
            warehouse: { select: { name: true } }
        },
        orderBy: { quantity: 'asc' }
      });
      if (lowStockItems.length === 0) {
        return `No products are currently below the low stock threshold of ${lowStockThreshold} units.`;
      }
      const summary = lowStockItems.map(item => `${item.product.title} (${item.quantity} units in ${item.warehouse.name})`).join(", ");
      return `Found ${lowStockItems.length} low stock item(s): ${summary}. Consider restocking soon.`;
    }

    if (lowerCaseQuery.includes("total products")) {
      const count = await prisma.product.count({ where: { shopId: shop.id } });
      return `You have a total of ${count} products in your catalog.`;
    }

    if (lowerCaseQuery.includes("total inventory") || lowerCaseQuery.includes("total units")) {
      const agg = await prisma.inventory.aggregate({
        _sum: { quantity: true },
        where: { warehouse: { shopId: shop.id } }
      });
      return `You have a total of ${agg._sum.quantity ?? 0} units across all your inventory records.`;
    }

    // Fallback to general Gemini query
    // Refined prompt to be more specific and guide the AI
    const prompt = `You are "Planet Beauty AI Inventory Assistant". A user from shop named "${shop.shop}" (ID: ${shopId}) asked: "${userQuery}".
    Provide a helpful, concise answer ONLY related to Shopify inventory management, product data, sales trends, or stock levels.
    If the query is about a specific product not mentioned, or data you don't have access to (like live sales, detailed customer data, or specific marketing campaign details), state that you need more specific product information or that you cannot access that type of data.
    If the query is clearly unrelated to inventory, product management, or sales trends for an e-commerce beauty store, politely state that you can only assist with inventory-related questions for their Shopify store.
    Do not make up data if you don't have it. Be brief.`;

    const result = await model.generateContent(prompt);
    const text = result.response.text();
    return text.trim() || "I'm sorry, I couldn't process that request. Please try rephrasing.";

  } catch (error: any) {
    console.error(`Error in getAiChatResponse for shop ${shopId}, query "${userQuery}":`, error);
    // Avoid leaking detailed error messages to the chat UI
    return "I encountered an error while trying to understand that. Please try again later.";
  }
}

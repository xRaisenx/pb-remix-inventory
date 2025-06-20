// app/routes/app.aiQuery.tsx

import { json, type ActionFunctionArgs } from "@remix-run/node";
import { authenticate } from "~/shopify.server";
import { getAiChatResponse } from "~/services/ai.server"; // Import the service
import prisma  from "~/db.server"; // Import prisma client

export const action = async ({ request }: ActionFunctionArgs) => {
  const { session } = await authenticate.admin(request); // Also get session for shopId
  const formData = await request.formData();
  const formAction = formData.get("_action") as string;
  const query = formData.get("query") as string;

  if (formAction === "ai_chat") {
    if (!query || typeof query !== 'string' || query.trim() === "") {
      return json({ error: "Query cannot be empty." }, { status: 400 });
    }
    if (!session?.shop) {
        return json({ error: "Shop session not found." }, { status: 401 });
    }

    const shopRecord = await prisma.shop.findUnique({ where: { shop: session.shop } });

    if (!shopRecord) {
      return json({ error: "Shop configuration not found in our database." }, { status: 404 });
    }

    try {
      // getAiChatResponse now returns a structured object
      const structuredResponse = await getAiChatResponse(query, shopRecord.id);

      // The frontend (AIAssistant.tsx) expects the response under the key 'aiResponse'
      // and can handle different types of messages, including errors sent from getAiChatResponse.
      // No need to check for specific error strings here anymore.
      return json({ aiResponse: structuredResponse });
    } catch (error: any) {
      // This catch block handles unexpected errors thrown by getAiChatResponse itself
      // or other issues within this try block (e.g., if prisma call failed before this point).
      console.error("AI Chat Action Error in app.aiQuery.tsx:", error);
      return json({ error: error.message || "The AI service encountered an unexpected problem processing your request." }, { status: 500 });
    }
  }

  return json({ error: "Invalid action specified." }, { status: 400 });
};

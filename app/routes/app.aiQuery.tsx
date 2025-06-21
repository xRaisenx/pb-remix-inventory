// app/routes/app.aiQuery.tsx

import { json, type ActionFunctionArgs } from "@remix-run/node";
import { authenticate } from "~/shopify.server";
import { getAiChatResponse } from "~/services/ai.server"; // Import the service
import prisma  from "~/db.server"; // Import prisma client
import { INTENT } from "~/utils/intents"; // Assuming INTENT constants are here

export const action = async ({ request }: ActionFunctionArgs) => {
  const { session } = await authenticate.admin(request);
  const formData = await request.formData();
  const intent = formData.get("intent") as string; // Changed from _action to intent
  const query = formData.get("query") as string;

  if (intent === INTENT.AI_CHAT) { // Changed from formAction === "ai_chat"
    if (!query || typeof query !== 'string' || query.trim() === "") {
      return json({ structuredResponse: { type: 'error', message: "Query cannot be empty." } }, { status: 400 });
    }
    if (!session?.shop) {
      return json({ structuredResponse: { type: 'error', message: "Shop session not found. Please ensure you are logged in." } }, { status: 401 });
    }

    const shopRecord = await prisma.shop.findUnique({ where: { shop: session.shop } });

    if (!shopRecord) {
      return json({ structuredResponse: { type: 'error', message: "Shop configuration not found in our database." } }, { status: 404 });
    }

    try {
      // getAiChatResponse now returns AIStructuredResponse
      const aiResponseObject = await getAiChatResponse(query, shopRecord.id);

      // If the service itself returned an error type, potentially adjust HTTP status
      if (aiResponseObject.type === 'error') {
        if (aiResponseObject.message.includes("AI service is not configured")) {
          return json({ structuredResponse: aiResponseObject }, { status: 503 });
        } else if (aiResponseObject.message.includes("Could not retrieve your shop information")) {
           return json({ structuredResponse: aiResponseObject }, { status: 404 }); // Or 500 if it's an internal issue
        }
        // For other errors from the service, we might use a generic 500 or a more specific one if identifiable
        return json({ structuredResponse: aiResponseObject }, { status: 500 });
      }

      return json({ structuredResponse: aiResponseObject });
    } catch (error: any) {
      console.error("AI Chat Action Error in app.aiQuery.tsx:", error);
      return json({ structuredResponse: { type: 'error', message: error.message || "The AI service encountered an unexpected problem." } }, { status: 500 });
    }
  }

  return json({ structuredResponse: { type: 'error', message: "Invalid action specified." } }, { status: 400 });
};

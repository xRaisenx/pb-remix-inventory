// app/routes/app.aiQuery.tsx

import { json, type ActionFunctionArgs } from "@remix-run/node";
import { authenticate } from "~/shopify.server";
import { getAiChatResponse } from "~/services/ai.server";
import prisma from "~/db.server";
import { INTENT } from "~/utils/intents"; // Import INTENT

export const action = async ({ request }: ActionFunctionArgs) => {
  const { session } = await authenticate.admin(request);
  const formData = await request.formData();
  const intent = formData.get("intent") as string; // Correctly read "intent"
  const query = formData.get("query") as string;

  if (intent === INTENT.AI_CHAT) { // Check against the correct intent value
    if (!query || typeof query !== 'string' || query.trim() === "") {
      return json({ structuredResponse: { type: 'error', content: "Query cannot be empty." } }, { status: 400 });
    }
    if (!session?.shop) {
      return json({ structuredResponse: { type: 'error', content: "Shop session not found." } }, { status: 401 });
    }

    const shopRecord = await prisma.shop.findUnique({ where: { shop: session.shop } });

    if (!shopRecord) {
      return json({ structuredResponse: { type: 'error', content: "Shop configuration not found." } }, { status: 404 });
    }

    try {
      const aiResponseObject = await getAiChatResponse(query, shopRecord.id);

      if (aiResponseObject.type === 'error') {
        // Status codes can be adjusted based on the error message from the service
        return json({ structuredResponse: aiResponseObject }, { status: 500 });
      }

      return json({ structuredResponse: aiResponseObject });
    } catch (error: any) {
      console.error("AI Chat Action Error in app.aiQuery.tsx:", error);
      return json({ structuredResponse: { type: 'error', content: error.message || "The AI service encountered an unexpected problem." } }, { status: 500 });
    }
  }

  return json({ structuredResponse: { type: 'error', content: "Invalid action specified." } }, { status: 400 });
};

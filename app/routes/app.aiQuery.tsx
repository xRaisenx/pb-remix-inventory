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
      const aiText = await getAiChatResponse(query, shopRecord.id); // Pass shopRecord.id (UUID)
      // Check if aiText indicates a known error type from the service to adjust status
      if (aiText.startsWith("AI service is not configured") || aiText.startsWith("Could not retrieve your shop information")) {
        return json({ error: aiText }, { status: 503 }); // Service Unavailable or config error
      }
      return json({ response: aiText });
    } catch (error: any) {
      console.error("AI Chat Action Error in app.aiQuery.tsx:", error);
      return json({ error: error.message || "The AI service encountered an unexpected problem." }, { status: 500 });
    }
  }

  return json({ error: "Invalid action specified." }, { status: 400 });
};

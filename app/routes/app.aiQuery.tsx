import { json, type ActionFunctionArgs } from "@remix-run/node";
import { authenticate } from "~/shopify.server";
import { processAIQuery } from "~/services/ai.server";
import prisma from "~/db.server";

export const action = async ({ request }: ActionFunctionArgs) => {
  const { session } = await authenticate.admin(request);
  const formData = await request.formData();
  const query = formData.get("query") as string;

  if (!query || typeof query !== 'string' || query.trim() === "") {
    return json({ error: "Query cannot be empty." }, { status: 400 });
  }
  if (!session?.shop) {
    return json({ error: "Shop session not found." }, { status: 401 });
  }

  const shopRecord = await prisma.shop.findUnique({ where: { shop: session.shop } });
  if (!shopRecord) {
    return json({ error: "Shop configuration not found." }, { status: 404 });
  }

  try {
    const aiResponse = await processAIQuery({
      text: query,
      shopId: shopRecord.id,
      sessionId: session.id
    });
    if (!aiResponse.success) {
      return json({ error: aiResponse.message || "The AI service encountered an error." }, { status: 500 });
    }
    return json({ response: aiResponse });
  } catch (error: any) {
    return json({ error: error.message || "The AI service encountered an unexpected problem." }, { status: 500 });
  }
};
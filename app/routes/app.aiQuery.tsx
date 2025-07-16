import { json, type ActionFunctionArgs } from "@remix-run/node";
import { authenticate } from "~/shopify.server";
import processAIQuery from "~/services/ai.server";
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
    return json({ error: "Shop not found in database." }, { status: 404 });
  }

  try {
    const aiResult = await processAIQuery({
      text: query,
      shopId: shopRecord.id,
      userId: session.userId || undefined,
      sessionId: session.id || undefined
    });
    return json({ result: aiResult });
  } catch (error) {
    return json({ error: (error as Error).message }, { status: 500 });
  }
};
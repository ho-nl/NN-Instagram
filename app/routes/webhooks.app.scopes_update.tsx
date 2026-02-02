import type { ActionFunctionArgs } from "react-router";
import { authenticate } from "../shopify.server";
import db from "../db.server";

export const action = async ({ request }: ActionFunctionArgs) => {
  try {
    // authenticate.webhook() automatically validates HMAC signature
    const { payload, session } = await authenticate.webhook(request);

    const current = payload.current as string[];
    if (session) {
      await db.session.update({
        where: {
          id: session.id,
        },
        data: {
          scope: current.toString(),
        },
      });
    }

    // Always return 200 OK to acknowledge webhook receipt
    return new Response(null, { status: 200 });
  } catch (error) {
    console.error("Webhook processing error:", error);

    // If authenticate.webhook() throws, HMAC validation failed
    // Return 401 Unauthorized
    if (error instanceof Error && error.message.includes("HMAC")) {
      return new Response("Unauthorized", { status: 401 });
    }

    // For other errors, return 200 to prevent retries
    return new Response(null, { status: 200 });
  }
};

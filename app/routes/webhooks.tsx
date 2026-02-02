import type { ActionFunctionArgs } from "react-router";
import { authenticate } from "../shopify.server";
import db from "../db.server";

export const action = async ({ request }: ActionFunctionArgs) => {
  const { topic, payload } = await authenticate.webhook(request);

  switch (topic) {
    case "CUSTOMERS_DATA_REQUEST": {
      return new Response("Data request acknowledged", { status: 200 });
    }

    case "CUSTOMERS_REDACT": {
      return new Response("Customer redaction acknowledged", { status: 200 });
    }

    case "SHOP_REDACT": {
      const data = payload as {
        shop_id: number;
        shop_domain: `${string}.myshopify.com`;
      };

      try {
        await db.session.deleteMany({
          where: { shop: data.shop_domain },
        });

        return new Response("Shop data redacted successfully", { status: 200 });
      } catch (error) {
        return new Response("Shop redaction acknowledged with errors", {
          status: 200,
        });
      }
    }

    default:
      return new Response("Webhook received", { status: 200 });
  }
};

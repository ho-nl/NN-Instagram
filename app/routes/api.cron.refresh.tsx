import prisma from "app/db.server";
import { LoaderFunctionArgs } from "react-router";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  try {
    console.log("🔄 Starting cron job...");

    const refreshUrl = "https://graph.instagram.com/refresh_access_token";
    const twentyFourHoursAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);

    console.log("📅 Looking for tokens older than:", twentyFourHoursAgo);

    const currentIgToken = await prisma.socialAccount.findMany({
      where: {
        provider: "instagram",
        createdAt: {
          lt: twentyFourHoursAgo,
        },
      },
    });

    console.log("📊 Found tokens:", currentIgToken.length);
    console.log(
      "🔍 Tokens found:",
      currentIgToken.map((t) => ({
        id: t.id,
        shop: t.shop,
        createdAt: t.createdAt,
        expiresAt: t.expiresAt,
      })),
    );

    if (currentIgToken.length === 0) {
      console.log("ℹ️  No tokens to refresh");
      return new Response("No tokens to refresh", { status: 200 });
    }

    for (const token of currentIgToken) {
      console.log(`🔄 Processing token for shop: ${token.shop}`);

      const res = await fetch(
        `${refreshUrl}?grant_type=ig_refresh_token&access_token=${token.accessToken}`,
        {
          method: "GET",
          // No body for GET requests
        },
      );

      console.log("📡 Instagram API response status:", res.status);
      const data = await res.json();
      console.log("📋 Instagram API response data:", data);

      if (data.access_token) {
        console.log("✅ Got new token, updating database...");
        await prisma.socialAccount.upsert({
          where: {
            shop_provider: {
              shop: token.shop,
              provider: token.provider,
            },
          },
          update: {
            accessToken: data.access_token,
            expiresAt: data.expires_in
              ? new Date(Date.now() + data.expires_in * 1000)
              : null,
          },
          create: {
            shop: token.shop,
            provider: token.provider,
            accessToken: data.access_token,
            expiresAt: data.expires_in
              ? new Date(Date.now() + data.expires_in * 1000)
              : null,
          },
        });
        console.log("✅ Database updated successfully");
      } else {
        console.error(
          `❌ Failed to refresh token for ${token.shop}: ${JSON.stringify(data)}`,
        );
      }
    }

    console.log("🎉 Cron job completed successfully");
    return new Response("Cron job completed", { status: 200 });
  } catch (error) {
    console.error("❌ Error in cron job:", error);
    return new Response(
      `Error: ${error instanceof Error ? error.message : "Unknown error"}`,
      { status: 500 },
    );
  }
};

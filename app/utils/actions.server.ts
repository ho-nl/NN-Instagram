import type { ActionResponse } from "../types/instagram.types";
import type { ShopifyAdmin } from "../types/shopify.types";
import { deleteInstagramData, generateAppEmbedUrl } from "./metaobjects.server";
import { deleteInstagramAccount } from "./account.server";

export async function handleSyncAction(request: Request): Promise<ActionResponse> {
  try {
    const syncUrl = new URL(request.url);
    syncUrl.pathname = "/api/instagram/staged-upload";

    const response = await fetch(syncUrl.toString(), {
      headers: {
        Cookie: request.headers.get("Cookie") || "",
      },
    });

    if (!response.ok) {
      throw new Error("Sync failed");
    }

    return { success: true, message: "Sync completed successfully!" };
  } catch (error) {
    return {
      success: false,
      message: "Sync failed. Please try again.",
    };
  }
}

export async function handleDeleteDataAction(admin: ShopifyAdmin): Promise<ActionResponse> {
  return await deleteInstagramData(admin);
}

export async function handleDisconnectAction(
  admin: ShopifyAdmin,
  shop: string,
): Promise<ActionResponse> {
  try {
    const deleteResult = await deleteInstagramData(admin);

    if (!deleteResult.success) {
      return deleteResult;
    }

    await deleteInstagramAccount(shop);

    return {
      success: true,
      deletedMetaobjects: deleteResult.deletedMetaobjects,
      deletedFiles: deleteResult.deletedFiles,
      message: `Disconnected and deleted ${deleteResult.deletedMetaobjects} metaobjects and ${deleteResult.deletedFiles} files`,
    };
  } catch (error) {
    console.error("Disconnect error:", error);
    return {
      success: false,
      message: "Disconnect failed. Please try again.",
      status: 500,
    };
  }
}

export async function handleAddToThemeAction(
  shop: string,
  template?: string,
): Promise<ActionResponse> {
  try {
    const redirectUrl = generateAppEmbedUrl(shop, template);

    return {
      success: true,
      redirectUrl,
      message: "Opening theme editor to add Instagram feed block...",
    };
  } catch (error) {
    return {
      success: false,
      message: "Failed to open theme editor. Please try again.",
      status: 500,
    };
  }
}

/**
 * Action handlers for Instagram interface route
 */

import type { ActionResponse } from "../types/instagram.types";
import type { ShopifyAdmin } from "../types/shopify.types";
import { deleteInstagramData, generateAppEmbedUrl } from "./metaobjects.server";
import { deleteInstagramAccount } from "./account.server";

/**
 * Handle sync action - trigger Instagram sync
 */
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

/**
 * Handle delete data action - delete all Instagram metaobjects and files
 */
export async function handleDeleteDataAction(admin: ShopifyAdmin): Promise<ActionResponse> {
  return await deleteInstagramData(admin);
}

/**
 * Handle disconnect action - delete data and remove social account
 */
export async function handleDisconnectAction(
  admin: ShopifyAdmin,
  shop: string,
): Promise<ActionResponse> {
  try {
    // First delete all Instagram data
    const deleteResult = await deleteInstagramData(admin);

    if (!deleteResult.success) {
      return deleteResult;
    }

    // Then remove the social account connection using centralized function
    await deleteInstagramAccount(shop);

    console.log(
      `✓ Disconnected account and deleted ${deleteResult.deletedMetaobjects} metaobjects and ${deleteResult.deletedFiles} files`,
    );

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

/**
 * Handle add to theme action - opens theme editor with app block ready to place
 * Uses Shopify's deep linking for simplified app block installation
 */
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
    console.error("Add to theme error:", error);
    return {
      success: false,
      message: "Failed to open theme editor. Please try again.",
      status: 500,
    };
  }
}

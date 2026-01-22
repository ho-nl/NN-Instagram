/**
 * Server-side utilities for Shopify metaobject and file operations
 */

import type { ActionResponse } from "../types/instagram.types";
import type { 
  ShopifyAdmin, 
  MetaobjectsQueryResponse, 
  FilesQueryResponse,
  GraphQLNode,
  FileNode 
} from "../types/shopify.types";

/**
 * Delete all Instagram metaobjects (posts and list)
 */
async function deleteMetaobjects(admin: ShopifyAdmin): Promise<{
  postIds: string[];
  listIds: string[];
}> {
  // Query nn_instagram_post metaobjects
  const postMetaobjectsQuery = await admin.graphql(`
    #graphql
    query {
      metaobjects(type: "nn_instagram_post", first: 250) {
        edges { node { id } }
      }
    }
  `);
  const postMetaobjectsJson = await postMetaobjectsQuery.json() as MetaobjectsQueryResponse;
  const postMetaobjectIds =
    postMetaobjectsJson.data?.metaobjects?.edges?.map(
      (e) => e.node.id,
    ) || [];

  // Query nn_instagram_list metaobjects
  const listMetaobjectsQuery = await admin.graphql(`
    #graphql
    query {
      metaobjects(type: "nn_instagram_list", first: 10) {
        edges { node { id } }
      }
    }
  `);
  const listMetaobjectsJson = await listMetaobjectsQuery.json() as MetaobjectsQueryResponse;
  const listMetaobjectIds =
    listMetaobjectsJson.data?.metaobjects?.edges?.map(
      (e) => e.node.id,
    ) || [];

  // Delete all metaobjects
  for (const id of [...postMetaobjectIds, ...listMetaobjectIds]) {
    await admin.graphql(
      `
      #graphql
      mutation metaobjectDelete($id: ID!) {
        metaobjectDelete(id: $id) {
          deletedId
          userErrors { field message }
        }
      }
    `,
      { variables: { id } },
    );
  }

  return {
    postIds: postMetaobjectIds,
    listIds: listMetaobjectIds,
  };
}

/**
 * Delete Instagram files from Shopify
 */
async function deleteInstagramFiles(admin: ShopifyAdmin): Promise<string[]> {
  let allFileIds: string[] = [];
  let hasNextPage = true;
  let endCursor: string | null = null;

  // Paginate through all files to find Instagram files
  while (hasNextPage) {
    const filesQuery = await admin.graphql(`
      #graphql
      query($cursor: String) {
        files(first: 250, after: $cursor) {
          edges { 
            node { 
              id 
              alt
            } 
          }
          pageInfo {
            hasNextPage
            endCursor
          }
        }
      }
    `, { variables: { cursor: endCursor } });
    
    const filesJson = await filesQuery.json() as FilesQueryResponse;

    // Filter files with alt text matching Instagram post pattern: {username}-post_{id}
    // Pattern: anything-post_ (includes both old instagram-post_ and new username-post_ formats)
    const instagramFiles =
      filesJson.data?.files?.edges?.filter((edge) => {
        const alt = edge.node.alt || "";
        const isInstagramFile = alt.includes("-post_");
        if (isInstagramFile) {
          console.log(`  ✓ Matched: ${alt}`);
        }
        return isInstagramFile;
      }) || [];

    const pageFileIds = instagramFiles.map((edge) => edge.node.id);
    allFileIds = [...allFileIds, ...pageFileIds];
    
    console.log(`📄 Page ${endCursor || "1"}: Found ${pageFileIds.length} Instagram files`);

    hasNextPage = filesJson.data?.files?.pageInfo?.hasNextPage || false;
    endCursor = filesJson.data?.files?.pageInfo?.endCursor || null;
  }

  console.log(`🗑️ Found ${allFileIds.length} Instagram files to delete`);

  // Delete files in batches of 250 (Shopify limit)
  const batches = [];
  for (let i = 0; i < allFileIds.length; i += 250) {
    batches.push(allFileIds.slice(i, i + 250));
  }

  for (const batch of batches) {
    const deleteResponse = await admin.graphql(
      `
      #graphql
      mutation fileDelete($fileIds: [ID!]!) {
        fileDelete(fileIds: $fileIds) {
          deletedFileIds
          userErrors { field message }
        }
      }
    `,
      { variables: { fileIds: batch } },
    );

    const deleteJson = await deleteResponse.json() as { 
      data?: { 
        fileDelete?: { 
          deletedFileIds: string[]; 
          userErrors: Array<{ field?: string[]; message: string }>;
        } 
      } 
    };
    
    if (deleteJson.data?.fileDelete?.userErrors?.length) {
      console.error("❌ File deletion errors:", deleteJson.data.fileDelete.userErrors);
    } else {
      console.log(`✓ Deleted batch of ${batch.length} files`);
    }
  }

  return allFileIds;
}

/**
 * Delete all Instagram data (metaobjects and files)
 */
export async function deleteInstagramData(admin: ShopifyAdmin): Promise<ActionResponse> {
  try {
    const { postIds, listIds } = await deleteMetaobjects(admin);
    const fileIds = await deleteInstagramFiles(admin);

    const totalMetaobjects = postIds.length + listIds.length;

    console.log(
      `✓ Deleted ${totalMetaobjects} metaobjects and ${fileIds.length} files`,
    );

    return {
      success: true,
      deletedMetaobjects: totalMetaobjects,
      deletedFiles: fileIds.length,
      message: `Deleted ${totalMetaobjects} metaobjects and ${fileIds.length} files`,
    };
  } catch (error) {
    console.error("Delete error:", error);
    return {
      success: false,
      message: "Delete failed. Please try again.",
      status: 500,
    };
  }
}

/**
 * Generate theme editor URL for adding app block with deep linking
 * Uses Shopify's deep linking for simplified app block installation
 * @see https://shopify.dev/docs/apps/build/online-store/theme-app-extensions/configuration#app-blocks
 */
export function generateAppEmbedUrl(shop: string, template: string = "index"): string {
  const storeHandle = shop.replace(".myshopify.com", "");
  const apiKey = process.env.SHOPIFY_API_KEY!;
  const blockHandle = "instagram-carousel";

  // Deep link to theme editor with app block pre-selected
  // Format: addAppBlockId={client-id}/{block-handle}
  return `https://admin.shopify.com/store/${storeHandle}/themes/current/editor?template=${template}&addAppBlockId=${apiKey}/${blockHandle}`;
}


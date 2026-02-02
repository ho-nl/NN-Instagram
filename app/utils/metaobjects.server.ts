import type { ActionResponse } from "../types/instagram.types";
import type { 
  ShopifyAdmin, 
  MetaobjectsQueryResponse, 
  FilesQueryResponse,

} from "../types/shopify.types";

async function deleteMetaobjects(admin: ShopifyAdmin): Promise<{
  postIds: string[];
  listIds: string[];
}> {
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


async function deleteInstagramFiles(admin: ShopifyAdmin): Promise<string[]> {
  let allFileIds: string[] = [];
  let hasNextPage = true;
  let endCursor: string | null = null;

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

    const instagramFiles =
      filesJson.data?.files?.edges?.filter((edge) => {
        const alt = edge.node.alt || "";
        const isInstagramFile = alt.includes("-post_");
        return isInstagramFile;
      }) || [];

    const pageFileIds = instagramFiles.map((edge) => edge.node.id);
    allFileIds = [...allFileIds, ...pageFileIds];
    

    hasNextPage = filesJson.data?.files?.pageInfo?.hasNextPage || false;
    endCursor = filesJson.data?.files?.pageInfo?.endCursor || null;
  }

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

    await deleteResponse.json();
  }
  return allFileIds;
}

export async function deleteInstagramData(admin: ShopifyAdmin): Promise<ActionResponse> {
  try {
    const { postIds, listIds } = await deleteMetaobjects(admin);
    const fileIds = await deleteInstagramFiles(admin);

    const totalMetaobjects = postIds.length + listIds.length;

    return {
      success: true,
      deletedMetaobjects: totalMetaobjects,
      deletedFiles: fileIds.length,
      message: `Deleted ${totalMetaobjects} metaobjects and ${fileIds.length} files`,
    };
  } catch (error) {
    return {
      success: false,
      message: "Delete failed. Please try again.",
      status: 500,
    };
  }
}

export function generateAppEmbedUrl(shop: string, template: string = "index"): string {
  const storeHandle = shop.replace(".myshopify.com", "");
  const apiKey = process.env.SHOPIFY_API_KEY!;
  const blockHandle = "instagram-carousel";
  return `https://admin.shopify.com/store/${storeHandle}/themes/current/editor?template=${template}&addAppBlockId=${apiKey}/${blockHandle}`;
}


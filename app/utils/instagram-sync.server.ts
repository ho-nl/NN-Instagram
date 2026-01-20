/**
 * Server utilities for Instagram sync operations
 * Handles file uploads, metaobject management, and account switching
 */

import type { InstagramPost } from "../types/instagram.types";
import type { 
  ShopifyAdmin, 
  FileCreateResponse, 
  StagedUploadsCreateResponse,
  StagedUploadParameter,
  MetaobjectUpsertResponse,
  MetaobjectByHandleResponse,
  MetaobjectsQueryResponse,
  FilesQueryResponse
} from "../types/shopify.types";

/**
 * Create Shopify file from URL (for images)
 */
export async function createShopifyFile(
  admin: ShopifyAdmin,
  mediaUrl: string,
  alt: string,
  contentType: "IMAGE" | "VIDEO",
): Promise<FileCreateResponse> {
  const mutation = `#graphql
    mutation fileCreate($files: [FileCreateInput!]!) {
      fileCreate(files: $files) {
        files {
          id
          fileStatus
          alt
          createdAt
          ... on MediaImage {
            image {
              url
            }
          }
          ... on Video {
            originalSource {
              url
            }
          }
        }
        userErrors {
          field
          message
        }
      }
    }
  `;

  const response = await admin.graphql(mutation, {
    variables: {
      files: [
        {
          alt: alt,
          contentType: contentType,
          originalSource: mediaUrl,
        },
      ],
    },
  });

  const data = await response.json() as FileCreateResponse;
  return data;
}

/**
 * Upload video using staged upload (required for Instagram videos with temporary URLs)
 */
export async function uploadVideoWithStaging(
  admin: ShopifyAdmin,
  videoUrl: string,
  alt: string,
): Promise<FileCreateResponse> {
  try {
    // Step 1: Download video from Instagram
    const videoResponse = await fetch(videoUrl);
    if (!videoResponse.ok) {
      throw new Error(`Failed to download video: ${videoResponse.statusText}`);
    }

    const videoBlob = await videoResponse.blob();
    const videoArrayBuffer = await videoBlob.arrayBuffer();
    const fileSize = videoArrayBuffer.byteLength;

    // Step 2: Create staged upload
    const stagedMutation = `#graphql
      mutation stagedUploadsCreate($input: [StagedUploadInput!]!) {
        stagedUploadsCreate(input: $input) {
          stagedTargets {
            url
            resourceUrl
            parameters {
              name
              value
            }
          }
          userErrors {
            field
            message
          }
        }
      }
    `;

    const stagedResponse = await admin.graphql(stagedMutation, {
      variables: {
        input: [
          {
            resource: "VIDEO",
            filename: `${alt}.mp4`,
            mimeType: "video/mp4",
            fileSize: fileSize.toString(),
            httpMethod: "POST",
          },
        ],
      },
    });

    const stagedData = await stagedResponse.json() as StagedUploadsCreateResponse;
    const stagedTarget =
      stagedData.data?.stagedUploadsCreate?.stagedTargets?.[0];

    if (!stagedTarget) {
      throw new Error("Failed to create staged upload");
    }

    // Step 3: Upload to staged target
    const formData = new FormData();
    stagedTarget.parameters.forEach((param: StagedUploadParameter) => {
      formData.append(param.name, param.value);
    });
    formData.append("file", videoBlob, `${alt}.mp4`);

    const uploadResponse = await fetch(stagedTarget.url, {
      method: "POST",
      body: formData,
    });

    if (!uploadResponse.ok) {
      throw new Error(
        `Failed to upload to staged target: ${uploadResponse.statusText}`,
      );
    }

    // Step 4: Create the file in Shopify
    const fileData = await createShopifyFile(
      admin,
      stagedTarget.resourceUrl,
      alt,
      "VIDEO",
    );

    return fileData;
  } catch (error) {
    console.error(`Error uploading video ${alt}:`, error);
    const errorMessage =
      error instanceof Error ? error.message : "Unknown error";
    return {
      data: {
        fileCreate: {
          files: [],
          userErrors: [{ message: errorMessage }],
        },
      },
    };
  }
}

/**
 * Upload any media (image or video)
 */
export async function uploadMediaFile(
  admin: ShopifyAdmin,
  mediaUrl: string,
  mediaType: string,
  alt: string,
): Promise<FileCreateResponse> {
  try {
    const isVideo = mediaType === "VIDEO";

    if (isVideo) {
      // Videos need staged upload because Instagram URLs are temporary
      return await uploadVideoWithStaging(admin, mediaUrl, alt);
    } else {
      // Images can be uploaded directly
      const fileData = await createShopifyFile(admin, mediaUrl, alt, "IMAGE");
      return fileData;
    }
  } catch (error) {
    console.error(`Error uploading ${alt}:`, error);
    const errorMessage =
      error instanceof Error ? error.message : "Unknown error";
    return {
      data: {
        fileCreate: {
          files: [],
          userErrors: [{ message: errorMessage }],
        },
      },
    };
  }
}

/**
 * Upsert Instagram post metaobject (create or update)
 */
export async function upsertPostMetaobject(
  admin: ShopifyAdmin,
  post: InstagramPost,
  fileIds: string[],
  username: string,
): Promise<MetaobjectUpsertResponse> {
  const postHandle = `${username}-post-${post.id}`;

  const mutation = `#graphql
  mutation UpsertPostMetaObject($handle: MetaobjectHandleInput!, $metaobject: MetaobjectUpsertInput!) {
    metaobjectUpsert(handle: $handle, metaobject: $metaobject) {
      metaobject {
        id
        handle
        Data: field(key: "data"){
          value
        },
        Images: field(key: "images"){
          value
        },
        Caption: field(key: "caption"){
          value
        },
        Likes: field(key: "likes"){
          value
        },
        Comments: field(key: "comments"){
          value
        },
      }
      userErrors {
        field
        message
      }
    }
  }
  `;

  const response = await admin.graphql(mutation, {
    variables: {
      handle: {
        type: "instagram-post",
        handle: postHandle,
      },
      metaobject: {
        fields: [
          { key: "data", value: JSON.stringify(post) },
          { key: "images", value: JSON.stringify(fileIds) },
          { key: "caption", value: post.caption || "No caption" },
          { key: "likes", value: String(post.like_count) || "0" },
          { key: "comments", value: String(post.comments_count) || "0" },
        ],
      },
    },
  });

  const data = await response.json() as MetaobjectUpsertResponse;
  return data;
}

/**
 * Upsert Instagram list metaobject (create or update feed list)
 */
export async function upsertListMetaobject(
  admin: ShopifyAdmin,
  igData: { data: InstagramPost[] },
  postObjectIds: string[],
  username: string,
  displayName: string,
): Promise<MetaobjectUpsertResponse> {
  const mutation = `#graphql
  mutation UpsertListMetaObject($handle: MetaobjectHandleInput!, $metaobject: MetaobjectUpsertInput!) {
    metaobjectUpsert(handle: $handle, metaobject: $metaobject) {
      metaobject {
        id
        handle
        capabilities {
          publishable {
            status
          }
        }
        Data: field(key: "data"){
          value
        },
        Posts: field(key: "posts"){
          value
        },
        Username: field(key: "username" ){
          value
        },
        Name: field(key: "name"){
          value
        },
      }
      userErrors {
        field
        message
      }
    }
  }
  `;

  const listHandle = `${username}-feed-list`;

  const response = await admin.graphql(mutation, {
    variables: {
      handle: {
        type: "instagram-list",
        handle: listHandle,
      },
      metaobject: {
        fields: [
          { key: "data", value: JSON.stringify(igData) },
          { key: "posts", value: JSON.stringify(postObjectIds) },
          {
            key: "username",
            value: username || "instagram_user",
          },
          {
            key: "name",
            value: displayName || "Instagram User",
          },
        ],
      },
    },
  });

  const data = await response.json() as MetaobjectUpsertResponse;
  return data;
}

/**
 * Check if a post already exists by handle
 */
export async function getExistingPost(
  admin: ShopifyAdmin,
  postId: string,
  username: string,
): Promise<{
  metaobjectId: string;
  fileIds: string[];
  handle: string;
} | null> {
  const handle = `${username}-post-${postId}`;

  const query = `#graphql
    query GetPostByHandle($handle: String!) {
      metaobjectByHandle(handle: {type: "instagram-post", handle: $handle}) {
        id
        handle
        fields {
          key
          value
        }
      }
    }
  `;

  const response = await admin.graphql(query, {
    variables: { handle },
  });
  
  const data = await response.json() as {
    data?: {
      metaobjectByHandle?: {
        id: string;
        handle: string;
        fields: Array<{ key: string; value: string }>;
      };
    };
  };

  const metaobject = data.data?.metaobjectByHandle;

  if (!metaobject) {
    return null;
  }

  // Get the images field value (array of file IDs)
  const imagesField = metaobject.fields.find((f) => f.key === "images");
  const fileIds = imagesField ? JSON.parse(imagesField.value) : [];

  return {
    metaobjectId: metaobject.id,
    fileIds,
    handle: metaobject.handle,
  };
}

/**
 * Delete old account data when switching accounts
 */
export async function deleteOldAccountData(
  admin: ShopifyAdmin,
  oldUsername: string,
): Promise<void> {
  console.log(`🧹 Deleting old account data for @${oldUsername}`);

  // Delete old post metaobjects
  const oldPostsQuery = await admin.graphql(`
    #graphql
    query {
      metaobjects(type: "instagram-post", first: 250) {
        edges { 
          node { 
            id 
            handle
          } 
        }
      }
    }
  `);
  const oldPostsData = await oldPostsQuery.json() as MetaobjectsQueryResponse;
  const oldPostMetaobjects = oldPostsData.data?.metaobjects?.edges || [];

  // Filter posts that belong to old username
  const oldUsernamePrefix = `${oldUsername}-post-`;
  const postsToDelete = oldPostMetaobjects.filter((edge) =>
    edge.node.handle?.startsWith(oldUsernamePrefix),
  );

  console.log(`  Deleting ${postsToDelete.length} post metaobjects`);

  for (const edge of postsToDelete) {
    await admin.graphql(
      `#graphql
      mutation metaobjectDelete($id: ID!) {
        metaobjectDelete(id: $id) {
          deletedId
          userErrors { field message }
        }
      }
      `,
      { variables: { id: edge.node.id } },
    );
  }

  // Delete old list metaobject
  const oldListHandle = `${oldUsername}-feed-list`;
  const oldListQuery = await admin.graphql(
    `
    #graphql
    query GetListByHandle($handle: String!) {
      metaobjectByHandle(handle: {type: "instagram-list", handle: $handle}) {
        id
      }
    }
  `,
    {
      variables: { handle: oldListHandle },
    },
  );
  const oldListData = await oldListQuery.json();
  const oldListId = oldListData.data?.metaobjectByHandle?.id;

  if (oldListId) {
    console.log(`  Deleting list metaobject: ${oldListHandle}`);
    await admin.graphql(
      `#graphql
      mutation metaobjectDelete($id: ID!) {
        metaobjectDelete(id: $id) {
          deletedId
          userErrors { field message }
        }
      }
      `,
      { variables: { id: oldListId } },
    );
  }

  // Delete old files
  const oldFilesQuery = await admin.graphql(`
    #graphql
    query {
      files(first: 250, query: "alt:${oldUsername}-post_") {
        edges { 
          node { 
            id 
            alt
          } 
        }
      }
    }
  `);
  const oldFilesData = await oldFilesQuery.json() as FilesQueryResponse;
  const oldFiles =
    oldFilesData.data?.files?.edges?.filter((edge) =>
      edge.node.alt?.startsWith(`${oldUsername}-post_`),
    ) || [];

  if (oldFiles.length > 0) {
    const oldFileIds = oldFiles.map((edge) => edge.node.id);
    console.log(`  Deleting ${oldFileIds.length} files`);

    await admin.graphql(
      `#graphql
      mutation fileDelete($fileIds: [ID!]!) {
        fileDelete(fileIds: $fileIds) {
          deletedFileIds
          userErrors { field message }
        }
      }
      `,
      { variables: { fileIds: oldFileIds } },
    );
  }

  console.log(`✓ Cleanup complete for @${oldUsername}`);
}

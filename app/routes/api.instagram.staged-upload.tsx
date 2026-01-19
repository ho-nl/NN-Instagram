import type { HeadersFunction, LoaderFunctionArgs } from "react-router";
import { authenticate } from "../shopify.server";
import prisma from "../db.server";
import { projectUpdate } from "next/dist/build/swc/generated-native";
import { writeFile } from "fs/promises";
import { join } from "path";
import { boundary } from "@shopify/shopify-app-react-router/server";

// Types for Instagram data
export interface InstagramCarouselData {
  media_url: string;
  media_type: string;
  id: string;
  thumbnail_url?: string;
}

export interface InstagramPost {
  id: string;
  media_type: string;
  media_url: string;
  thumbnail_url?: string;
  permalink: string;
  caption?: string;
  timestamp: string;
  username: string;
  children?: {
    data: InstagramCarouselData[];
  };
  like_count?: number;
  comments_count?: number;
}

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { session, admin } = await authenticate.admin(request);

  // ========================================
  // LOGGING SETUP
  // ========================================
  const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
  const logDir = join(process.cwd(), "logs");
  const sessionLog = {
    timestamp: new Date().toISOString(),
    shop: session.shop,
    operations: [] as any[],
    summary: {} as any,
  };

  function addLog(operation: string, data: any) {
    sessionLog.operations.push({
      timestamp: new Date().toISOString(),
      operation,
      ...data,
    });
  }

  // ========================================
  // HELPER FUNCTION 1: Create Shopify file from URL (for images)
  // ========================================
  async function createShopifyFile(
    mediaUrl: string,
    alt: string,
    contentType: "IMAGE" | "VIDEO",
  ) {
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

    const data = await response.json();

    addLog("fileCreate", {
      input: { alt, contentType, mediaUrl },
      response: data,
      success: !data.data?.fileCreate?.userErrors?.length,
      fileIds: data.data?.fileCreate?.files?.map((f: any) => f.id) || [],
    });

    return data;
  }

  // ========================================
  // HELPER FUNCTION 2: Upload video using staged upload
  // ========================================
  async function uploadVideoWithStaging(videoUrl: string, alt: string) {
    try {
      // Step 1: Download video from Instagram
      const videoResponse = await fetch(videoUrl);
      if (!videoResponse.ok) {
        throw new Error(
          `Failed to download video: ${videoResponse.statusText}`,
        );
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

      const stagedData = await stagedResponse.json();
      const stagedTarget =
        stagedData.data?.stagedUploadsCreate?.stagedTargets?.[0];

      addLog("stagedUploadCreate", {
        input: { alt, fileSize, resource: "VIDEO" },
        response: stagedData,
        success: !!stagedTarget,
        targetUrl: stagedTarget?.url,
      });

      if (!stagedTarget) {
        throw new Error("Failed to create staged upload");
      }

      // Step 3: Upload to staged target
      const formData = new FormData();
      stagedTarget.parameters.forEach((param: any) => {
        formData.append(param.name, param.value);
      });
      formData.append("file", videoBlob, `${alt}.mp4`);

      const uploadResponse = await fetch(stagedTarget.url, {
        method: "POST",
        body: formData,
      });

      addLog("stagedUploadSubmit", {
        alt,
        uploadUrl: stagedTarget.url,
        status: uploadResponse.status,
        ok: uploadResponse.ok,
      });

      if (!uploadResponse.ok) {
        throw new Error(
          `Failed to upload to staged target: ${uploadResponse.statusText}`,
        );
      }

      // Step 4: Create the file in Shopify
      const fileData = await createShopifyFile(
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

  // ========================================
  // HELPER FUNCTION 3: Upload any media (image or video)
  // ========================================
  async function uploadMediaFile(
    mediaUrl: string,
    mediaType: string,
    alt: string,
  ) {
    try {
      const isVideo = mediaType === "VIDEO";

      if (isVideo) {
        // Videos need staged upload because Instagram URLs are temporary
        return await uploadVideoWithStaging(mediaUrl, alt);
      } else {
        // Images can be uploaded directly
        const fileData = await createShopifyFile(mediaUrl, alt, "IMAGE");
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

  // ========================================
  // HELPER FUNCTION 4: Create Instagram post metaobject
  // ========================================
  // async function createPostMetaobject(post: InstagramPost, fileIds: string[]) {
  //   const mutation = `#graphql
  //     mutation metaobjectCreate($metaobject: MetaobjectCreateInput!) {
  //       metaobjectCreate(metaobject: $metaobject) {
  //         metaobject {
  //           id
  //           handle
  //         }
  //         userErrors {
  //           field
  //           message
  //         }
  //       }
  //     }
  //   `;

  //   const response = await admin.graphql(mutation, {
  //     variables: {
  //       metaobject: {
  //         type: "instagram-post",
  //         fields: [
  //           { key: "data", value: JSON.stringify(post) },
  //           { key: "image", value: JSON.stringify(fileIds) },
  //           { key: "caption", value: post.caption || "No caption" },
  //         ],
  //       },
  //     },
  //   });

  //   const data = await response.json();
  //   return data;
  // }

  // ========================================
  // HELPER FUNCTION 4.5: metaObjectUpsert instead of Create to avoid duplicates
  // ========================================
  async function upsertPostMetaobject(post: InstagramPost, fileIds: string[], username: string) {
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

    const data = await response.json();

    addLog("metaobjectUpsert_post", {
      postId: post.id,
      handle: postHandle,
      fileCount: fileIds.length,
      fileIds,
      input: {
        caption: post.caption,
        likes: post.like_count,
        comments: post.comments_count,
        username: post.username,
      },
      response: data,
      success: !data.data?.metaobjectUpsert?.userErrors?.length,
      metaobjectId: data.data?.metaobjectUpsert?.metaobject?.id,
      userErrors: data.data?.metaobjectUpsert?.userErrors || [],
    });

    return data;
  }

  // ========================================
  // HELPER FUNCTION 4.6: Upsert Instagram list metaobject
  // ========================================
  async function upsertListMetaobject(igData: any, postObjectIds: string[], username: string, displayName: string) {
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

    const data = await response.json();

    addLog("metaobjectUpsert_list", {
      handle: listHandle,
      postCount: postObjectIds.length,
      postObjectIds,
      response: data,
      success: !data.data?.metaobjectUpsert?.userErrors?.length,
      metaobjectId: data.data?.metaobjectUpsert?.metaobject?.id,
      capabilities: data.data?.metaobjectUpsert?.metaobject?.capabilities,
      userErrors: data.data?.metaobjectUpsert?.userErrors || [],
    });

    return data;
  }

  // ========================================
  // HELPER FUNCTION 5: Check if a single post exists by handle
  // ========================================
  async function getExistingPost(postId: string, username: string) {
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
    const data = await response.json();

    const metaobject = data.data?.metaobjectByHandle;

    if (!metaobject) {
      return null;
    }

    // Get the images field value (array of file IDs)
    const imagesField = metaobject.fields.find((f: any) => f.key === "images");
    const fileIds = imagesField ? JSON.parse(imagesField.value) : [];

    return {
      metaobjectId: metaobject.id,
      fileIds,
      handle: metaobject.handle,
    };
  }

  // ========================================
  // MAIN LOGIC STARTS HERE
  // ========================================

  // Get Instagram account from database
  const account = await prisma.socialAccount.findUnique({
    where: {
      shop_provider: {
        shop: session.shop,
        provider: "instagram",
      },
    },
  });

  if (!account) {
    return { error: "No Instagram account connected" };
  }

  // Check if Instagram token has expired
  if (account.expiresAt && new Date(account.expiresAt) < new Date()) {
    return {
      error:
        "Instagram token has expired. Please reconnect your Instagram account.",
      expired: true,
    };
  }

  // Fetch posts from Instagram API
  const igResponse = await fetch(
    `https://graph.instagram.com/me/media?fields=id,media_type,media_url,thumbnail_url,view_count,like_count,comments_count,permalink,caption,timestamp,children{media_url,media_type,thumbnail_url}&access_token=${account.accessToken}`,
  );
  const igData = await igResponse.json();

  // Check if Instagram API returned an error (e.g., invalid/expired token)
  if (igData.error) {
    console.error("Instagram API error:", igData.error);
    return {
      error: `Instagram API error: ${igData.error.message || "Invalid or expired token"}. Please reconnect your Instagram account.`,
      igError: igData.error,
    };
  }

  const igUserResponse = await fetch(
    `https://graph.instagram.com/me/?fields=followers_count,name,username&access_token=${account.accessToken}`,
  );
  const userData = await igUserResponse.json();

  // Check user data response
  if (userData.error) {
    console.error("Instagram user API error:", userData.error);
    return {
      error: `Instagram API error: ${userData.error.message || "Invalid or expired token"}. Please reconnect your Instagram account.`,
      igError: userData.error,
    };
  }

  const posts = igData.data as InstagramPost[];
  const currentUsername = userData.username;
  const displayName = userData.name;

  if (!posts || posts.length === 0) {
    return {
      success: true,
      message: "No Instagram posts found to sync",
      postsCount: 0,
    };
  }

  // ========================================
  // AUTO-DELETE OLD ACCOUNT DATA ON SWITCH
  // ========================================
  // Check if the account username has changed (account switch detected)
  if (account.username && account.username !== currentUsername) {
    console.log(`🔄 Account switch detected: ${account.username} → ${currentUsername}`);
    
    addLog("accountSwitch", {
      oldUsername: account.username,
      newUsername: currentUsername,
      action: "deleting old account data",
    });

    // Delete all metaobjects with old username prefix
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
    const oldPostsData = await oldPostsQuery.json();
    const oldPostMetaobjects = oldPostsData.data?.metaobjects?.edges || [];

    // Filter posts that belong to old username
    const oldUsernamePrefix = `${account.username}-post-`;
    const postsToDelete = oldPostMetaobjects.filter((edge: any) => 
      edge.node.handle?.startsWith(oldUsernamePrefix)
    );

    console.log(`  Deleting ${postsToDelete.length} metaobjects from old account @${account.username}`);

    // Delete old post metaobjects
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
        { variables: { id: edge.node.id } }
      );
    }

    // Delete old list metaobject
    const oldListHandle = `${account.username}-feed-list`;
    const oldListQuery = await admin.graphql(`
      #graphql
      query GetListByHandle($handle: String!) {
        metaobjectByHandle(handle: {type: "instagram-list", handle: $handle}) {
          id
        }
      }
    `, {
      variables: { handle: oldListHandle }
    });
    const oldListData = await oldListQuery.json();
    const oldListId = oldListData.data?.metaobjectByHandle?.id;

    if (oldListId) {
      console.log(`  Deleting old list metaobject: ${oldListHandle}`);
      await admin.graphql(
        `#graphql
        mutation metaobjectDelete($id: ID!) {
          metaobjectDelete(id: $id) {
            deletedId
            userErrors { field message }
          }
        }
        `,
        { variables: { id: oldListId } }
      );
    }

    // Delete old files
    const oldFilesQuery = await admin.graphql(`
      #graphql
      query {
        files(first: 250, query: "alt:${account.username}-post_") {
          edges { 
            node { 
              id 
              alt
            } 
          }
        }
      }
    `);
    const oldFilesData = await oldFilesQuery.json();
    const oldFiles = oldFilesData.data?.files?.edges?.filter((edge: any) =>
      edge.node.alt?.startsWith(`${account.username}-post_`)
    ) || [];

    if (oldFiles.length > 0) {
      const oldFileIds = oldFiles.map((edge: any) => edge.node.id);
      console.log(`  Deleting ${oldFileIds.length} files from old account @${account.username}`);
      
      await admin.graphql(
        `#graphql
        mutation fileDelete($fileIds: [ID!]!) {
          fileDelete(fileIds: $fileIds) {
            deletedFileIds
            userErrors { field message }
          }
        }
        `,
        { variables: { fileIds: oldFileIds } }
      );
    }

    addLog("accountSwitchCleanup", {
      deletedMetaobjects: postsToDelete.length + (oldListId ? 1 : 0),
      deletedFiles: oldFiles.length,
    });

    console.log(`✓ Cleanup complete for old account @${account.username}`);
  }

  // Update the stored username in the database
  if (!account.username || account.username !== currentUsername) {
    await prisma.socialAccount.update({
      where: { id: account.id },
      data: { username: currentUsername },
    });
    console.log(`✓ Updated stored username to @${currentUsername}`);
  }

  addLog("fetchInstagramPosts", {
    postsCount: posts.length,
    posts: posts.map((p) => ({
      id: p.id,
      media_type: p.media_type,
      has_children: !!p.children,
      children_count: p.children?.data?.length || 0,
      likes: p.like_count,
      comments: p.comments_count,
    })),
  });

  console.log(`📸 Syncing ${posts.length} Instagram posts`);

  // Track results
  const uploadResults: any[] = [];
  const postObjectIds: string[] = [];
  let existingCount = 0;

  // Loop through each Instagram post
  for (const post of posts) {
    // Array to collect all file IDs for this post
    let fileIds: string[] = [];

    // Check if post already exists by handle
    const existingPost = await getExistingPost(post.id, currentUsername);

    // UPDATING EXISTING POSTS LOGIC
    // If post already exists, we update it with new data (likes, comments) but reuse existing files

    if (existingPost) {
      existingCount++;
      console.log(`🔄 Updating existing post ${post.id}`);

      // Reuse existing file IDs
      fileIds = existingPost.fileIds;

      addLog("postProcessing", {
        postId: post.id,
        action: "update",
        reason: "metaobjectByHandle found existing post",
        existingMetaobjectId: existingPost.metaobjectId,
        reusingFileIds: fileIds.length,
        fileIds,
      });

      // Update the metaobject with new data (likes, comments, etc.) but keep same files
      const metaobjectResult = await upsertPostMetaobject(post, fileIds, currentUsername);

      // Check for errors
      if (metaobjectResult.data?.metaobjectUpsert?.userErrors?.length > 0) {
        console.error(
          `  ✗ Error:`,
          metaobjectResult.data.metaobjectUpsert.userErrors,
        );
      } else {
        const metaobjectId =
          metaobjectResult.data?.metaobjectUpsert?.metaobject?.id;
        postObjectIds.push(metaobjectId);
      }

      console.log(`✓ Updated post ${post.id} successfully.`);
    } else {
      addLog("postProcessing", {
        postId: post.id,
        action: "create",
        reason: "existingKeys.has(post.id) = false",
        mediaType: post.media_type,
        isCarousel: post.media_type === "CAROUSEL_ALBUM",
        childrenCount: post.children?.data?.length || 0,
      });

      // Handle different post types
      if (post.media_type === "CAROUSEL_ALBUM" && post.children?.data) {
        // This is a carousel with multiple images/videos
        for (let i = 0; i < post.children.data.length; i++) {
          const child = post.children.data[i];
          const childAlt = `${currentUsername}-post_${post.id}_${child.id}`;

          // Upload the child media
          const result = await uploadMediaFile(
            child.media_url,
            child.media_type,
            childAlt,
          );

          // Get the file IDs
          const childFileIds = (result.data?.fileCreate?.files || []).map(
            (f: any) => f.id,
          );
          fileIds.push(...childFileIds);
          uploadResults.push(result);
        }
      } else {
        // This is a single image or video
        const alt = `${currentUsername}-post_${post.id}`;

        // Upload the media
        const result = await uploadMediaFile(
          post.media_url,
          post.media_type,
          alt,
        );

        // Get the file IDs
        const singleFileIds = (result.data?.fileCreate?.files || []).map(
          (f: any) => f.id,
        );
        fileIds.push(...singleFileIds);
        uploadResults.push(result);
      }

      // Create metaobject if we have file IDs
      if (fileIds.length > 0) {
        const metaobjectResult = await upsertPostMetaobject(post, fileIds, currentUsername);

        // Check for errors
        if (metaobjectResult.data?.metaobjectUpsert?.userErrors?.length > 0) {
          console.error(
            `  ✗ Error:`,
            metaobjectResult.data.metaobjectUpsert.userErrors,
          );
        } else {
          const metaobjectId =
            metaobjectResult.data?.metaobjectUpsert?.metaobject?.id;
          postObjectIds.push(metaobjectId);
        }
      }
    }
  }

  // After processing all posts, create or update the Instagram list metaobject

  // Create Instagram list metaobject
  if (postObjectIds.length > 0) {
    const listResult = await upsertListMetaobject(igData, postObjectIds, currentUsername, displayName);

    if (listResult.data?.metaobjectUpsert?.userErrors?.length > 0) {
      console.error(
        `✗ List error:`,
        listResult.data.metaobjectUpsert.userErrors,
      );
    }
  }

  // Write log file
  sessionLog.summary = {
    postsProcessed: posts.length,
    postsUploaded: postObjectIds.length,
    existingPostsCount: existingCount,
    operationsCount: sessionLog.operations.length,
    fileUploads: sessionLog.operations.filter(
      (op) => op.operation === "fileCreate",
    ).length,
    metaobjectUpserts: sessionLog.operations.filter((op) =>
      op.operation.startsWith("metaobjectUpsert"),
    ).length,
    errors: sessionLog.operations.filter(
      (op) => op.hasOwnProperty("success") && !op.success,
    ).length,
  };

  try {
    const logPath = join(logDir, `instagram-sync-${timestamp}.json`);
    await writeFile(logPath, JSON.stringify(sessionLog, null, 2));
    console.log(`📝 Log file written to: ${logPath}`);
  } catch (error) {
    console.error("Failed to write log file:", error);
  }

  return {
    success: true,
    username: currentUsername,
    displayName,
    // posts,
    // postsProcessed: posts.length,
    // postsUploaded: postObjectIds.length,
    // uploadResults,
    // postObjectIds,
    // logFile: `logs/instagram-sync-${timestamp}.json`,
  };
};
export const headers: HeadersFunction = (headersArgs) => {
  return boundary.headers(headersArgs);
};

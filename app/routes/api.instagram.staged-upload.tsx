import type { HeadersFunction, ActionFunctionArgs } from "react-router";
import { authenticate } from "../shopify.server";
import { boundary } from "@shopify/shopify-app-react-router/server";
import { InstagramPost } from "app/types/instagram.types";
import {
  uploadMediaFile,
  upsertPostMetaobject,
  upsertListMetaobject,
  getExistingPost,
  deleteOldAccountData,
} from "../utils/instagram-sync.server";
import {
  getInstagramAccount,
  updateAccountUsername,
} from "../utils/account.server";

export const action = async ({ request }: ActionFunctionArgs) => {
  const { session, admin } = await authenticate.admin(request);

  // Get Instagram account from database using centralized function
  const account = await getInstagramAccount(session.shop);

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
  const igResponse = await fetch(
    `https://graph.instagram.com/me/media?fields=id,media_type,media_url,thumbnail_url,view_count,like_count,comments_count,permalink,caption,timestamp,children{media_url,media_type,thumbnail_url}&access_token=${account.accessToken}`,
  );
  const igData = await igResponse.json();

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

  if (userData.error) {
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

  if (account.username && account.username !== currentUsername) {
    await deleteOldAccountData(admin, account.username);
  }

  if (!account.username || account.username !== currentUsername) {
    await updateAccountUsername(account.id, currentUsername);
  }

  const postObjectIds: string[] = [];

  for (const post of posts) {
    let fileIds: string[] = [];
    const existingPost = await getExistingPost(admin, post.id, currentUsername);

    if (existingPost) {
      fileIds = existingPost.fileIds;

      const metaobjectResult = await upsertPostMetaobject(
        admin,
        post,
        fileIds,
        currentUsername,
      );

      if (
        metaobjectResult.data?.metaobjectUpsert?.userErrors &&
        metaobjectResult.data.metaobjectUpsert.userErrors.length > 0
      ) {
        console.error(
          `Error updating post ${post.id}:`,
          metaobjectResult.data.metaobjectUpsert.userErrors,
        );
      } else {
        const metaobjectId =
          metaobjectResult.data?.metaobjectUpsert?.metaobject?.id;
        if (metaobjectId) {
          postObjectIds.push(metaobjectId);
        }
      }
    } else {
      if (post.media_type === "CAROUSEL_ALBUM" && post.children?.data) {
        for (let i = 0; i < post.children.data.length; i++) {
          const child = post.children.data[i];
          const childAlt = `${currentUsername}-post_${post.id}_${child.id}`;

          const result = await uploadMediaFile(
            admin,
            child.media_url,
            child.media_type,
            childAlt,
          );

          const childFileIds = (result.data?.fileCreate?.files || []).map(
            (f) => f.id,
          );
          fileIds.push(...childFileIds);
        }
      } else {
        const alt = `${currentUsername}-post_${post.id}`;

        const result = await uploadMediaFile(
          admin,
          post.media_url,
          post.media_type,
          alt,
        );

        const singleFileIds = (result.data?.fileCreate?.files || []).map(
          (f) => f.id,
        );
        fileIds.push(...singleFileIds);
      }

      if (fileIds.length > 0) {
        const metaobjectResult = await upsertPostMetaobject(
          admin,
          post,
          fileIds,
          currentUsername,
        );

        if (
          metaobjectResult.data?.metaobjectUpsert?.userErrors &&
          metaobjectResult.data.metaobjectUpsert.userErrors.length > 0
        ) {
          console.error(
            `Error creating post ${post.id}:`,
            metaobjectResult.data.metaobjectUpsert.userErrors,
          );
        } else {
          const metaobjectId =
            metaobjectResult.data?.metaobjectUpsert?.metaobject?.id;
          if (metaobjectId) {
            postObjectIds.push(metaobjectId);
          }
        }
      }
    }
  }

  if (postObjectIds.length > 0) {
    const listResult = await upsertListMetaobject(
      admin,
      igData,
      postObjectIds,
      currentUsername,
      displayName,
    );

    if (
      listResult.data?.metaobjectUpsert?.userErrors &&
      listResult.data.metaobjectUpsert.userErrors.length > 0
    ) {
      console.error(
        `Error creating list:`,
        listResult.data.metaobjectUpsert.userErrors,
      );
    }
  }

  return {
    success: true,
    username: currentUsername,
    displayName,
  };
};
export const headers: HeadersFunction = (headersArgs) => {
  return boundary.headers(headersArgs);
};

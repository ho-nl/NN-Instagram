/**
 * Server-side utilities for Instagram account operations
 */

import type { InstagramAccount, SyncStats } from "../types/instagram.types";
import type { ShopifyAdmin, MetaobjectsQueryResponse, FilesQueryResponse } from "../types/shopify.types";

/**
 * Fetch Instagram profile information from Graph API
 */
export async function getInstagramProfile(
  accessToken: string,
): Promise<InstagramAccount | null> {
  try {
    const profileResponse = await fetch(
      `https://graph.instagram.com/me?fields=id,username,profile_picture_url,media_count&access_token=${accessToken}`,
    );
    const profileData = await profileResponse.json();

    return {
      username: profileData.username || "Unknown",
      userId: profileData.id,
      profilePicture: profileData.profile_picture_url,
      connectedAt: new Date().toISOString(),
    };
  } catch (error) {
    console.error("Error fetching Instagram profile:", error);
    return null;
  }
}

/**
 * Get sync statistics from Shopify metaobjects and files
 */
export async function getSyncStats(admin: ShopifyAdmin): Promise<SyncStats> {
  try {
    // Count nn_instagram_post metaobjects (all accounts)
    const postsCountQuery = await admin.graphql(`#graphql
      query {
        metaobjects(type: "nn_instagram_post", first: 250) {
          nodes {
            id
          }
        }
      }
    `);
    const postsCountData = await postsCountQuery.json();

    // Get nn_instagram_list metaobjects (all accounts) and last sync time
    const listQuery = await admin.graphql(`#graphql
      query {
        metaobjects(type: "nn_instagram_list", first: 10) {
          nodes {
            id
            fields {
              key
              value
            }
            updatedAt
          }
        }
      }
    `);
    const listData = await listQuery.json();

    // Count files with -post_ pattern in alt text (covers all username prefixes)
    const filesCountQuery = await admin.graphql(`#graphql
      query {
        files(first: 250, query: "alt:-post_") {
          edges {
            node {
              id
              alt
            }
          }
        }
      }
    `);
    const filesCountData = await filesCountQuery.json() as FilesQueryResponse;

    // Filter files to only those with pattern: {username}-post_
    const instagramFiles =
      filesCountData.data?.files?.edges?.filter((edge) =>
        edge.node.alt?.includes("-post_"),
      ) || [];

    // Calculate metaobjects count: posts + lists
    const postsCount = postsCountData.data?.metaobjects?.nodes?.length || 0;
    const listCount = listData.data?.metaobjects?.nodes?.length || 0;

    // Get most recent update time from any list
    const lastSyncTime = listData.data?.metaobjects?.nodes?.[0]?.updatedAt || null;

    return {
      lastSyncTime,
      postsCount,
      filesCount: instagramFiles.length,
      metaobjectsCount: postsCount + listCount,
    };
  } catch (error) {
    console.error("Error fetching sync stats:", error);
    return {
      lastSyncTime: null,
      postsCount: 0,
      filesCount: 0,
      metaobjectsCount: 0,
    };
  }
}

/**
 * Get available theme pages/templates
 */
export async function getThemePages(
  admin: ShopifyAdmin,
): Promise<Array<{ label: string; value: string }>> {
  try {
    // Get the published theme
    const themesQuery = await admin.graphql(`
      #graphql
      query {
        themes(first: 1, roles: MAIN) {
          nodes {
            id
            name
            role
          }
        }
      }
    `);
    const themesData = await themesQuery.json();
    const publishedTheme = themesData.data?.themes?.nodes?.[0];

    if (publishedTheme) {
      // Common Shopify theme templates
      return [
        { label: "Home Page", value: "index" },
        { label: "Product Page", value: "product" },
        { label: "Collection Page", value: "collection" },
        { label: "Page", value: "page" },
        { label: "Blog", value: "blog" },
        { label: "Article", value: "article" },
        { label: "Cart", value: "cart" },
        { label: "Search", value: "search" },
      ];
    }
  } catch (error) {
    console.error("Error fetching theme pages:", error);
  }

  return [];
}

/**
 * Check which templates have the Instagram app block installed
 * Returns an object mapping template names to their installation status
 * 
 * Alternative simpler approach: Just check if templates exist and have sections
 * The UI can guide users to add the block via theme editor links
 */
export async function checkAppBlockInstallation(
  admin: ShopifyAdmin,
): Promise<Record<string, boolean>> {
  const installationStatus: Record<string, boolean> = {};

  // Initialize all templates as false
  const templates = ["index", "product", "collection", "page", "blog", "article", "cart", "search"];
  templates.forEach(template => {
    installationStatus[template] = false;
  });

  try {
    // Get the published theme
    const themesQuery = await admin.graphql(`
      #graphql
      query {
        themes(first: 1, roles: MAIN) {
          nodes {
            id
            name
          }
        }
      }
    `);
    const themesData = await themesQuery.json();
    const publishedTheme = themesData.data?.themes?.nodes?.[0];

    if (!publishedTheme) {
      console.log("No published theme found");
      return installationStatus;
    }

    // Fetch all relevant theme files in one query
    let hasNextPage = true;
    let cursor: string | null = null;

    while (hasNextPage) {
      const filesQuery = await admin.graphql(`
        #graphql
        query ThemeFilesForBlocks($themeId: ID!, $after: String) {
          theme(id: $themeId) {
            files(
              first: 50
              after: $after
              filenames: [
                "sections/*.liquid"
                "templates/*.json"
                "templates/customers/*.json"
                "config/settings_data.json"
              ]
            ) {
              edges {
                cursor
                node {
                  filename
                  contentType
                  body {
                    ... on OnlineStoreThemeFileBodyText { content }
                  }
                }
              }
              pageInfo { hasNextPage endCursor }
            }
          }
        }
      `, {
        variables: {
          themeId: publishedTheme.id,
          after: cursor,
        },
      });

      const filesData = await filesQuery.json() as {
        data?: {
          theme?: {
            files?: {
              edges: Array<{
                cursor: string;
                node: {
                  filename: string;
                  contentType: string;
                  body?: { content?: string };
                };
              }>;
              pageInfo: { hasNextPage: boolean; endCursor: string };
            };
          };
        };
      };
      const edges = filesData.data?.theme?.files?.edges || [];
      const pageInfo = filesData.data?.theme?.files?.pageInfo;

      console.log(`📦 Fetched ${edges.length} theme files...`);

      // Check each file for app block
      for (const edge of edges) {
        const file = edge.node;
        const content = file.body?.content;
        
        if (content) {
          // For JSON files, parse and check
          if (file.filename.endsWith('.json')) {
            try {
              // Strip comments from JSON (Shopify theme files may have them)
              // Remove /* ... */ style comments
              let cleanContent = content.replace(/\/\*[\s\S]*?\*\//g, '');
              // Remove // ... style comments
              cleanContent = cleanContent.replace(/\/\/.*$/gm, '');
              // Trim any leading/trailing whitespace
              cleanContent = cleanContent.trim();
              
              const parsedContent = JSON.parse(cleanContent);
              const hasBlock = checkForAppBlock(parsedContent);
              
              console.log(`  Checking ${file.filename}: ${hasBlock ? '✓ HAS BLOCK' : '✗ no block'}`);
              
              if (hasBlock) {
                // Extract template name from filename
                const match = file.filename.match(/templates\/([^/]+)\.json/);
                if (match) {
                  const templateName = match[1];
                  console.log(`    Extracted template name: ${templateName}`);
                  if (templates.includes(templateName)) {
                    installationStatus[templateName] = true;
                    console.log(`    ✓ Marked ${templateName} as having app block`);
                  } else {
                    console.log(`    ⚠️  Template ${templateName} not in tracked list`);
                  }
                } else {
                  console.log(`    ⚠️  Could not extract template name from ${file.filename}`);
                }
              }
            } catch (parseError) {
              // If JSON parsing fails, try searching the raw content as a string
              // This handles files with invalid JSON but may still contain our block reference
              const hasBlock = content.includes('instagram-carousel') || 
                               content.includes('instagram-feed') ||
                               /shopify:\/\/apps\/[^/]+\/blocks\/instagram-carousel/.test(content);
              
              if (hasBlock) {
                const match = file.filename.match(/templates\/([^/]+)\.json/);
                if (match) {
                  const templateName = match[1];
                  if (templates.includes(templateName)) {
                    installationStatus[templateName] = true;
                    console.log(`  ✓ Instagram app block found in ${file.filename} (via string search)`);
                  }
                }
              } else {
                console.log(`  ⚠️  Skipped ${file.filename} (could not parse, no block found)`);
              }
            }
          }
          // For Liquid files, do a simple string search
          else if (file.filename.endsWith('.liquid')) {
            const hasBlock = checkForAppBlock(content);
            if (hasBlock) {
              console.log(`  ✓ Instagram app block found in section: ${file.filename}`);
            }
          }
        }
      }

      // Check pagination
      hasNextPage = pageInfo?.hasNextPage || false;
      cursor = pageInfo?.endCursor || null;
      
      if (hasNextPage) {
        console.log(`📄 More pages available, fetching next batch...`);
      }
    }

    console.log('\n📊 Final installation status:', installationStatus);
    return installationStatus;
  } catch (error) {
    console.error("Error checking app block installation:", error);
    return installationStatus;
  }
}

/**
 * Helper function to check if content contains our app block
 */
function checkForAppBlock(content: string | { sections?: Record<string, unknown> }): boolean {
  // If content is a string (Liquid file or unparsed JSON), search as string
  if (typeof content === 'string') {
    const patterns = [
      'instagram-feed',
      'instagram_feed',
      'app--',
    ];
    return patterns.some(pattern => content.includes(pattern));
  }
  
  // If content is parsed JSON object
  if (!content || !content.sections) {
    return false;
  }

  // Search patterns for our app block
  const patterns = [
    'instagram-carousel',
    'instagram-feed',
    '/blocks/instagram-carousel',
  ];

  // Convert content to string for easier searching
  const contentStr = JSON.stringify(content);
  
  // Check if any pattern matches
  const hasPattern = patterns.some(pattern => contentStr.includes(pattern));
  
  if (hasPattern) {
    return true;
  }
  
  // Also check the actual app block format with client ID
  // App blocks look like: "shopify://apps/{clientId}/blocks/instagram-carousel/{uuid}"
  const appBlockRegex = /shopify:\/\/apps\/[^/]+\/blocks\/[^/]+/;
  return appBlockRegex.test(contentStr);
}

/**
 * Get Instagram posts for preview
 */
export async function getInstagramPostsForPreview(admin: ShopifyAdmin, limit: number = 12) {
  try {
    const query = await admin.graphql(`#graphql
      query GetInstagramPosts($limit: Int!) {
        metaobjects(type: "nn_instagram_post", first: $limit) {
          nodes {
            id
            handle
            fields {
              key
              value
              reference {
                ... on MediaImage {
                  id
                  image {
                    url
                    altText
                  }
                }
              }
              references(first: 10) {
                nodes {
                  ... on MediaImage {
                    id
                    image {
                      url
                      altText
                    }
                  }
                  ... on Video {
                    id
                    sources {
                      url
                      mimeType
                    }
                    preview {
                      image {
                        url
                      }
                    }
                  }
                }
              }
            }
          }
        }
      }
    `, {
      variables: {
        limit: limit
      }
    });
    
    const data = await query.json();
    const posts = data.data?.metaobjects?.nodes || [];
    
    return posts.map((post: any) => {
      const fields = post.fields.reduce((acc: any, field: any) => {
        acc[field.key] = field;
        return acc;
      }, {});
      
      // Get images from references
      const images = fields.images?.references?.nodes || [];
      const firstImage = images[0];
      
      // For videos, use the preview image; for images, use the image URL
      const imageUrl = firstImage?.sources 
        ? firstImage?.preview?.image?.url || "" 
        : firstImage?.image?.url || "";
      
      return {
        id: post.id,
        handle: post.handle,
        caption: fields.caption?.value || "",
        likes: parseInt(fields.likes?.value || "0"),
        comments: parseInt(fields.comments?.value || "0"),
        imageUrl: imageUrl,
        mediaType: firstImage?.sources ? "video" : "image",
      };
    });
  } catch (error) {
    console.error("Error fetching Instagram posts for preview:", error);
    return [];
  }
}


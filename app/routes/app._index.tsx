import type { LoaderFunctionArgs } from "react-router";
import { Outlet, useLoaderData, useNavigate } from "react-router";
import { AppProvider } from "@shopify/shopify-app-react-router/react";
import { authenticate } from "../shopify.server";
import { useEffect } from "react";

import { boundary } from "@shopify/shopify-app-react-router/server";
import type { HeadersFunction } from "react-router";

const MetaobjectDefinition = `#graphql
        mutation CreateMetaobjectDefinition($definition: MetaobjectDefinitionCreateInput!) {
          metaobjectDefinitionCreate(definition: $definition) {
            metaobjectDefinition {
              name
              type
              fieldDefinitions {
                name
                key
              }
            }
            userErrors {
              field
              message
              code
            }
          }
        }`;

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { admin } = await authenticate.admin(request);

  try {
    // First check if the metaobject definition already exists
    const checkResponse = await admin.graphql(
      `#graphql
      query {
        metaobjectDefinitions(first: 50) {
          edges {
            node {
              name
              type
            }
          }
        }
      }`,
    );

    const checkResult = await checkResponse.json();
    const definitions = checkResult?.data?.metaobjectDefinitions?.edges || [];
    const existsList = definitions.some(
      (edge: { node: { type: string } }) => edge.node.type === "instagram-list",
    );
    const existsPost = definitions.some(
      (edge: { node: { type: string } }) => edge.node.type === "instagram-post",
    );

    let createdList = false;
    let createdPost = false;
    let errors: string[] = [];

    // Create post definition if missing
    if (!existsPost) {
      const postResponse = await admin.graphql(MetaobjectDefinition, {
        variables: {
          definition: {
            name: "Instagram Post",
            type: "instagram-post",
            description: "A metaobject definition for Instagram posts",
            access: {
              storefront: "PUBLIC_READ",
            },
            capabilities: {
              publishable: {
                enabled: false,
              },
            },
            fieldDefinitions: [
              {
                key: "data",
                name: "Data",
                type: "json",
                required: true,
              },
              {
                key: "images",
                name: "Images",
                type: "list.file_reference",
              },
              {
                key: "caption",
                name: "Caption",
                type: "multi_line_text_field",
              },
              {
                key: "likes",
                name: "Likes",
                type: "number_integer",
              },
              {
                key: "comments",
                name: "Comments",
                type: "number_integer",
              },
            ],
          },
        },
      });

      const postResult = await postResponse.json();
      if (
        postResult?.data?.metaobjectDefinitionCreate?.userErrors?.length > 0
      ) {
        errors = errors.concat(
          postResult.data.metaobjectDefinitionCreate.userErrors.map(
            (err: { field?: string[]; message: string }) =>
              `${err.field?.join(".")}: ${err.message}`,
          ),
        );
        console.error("Metaobject post creation errors:", errors);
      } else if (
        postResult?.data?.metaobjectDefinitionCreate?.metaobjectDefinition
      ) {
        createdPost = true;
        console.log(
          "Metaobject post definition created:",
          postResult.data.metaobjectDefinitionCreate.metaobjectDefinition,
        );
      }
    }

    // Create list definition if missing
    if (!existsList) {
      // First, get the instagram-post definition ID
      const postDefQuery = await admin.graphql(
        `#graphql
        query {
          metaobjectDefinitions(first: 50) {
            edges {
              node {
                id
                type
              }
            }
          }
        }`,
      );

      const postDefResult = await postDefQuery.json();
      const postDef = postDefResult?.data?.metaobjectDefinitions?.edges?.find(
        (edge: { node: { type: string; id: string } }) =>
          edge.node.type === "instagram-post",
      );

      if (!postDef) {
        errors.push(
          "Instagram Post definition must be created before Instagram List",
        );
        return {
          apiKey: process.env.SHOPIFY_API_KEY || "",
          existsList,
          existsPost,
          createdList,
          createdPost,
          errors,
        };
      }

      const postDefinitionId = postDef.node.id;

      const listResponse = await admin.graphql(MetaobjectDefinition, {
        variables: {
          definition: {
            name: "Instagram List",
            type: "instagram-list",
            description: "A metaobject definition for Instagram lists",
            access: {
              storefront: "PUBLIC_READ",
            },
            capabilities: {
              publishable: {
                enabled: false,
              },
            },
            fieldDefinitions: [
              {
                key: "data",
                name: "Data",
                type: "json",
                required: true,
              },
              {
                key: "posts",
                name: "Posts",
                type: "list.metaobject_reference",
                validations: [
                  {
                    name: "metaobject_definition_id",
                    value: postDefinitionId,
                  },
                ],
                required: true,
              },
              {
                key: "username",
                name: "Username",
                type: "single_line_text_field",
                required: true,
              },
              {
                key: "name",
                name: "displayName",
                type: "single_line_text_field",
                required: true,
              },
            ],
          },
        },
      });

      const listResult = await listResponse.json();
      if (
        listResult?.data?.metaobjectDefinitionCreate?.userErrors?.length > 0
      ) {
        errors = errors.concat(
          listResult.data.metaobjectDefinitionCreate.userErrors.map(
            (err: { field?: string[]; message: string }) =>
              `${err.field?.join(".")}: ${err.message}`,
          ),
        );
        console.error("Metaobject list creation errors:", errors);
      } else if (
        listResult?.data?.metaobjectDefinitionCreate?.metaobjectDefinition
      ) {
        createdList = true;
        console.log(
          "Metaobject list definition created:",
          listResult.data.metaobjectDefinitionCreate.metaobjectDefinition,
        );
      }
    }

    return {
      apiKey: process.env.SHOPIFY_API_KEY || "",
      existsList,
      existsPost,
      createdList,
      createdPost,
      errors,
    };
  } catch (error) {
    console.error("Error in metaobject definition creation:", error);
    return {
      apiKey: process.env.SHOPIFY_API_KEY || "",
      exists: false,
      created: false,
      errors: [error instanceof Error ? error.message : "Unknown error"],
    };
  }
};

export const headers: HeadersFunction = (headersArgs) => {
  return boundary.headers(headersArgs);
};

export default function Index() {
  const { apiKey, existsList, existsPost, createdList, createdPost, errors } =
    useLoaderData<typeof loader>() as any;
  const navigate = useNavigate();

  const isSetupComplete =
    (existsList || createdList) && (existsPost || createdPost);
  const hasErrors = errors && errors.length > 0;
  const isLoading = !isSetupComplete && !hasErrors;

  // Auto-refresh while loading (check every 3 seconds)
  useEffect(() => {
    if (isLoading) {
      const timer = setTimeout(() => {
        window.location.reload();
      }, 3000);

      return () => clearTimeout(timer);
    }
  }, [isLoading]);

  // If still loading/creating metaobjects, show loading state
  if (isLoading) {
    return (
      <AppProvider embedded apiKey={apiKey}>
        <Outlet />
        <s-page>
          <s-section>
            <s-stack gap="base" alignItems="center">
              <s-spinner size="large" />
              <s-heading>Setting up NN Instagram...</s-heading>
              <s-text>
                Creating required metaobject definitions. This will only take a
                few seconds.
              </s-text>
              <s-box padding="base">
                <s-button
                  onClick={() => window.location.reload()}
                  variant="secondary"
                >
                  Refresh Page
                </s-button>
              </s-box>
            </s-stack>
          </s-section>
        </s-page>
      </AppProvider>
    );
  }

  return (
    <AppProvider embedded apiKey={apiKey}>
      <Outlet />

      <s-page>
        {/* grid template basic*/}
        <s-stack gap="base">
          <s-grid gridTemplateColumns="repeat(12, 1fr)" gap="base">
            <s-grid-item gridColumn="span 12" gridRow="span 1">
              {/* Header */}
              <s-section>
                <s-stack alignItems="center">
                  <s-heading>NN Instagram</s-heading>

                  <s-text>
                    Developer-focused app that syncs Instagram posts to Shopify
                    metaobjects. Build custom Instagram feeds with complete
                    design freedom using Liquid templates.
                  </s-text>
                </s-stack>
              </s-section>
            </s-grid-item>
            <s-grid-item gridColumn="span 8" gridRow="span 2">
              <s-section>
                <s-heading>About the App</s-heading>
                <s-stack gap="small">
                  <s-text>
                    Instagram Feed Sync for Developers - Raw data access to
                    build custom Instagram integrations
                  </s-text>

                  <s-divider />

                  <s-heading>What does this app do?</s-heading>
                  <s-text>
                    This app syncs your Instagram posts to Shopify as native
                    metaobjects and files, giving developers complete control to
                    build custom Instagram feeds. No pre-built UI - you design
                    and code your own Instagram feed using Liquid templates and
                    Shopify's standard APIs.
                  </s-text>
                  <s-divider />
                  <s-stack gap="small-200">
                    <s-heading>Requirements</s-heading>
                    <s-stack gap="small-100">
                      <s-unordered-list>
                        <s-list-item>
                          Instagram Business or Creator account
                        </s-list-item>
                        <s-list-item>
                          Shopify plan that supports metaobjects
                        </s-list-item>
                        <s-list-item>
                          Liquid/theme development knowledge to build custom
                          feeds
                        </s-list-item>
                      </s-unordered-list>
                    </s-stack>
                    <s-banner tone="info">
                      <s-stack gap="small-200">
                        <s-text type="strong">For Developers</s-text>
                        <s-text>
                          This app provides raw Instagram data as metaobjects.
                          You'll need to write Liquid code to display the data.
                          Starter templates are provided as reference.
                        </s-text>
                      </s-stack>
                    </s-banner>
                  </s-stack>
                </s-stack>
              </s-section>
            </s-grid-item>

            <s-grid-item gridColumn="span 4" gridRow="span 6">
              <s-section>
                <s-stack gap="base">
                  <s-stack direction="inline" gap="small-200">
                    <s-heading>App Setup</s-heading>
                    {isSetupComplete && !hasErrors && (
                      <s-badge tone="success">Ready</s-badge>
                    )}
                    {!isSetupComplete && !hasErrors && (
                      <s-badge tone="info">Setting Up</s-badge>
                    )}
                    {hasErrors && (
                      <s-badge tone="critical">Action Required</s-badge>
                    )}
                  </s-stack>

                  {/* First Install - In Progress Banner */}
                  {!isSetupComplete && !hasErrors && (
                    <s-banner tone="info">
                      <s-stack gap="small-200">
                        <s-text type="strong">🔧 Setting up your app...</s-text>
                        <s-text>
                          The app is automatically creating the required Shopify
                          metaobject definitions. This is a one-time setup that
                          happens when you first install the app.
                        </s-text>
                        <s-text color="subdued">
                          This usually takes just a few seconds. Refresh the
                          page if the setup doesn't complete automatically.
                        </s-text>
                      </s-stack>
                    </s-banner>
                  )}

                  {/* Success Banner */}
                  {isSetupComplete && !hasErrors && (
                    <s-banner tone="success">
                      <s-stack gap="small-200">
                        <s-text type="strong">
                          ✓ The app is ready to use!
                        </s-text>
                        <s-text>
                          All required metaobject definitions have been created
                          successfully. You can now connect your Instagram
                          account and start syncing posts.
                        </s-text>
                      </s-stack>
                    </s-banner>
                  )}

                  {/* Error Banner */}
                  {hasErrors && (
                    <s-banner tone="critical">
                      <s-stack gap="small-200">
                        <s-text type="strong">
                          <s-icon type="alert-circle" tone="critical" />
                          Setup encountered errors
                        </s-text>
                        <s-text>
                          The metaobject definitions could not be created
                          automatically. Please check the details below. You may
                          need to refresh the page or contact support if the
                          issue persists.
                        </s-text>
                      </s-stack>
                    </s-banner>
                  )}

                  <s-divider />

                  {/* Setup Details */}
                  <s-stack gap="base">
                    <s-heading>Metaobject Definitions</s-heading>

                    {!isSetupComplete && !hasErrors && (
                      <s-text color="subdued">
                        Creating required metaobject definitions for Instagram
                        data storage...
                      </s-text>
                    )}

                    {/* Instagram Post Status */}
                    <s-box
                      padding="base"
                      background="subdued"
                      borderRadius="base"
                    >
                      <s-stack gap="small-200" direction="inline">
                        {(existsPost || createdPost) && !hasErrors ? (
                          <s-icon type="check-circle" tone="success" />
                        ) : (
                          <s-icon
                            type="alert-circle"
                            tone={hasErrors ? "critical" : "info"}
                          />
                        )}
                        <s-stack gap="small-100">
                          <s-text type="strong">Instagram Post</s-text>
                          <s-text color="subdued">
                            {createdPost && "✓ Created during setup"}
                            {existsPost &&
                              !createdPost &&
                              "✓ Already configured"}
                            {!existsPost &&
                              !createdPost &&
                              !hasErrors &&
                              "⏳ Creating..."}
                            {!existsPost &&
                              !createdPost &&
                              hasErrors &&
                              "✗ Failed to create"}
                          </s-text>
                        </s-stack>
                      </s-stack>
                    </s-box>

                    {/* Instagram List Status */}
                    <s-box
                      padding="base"
                      background="subdued"
                      borderRadius="base"
                    >
                      <s-stack gap="small-200" direction="inline">
                        {(existsList || createdList) && !hasErrors ? (
                          <s-icon type="check-circle" tone="success" />
                        ) : (
                          <s-icon
                            type="alert-circle"
                            tone={hasErrors ? "critical" : "info"}
                          />
                        )}
                        <s-stack gap="small-100">
                          <s-text type="strong">Instagram List</s-text>
                          <s-text color="subdued">
                            {createdList && "✓ Created during setup"}
                            {existsList &&
                              !createdList &&
                              "✓ Already configured"}
                            {!existsList &&
                              !createdList &&
                              !hasErrors &&
                              "⏳ Creating..."}
                            {!existsList &&
                              !createdList &&
                              hasErrors &&
                              "✗ Failed to create"}
                          </s-text>
                        </s-stack>
                      </s-stack>
                    </s-box>

                    {!isSetupComplete && !hasErrors && (
                      <s-banner tone="info">
                        <s-text>
                          These metaobject definitions store your Instagram
                          posts as native Shopify data, accessible via Liquid
                          templates.
                        </s-text>
                      </s-banner>
                    )}
                  </s-stack>

                  {/* Refresh button for setup in progress */}
                  {!isSetupComplete && !hasErrors && (
                    <>
                      <s-divider />
                      <s-stack gap="small-200">
                        <s-button
                          onClick={() => window.location.reload()}
                          variant="secondary"
                        >
                          Refresh to Check Status
                        </s-button>
                        <s-text color="subdued">
                          Click refresh if the setup doesn't complete
                          automatically
                        </s-text>
                      </s-stack>
                    </>
                  )}

                  {/* Error Details */}
                  {hasErrors && (
                    <>
                      <s-divider />
                      <s-stack gap="small-200">
                        <s-text type="strong">Error Details:</s-text>
                        {errors.map((err: string, i: number) => (
                          <s-text key={i} color="subdued">
                            • {err}
                          </s-text>
                        ))}
                        <s-button
                          onClick={() => window.location.reload()}
                          variant="primary"
                        >
                          Retry Setup
                        </s-button>
                      </s-stack>
                    </>
                  )}
                  <s-divider />
                </s-stack>

                {/* Next Steps - Only show when setup is complete */}
                {isSetupComplete && !hasErrors && (
                  <s-section>
                    <s-stack gap="base">
                      <s-heading>Next Steps</s-heading>

                      <s-stack gap="base">
                        <s-stack gap="small-100">
                          <s-text type="strong">1. Connect Your Account</s-text>
                          <s-text color="subdued">
                            Authenticate with Instagram OAuth and grant
                            permissions to access your posts
                          </s-text>
                        </s-stack>

                        <s-stack gap="small-100">
                          <s-text type="strong">2. Sync Your Posts</s-text>
                          <s-text color="subdued">
                            Import Instagram data as Shopify metaobjects with
                            one click
                          </s-text>
                        </s-stack>

                        <s-stack gap="small-100">
                          <s-text type="strong">3. Build Your Feed</s-text>
                          <s-text color="subdued">
                            Use Liquid templates to create custom Instagram
                            feeds with your own design. Starter templates
                            provided as reference.
                          </s-text>
                        </s-stack>
                      </s-stack>

                      <s-divider />

                      <s-button
                        variant="primary"
                        onClick={() => navigate("/app/dashboard")}
                      >
                        Get Started →
                      </s-button>
                    </s-stack>
                  </s-section>
                )}
              </s-section>
            </s-grid-item>

            <s-grid-item gridColumn="span 4" gridRow="span 3">
              <s-section>
                <s-stack gap="small-200">
                  <s-heading>Key Features</s-heading>

                  <s-stack direction="inline" gap="small-200">
                    <s-icon type="check-circle" tone="success" />
                    <s-text>Your Instagram data in metaobjects</s-text>
                  </s-stack>

                  <s-stack direction="inline" gap="small-200">
                    <s-icon type="check-circle" tone="success" />
                    <s-text>Build custom feeds in Liquid</s-text>
                  </s-stack>

                  <s-stack direction="inline" gap="small-200">
                    <s-icon type="check-circle" tone="success" />
                    <s-text>Complete design control</s-text>
                  </s-stack>

                  <s-stack direction="inline" gap="small-200">
                    <s-icon type="check-circle" tone="success" />
                    <s-text>Media files stored in Shopify CDN</s-text>
                  </s-stack>

                  <s-stack direction="inline" gap="small-200">
                    <s-icon type="check-circle" tone="success" />
                    <s-text>Automatic sync every 24 hours</s-text>
                  </s-stack>

                  <s-stack direction="inline" gap="small-200">
                    <s-icon type="check-circle" tone="success" />
                    <s-text>Starter Liquid templates included</s-text>
                  </s-stack>
                </s-stack>
              </s-section>
            </s-grid-item>
            <s-grid-item gridColumn="span 4" gridRow="span 3">
              <s-section>
                <s-stack gap="small-200">
                  <s-heading>How it works</s-heading>
                  <s-ordered-list>
                    <s-list-item>
                      Connect your Instagram Business account via OAuth
                    </s-list-item>
                    <s-list-item>
                      Sync posts to create metaobjects with full post data
                      (images, captions, likes, comments, permalinks)
                    </s-list-item>
                    <s-list-item>
                      Build your own custom Instagram feed using Liquid
                      templates and the metaobject data
                    </s-list-item>
                    <s-list-item>
                      Data automatically updates every 24 hours or on-demand
                    </s-list-item>
                  </s-ordered-list>
                </s-stack>
              </s-section>
            </s-grid-item>
          </s-grid>
        </s-stack>
      </s-page>
    </AppProvider>
  );
}

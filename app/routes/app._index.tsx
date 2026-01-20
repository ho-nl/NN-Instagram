import type { LoaderFunctionArgs } from "react-router";
import { Outlet, useLoaderData, useNavigate } from "react-router";
import { AppProvider } from "@shopify/shopify-app-react-router/react";
import { authenticate } from "../shopify.server";

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
                    Sync your Instagram posts to Shopify and display them
                    beautifully on your store
                  </s-text>
                </s-stack>
              </s-section>
            </s-grid-item>
            <s-grid-item gridColumn="span 8" gridRow="span 2">
              <s-section>
                <s-heading>About the App</s-heading>
                <s-stack gap="small">
                  <s-text>
                    Instagram Feed Sync - Seamlessly integrate your Instagram
                    content with Shopify
                  </s-text>

                  <s-divider />

                  <s-heading>What does this app do?</s-heading>
                  <s-text>
                    This app automatically syncs your Instagram posts to your
                    Shopify store, storing them as metaobjects and files. You
                    can then display your Instagram feed anywhere on your store
                    using Liquid code or theme blocks.
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
                          Facebook Page connected to Instagram
                        </s-list-item>
                        <s-list-item>
                          Shopify plan that supports metaobjects
                        </s-list-item>
                      </s-unordered-list>
                    </s-stack>
                    <s-banner tone="info">
                      <s-stack gap="small-200">
                        <s-text type="strong">Need help?</s-text>
                        <s-text>
                          Visit our documentation or contact support for
                          assistance with setup and customization.
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
                    {hasErrors && (
                      <s-badge tone="critical">Action Required</s-badge>
                    )}
                  </s-stack>

                  {/* Success Banner */}
                  {isSetupComplete && !hasErrors && (
                    <s-banner tone="success">
                      <s-stack gap="small-200">
                        <s-text type="strong">The app is ready to use!</s-text>
                        <s-text>
                          All required metaobject definitions have been created
                          successfully.
                        </s-text>
                      </s-stack>
                    </s-banner>
                  )}

                  {/* Error Banner */}
                  {hasErrors && (
                    <s-banner tone="critical">
                      <s-stack gap="small-200">
                        <s-text type="strong">Setup encountered errors</s-text>
                        <s-text>
                          Please check the details below and contact support if
                          the issue persists.
                        </s-text>
                      </s-stack>
                    </s-banner>
                  )}

                  <s-divider />

                  {/* Setup Details */}
                  <s-stack gap="base">
                    <s-heading>Metaobject Definitions</s-heading>

                    {/* Instagram Post Status */}
                    <s-stack gap="small-200" direction="inline">
                      {(existsPost || createdPost) && !hasErrors ? (
                        <s-icon type="check-circle" tone="success" />
                      ) : (
                        <s-icon type="alert-circle" tone="critical" />
                      )}
                      <s-stack gap="small-100">
                        <s-text type="strong">Instagram Post</s-text>
                        <s-text color="subdued">
                          {createdPost && "Created during setup"}
                          {existsPost && !createdPost && "Already configured"}
                          {!existsPost && !createdPost && "Not configured"}
                        </s-text>
                      </s-stack>
                    </s-stack>

                    {/* Instagram List Status */}
                    <s-stack gap="small-200" direction="inline">
                      {(existsList || createdList) && !hasErrors ? (
                        <s-icon type="check-circle" tone="success" />
                      ) : (
                        <s-icon type="alert-circle" tone="critical" />
                      )}
                      <s-stack gap="small-100">
                        <s-text type="strong">Instagram List</s-text>
                        <s-text color="subdued">
                          {createdList && "Created during setup"}
                          {existsList && !createdList && "Already configured"}
                          {!existsList && !createdList && "Not configured"}
                        </s-text>
                      </s-stack>
                    </s-stack>
                  </s-stack>

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
                      </s-stack>
                    </>
                  )}
                  <s-divider />
                </s-stack>

                {/* Next Steps */}
                {isSetupComplete && !hasErrors && (
                  <s-section>
                    <s-stack gap="base">
                      <s-heading>Next Steps</s-heading>

                      <s-stack gap="base">
                        <s-stack gap="small-100">
                          <s-text type="strong">1. Connect Your Account</s-text>
                          <s-text color="subdued">
                            Head to the dashboard and connect your Instagram
                            Business account
                          </s-text>
                        </s-stack>

                        <s-stack gap="small-100">
                          <s-text type="strong">2. Sync Your Posts</s-text>
                          <s-text color="subdued">
                            Import your Instagram posts with one click
                          </s-text>
                        </s-stack>

                        <s-stack gap="small-100">
                          <s-text type="strong">3. Add to Your Theme</s-text>
                          <s-text color="subdued">
                            Display your Instagram feed on any page of your
                            store
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
                    <s-text>Automatic sync every 24 hours</s-text>
                  </s-stack>

                  <s-stack direction="inline" gap="small-200">
                    <s-icon type="check-circle" tone="success" />
                    <s-text>Manual sync on demand</s-text>
                  </s-stack>

                  <s-stack direction="inline" gap="small-200">
                    <s-icon type="check-circle" tone="success" />
                    <s-text>Stores posts as metaobjects</s-text>
                  </s-stack>

                  <s-stack direction="inline" gap="small-200">
                    <s-icon type="check-circle" tone="success" />
                    <s-text>Uploads media to Shopify files</s-text>
                  </s-stack>

                  <s-stack direction="inline" gap="small-200">
                    <s-icon type="check-circle" tone="success" />
                    <s-text>Easy theme integration</s-text>
                  </s-stack>

                  <s-stack direction="inline" gap="small-200">
                    <s-icon type="check-circle" tone="success" />
                    <s-text>No coding required</s-text>
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
                      Connect your Instagram Business account
                    </s-list-item>
                    <s-list-item>
                      Sync your posts to create metaobjects and files in Shopify
                    </s-list-item>
                    <s-list-item>
                      Add the Instagram feed to your store pages using theme
                      blocks
                    </s-list-item>
                    <s-list-item>
                      Your feed updates automatically every 24 hours
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

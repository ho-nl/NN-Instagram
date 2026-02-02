import type { ActionFunctionArgs } from "react-router";
import { authenticate } from "../shopify.server";
import db from "../db.server";

export const action = async ({ request }: ActionFunctionArgs) => {
  try {
    // authenticate.webhook() automatically validates HMAC signature
    const { shop, session, admin } = await authenticate.webhook(request);

    // Delete Instagram files and metaobject definitions
    if (admin) {
      try {
        // Delete files with alt text starting with instagram-post_
        const filesQuery = await admin.graphql(`
        query {
          files(first: 100, query: "alt:instagram-post_") {
            edges { node { id } }
          }
        }
      `);
        const filesJson = await filesQuery.json();
        const fileIds = filesJson.data.files.edges.map(
          (e: { node: { id: string } }) => e.node.id,
        );

        if (fileIds.length > 0) {
          await admin.graphql(
            `
          mutation fileDelete($fileIds: [ID!]!) {
            fileDelete(fileIds: $fileIds) {
              deletedFileIds
              userErrors { field message }
            }
          }
        `,
            {
              variables: { fileIds },
            },
          );
        }

        // Find the definition IDs
        const definitionsQuery = await admin.graphql(`
        query {
          metaobjectDefinitions(first: 10) {
            nodes {
              id
              type
            }
          }
        }
      `);

        const definitionsData = await definitionsQuery.json();
        const definitions = definitionsData.data.metaobjectDefinitions.nodes;

        // Find and delete nn_instagram_post and nn_instagram_list definitions
        const instagramDefinitions = definitions.filter(
          (def: { type: string }) =>
            def.type === "nn_instagram_post" ||
            def.type === "nn_instagram_list",
        );

        for (const definition of instagramDefinitions) {
          await admin.graphql(
            `
          mutation deleteDefinition($id: ID!) {
            metaobjectDefinitionDelete(id: $id) {
              deletedId
              userErrors {
                field
                message
              }
            }
          }
        `,
            {
              variables: { id: definition.id },
            },
          );
        }
      } catch (error) {
        console.error(`Failed to delete Instagram data for ${shop}:`, error);
      }
    }

    // Webhook requests can trigger multiple times and after an app has already been uninstalled.
    // If this webhook already ran, the session may have been deleted previously.
    if (session) {
      await db.session.deleteMany({ where: { shop } });
    }

    // Clean up social media data for compliance
    try {
      await db.socialAccount.deleteMany({ where: { shop } });
    } catch (error) {
      console.error(`Failed to clean up social accounts for ${shop}:`, error);
    }

    // Always return 200 OK to acknowledge webhook receipt
    return new Response(null, { status: 200 });
  } catch (error) {
    console.error("Webhook processing error:", error);

    // If authenticate.webhook() throws, HMAC validation failed
    // Return 401 Unauthorized
    if (error instanceof Error && error.message.includes("HMAC")) {
      return new Response("Unauthorized", { status: 401 });
    }

    // For other errors, return 200 to prevent retries
    return new Response(null, { status: 200 });
  }
};

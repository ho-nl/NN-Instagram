import { LoaderFunctionArgs } from "react-router";
import { authenticate } from "../shopify.server";
import { boundary } from "@shopify/shopify-app-react-router/server";
import type { HeadersFunction } from "react-router";
import { deleteInstagramData } from "../utils/metaobjects.server";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { admin } = await authenticate.admin(request);

  // Use centralized delete function
  const result = await deleteInstagramData(admin);

  return result;
};
export const headers: HeadersFunction = (headersArgs) => {
  return boundary.headers(headersArgs);
};

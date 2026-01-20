/**
 * Type definitions for Shopify Admin API
 */

/**
 * Shopify Admin API client (from authenticate.admin)
 */
export interface ShopifyAdmin {
  graphql: (query: string, options?: { variables?: Record<string, any> }) => Promise<GraphQLResponse>;
}

/**
 * GraphQL response wrapper
 */
export interface GraphQLResponse {
  json: () => Promise<any>;
  text: () => Promise<string>;
}

/**
 * GraphQL node structure
 */
export interface GraphQLNode<T = any> {
  node: T;
}

/**
 * GraphQL edge structure
 */
export interface GraphQLEdge<T = any> {
  edges: GraphQLNode<T>[];
}

/**
 * GraphQL page info
 */
export interface PageInfo {
  hasNextPage: boolean;
  endCursor: string | null;
  hasPreviousPage?: boolean;
  startCursor?: string | null;
}

/**
 * Metaobject node
 */
export interface MetaobjectNode {
  id: string;
  handle: string;
  type?: string;
  fields?: MetaobjectField[];
  updatedAt?: string;
}

/**
 * Metaobject field
 */
export interface MetaobjectField {
  key: string;
  value: string;
}

/**
 * File node
 */
export interface FileNode {
  id: string;
  alt?: string;
  fileStatus?: string;
  createdAt?: string;
}

/**
 * Staged upload parameter
 */
export interface StagedUploadParameter {
  name: string;
  value: string;
}

/**
 * Staged upload target
 */
export interface StagedUploadTarget {
  url: string;
  resourceUrl: string;
  parameters: StagedUploadParameter[];
}

/**
 * User error from GraphQL mutation
 */
export interface UserError {
  field?: string[];
  message: string;
}

/**
 * File create response
 */
export interface FileCreateResponse {
  data?: {
    fileCreate?: {
      files: FileNode[];
      userErrors: UserError[];
    };
  };
}

/**
 * Metaobject upsert response
 */
export interface MetaobjectUpsertResponse {
  data?: {
    metaobjectUpsert?: {
      metaobject?: MetaobjectNode;
      userErrors: UserError[];
    };
  };
}

/**
 * Files query response
 */
export interface FilesQueryResponse {
  data?: {
    files?: {
      edges: GraphQLNode<FileNode>[];
      pageInfo?: PageInfo;
    };
  };
}

/**
 * Metaobjects query response
 */
export interface MetaobjectsQueryResponse {
  data?: {
    metaobjects?: {
      edges: GraphQLNode<MetaobjectNode>[];
      nodes?: MetaobjectNode[];
      pageInfo?: PageInfo;
    };
  };
}

/**
 * Metaobject by handle response
 */
export interface MetaobjectByHandleResponse {
  data?: {
    metaobjectByHandle?: MetaobjectNode | null;
  };
}

/**
 * Staged uploads create response
 */
export interface StagedUploadsCreateResponse {
  data?: {
    stagedUploadsCreate?: {
      stagedTargets: StagedUploadTarget[];
      userErrors: UserError[];
    };
  };
}

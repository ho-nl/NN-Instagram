export interface ShopifyAdmin {
  graphql: (query: string, options?: { variables?: Record<string, any> }) => Promise<GraphQLResponse>;
}

export interface GraphQLResponse {
  json: () => Promise<any>;
  text: () => Promise<string>;
}

export interface GraphQLNode<T = any> {
  node: T;
}

export interface GraphQLEdge<T = any> {
  edges: GraphQLNode<T>[];
}

export interface PageInfo {
  hasNextPage: boolean;
  endCursor: string | null;
  hasPreviousPage?: boolean;
  startCursor?: string | null;
}

export interface MetaobjectNode {
  id: string;
  handle: string;
  type?: string;
  fields?: MetaobjectField[];
  updatedAt?: string;
}

export interface MetaobjectField {
  key: string;
  value: string;
}

export interface FileNode {
  id: string;
  alt?: string;
  fileStatus?: string;
  createdAt?: string;
}

export interface StagedUploadParameter {
  name: string;
  value: string;
}

export interface StagedUploadTarget {
  url: string;
  resourceUrl: string;
  parameters: StagedUploadParameter[];
}

export interface UserError {
  field?: string[];
  message: string;
}

export interface FileCreateResponse {
  data?: {
    fileCreate?: {
      files: FileNode[];
      userErrors: UserError[];
    };
  };
}

export interface MetaobjectUpsertResponse {
  data?: {
    metaobjectUpsert?: {
      metaobject?: MetaobjectNode;
      userErrors: UserError[];
    };
  };
}

export interface FilesQueryResponse {
  data?: {
    files?: {
      edges: GraphQLNode<FileNode>[];
      pageInfo?: PageInfo;
    };
  };
}

export interface MetaobjectsQueryResponse {
  data?: {
    metaobjects?: {
      edges: GraphQLNode<MetaobjectNode>[];
      nodes?: MetaobjectNode[];
      pageInfo?: PageInfo;
    };
  };
}

export interface MetaobjectByHandleResponse {
  data?: {
    metaobjectByHandle?: MetaobjectNode | null;
  };
}


export interface StagedUploadsCreateResponse {
  data?: {
    stagedUploadsCreate?: {
      stagedTargets: StagedUploadTarget[];
      userErrors: UserError[];
    };
  };
}

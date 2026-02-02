export interface SyncStats {
  lastSyncTime: string | null;
  postsCount: number;
  filesCount: number;
  metaobjectsCount: number;
}

export interface InstagramAccount {
  username: string;
  userId: string;
  profilePicture?: string;
  connectedAt: string;
}

export interface LoaderData {
  shop: string;
  instagramAccount: InstagramAccount | null;
  syncStats: SyncStats;
  isConnected: boolean;
  themePages: Array<{ label: string; value: string }>;
}

export interface ActionResponse {
  success: boolean;
  message: string;
  status?: number;
  deletedMetaobjects?: number;
  deletedFiles?: number;
  redirectUrl?: string;
}

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

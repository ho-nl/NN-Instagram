import type {
  ActionFunctionArgs,
  HeadersFunction,
  LoaderFunctionArgs,
} from "react-router";
import {
  useLoaderData,
  useSubmit,
  useNavigation,
  useFetcher,
  useRevalidator,
  useSearchParams,
} from "react-router";
import { useState, useEffect } from "react";
import { authenticate } from "../shopify.server";
import prisma from "../db.server";
import { boundary } from "@shopify/shopify-app-react-router/server";
import type { LoaderData, InstagramAccount } from "../types/instagram.types";
import {
  getInstagramProfile,
  getSyncStats,
  getThemePages,
  checkAppBlockInstallation,
  getInstagramPostsForPreview,
} from "../utils/instagram.server";
import {
  handleSyncAction,
  handleDeleteDataAction,
  handleDisconnectAction,
  handleAddToThemeAction,
} from "../utils/actions.server";
import { getInstagramAccount } from "../utils/account.server";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { session, admin } = await authenticate.admin(request);

  // Get Instagram account info using centralized function
  const socialAccount = await getInstagramAccount(session.shop);

  let instagramAccount: InstagramAccount | null = null;
  let syncStats = {
    lastSyncTime: null as string | null,
    postsCount: 0,
    filesCount: 0,
    metaobjectsCount: 0,
  };

  if (socialAccount) {
    // Fetch Instagram profile info
    const profile = await getInstagramProfile(socialAccount.accessToken);
    if (profile) {
      instagramAccount = {
        ...profile,
        connectedAt: socialAccount.createdAt.toISOString(),
      };
    }

    // Get sync statistics from Shopify
    syncStats = await getSyncStats(admin);
  }

  // Fetch theme pages (templates) for app block installation
  const themePages = await getThemePages(admin);

  // Check which templates have the Instagram block installed
  const appBlockStatus = await checkAppBlockInstallation(admin);

  // Fetch Instagram posts for preview (if connected)
  const instagramPosts = socialAccount
    ? await getInstagramPostsForPreview(admin, 12)
    : [];

  return {
    shop: session.shop,
    instagramAccount,
    syncStats,
    isConnected: !!socialAccount,
    themePages,
    appBlockStatus,
    instagramPosts,
  };
};

export const action = async ({ request }: ActionFunctionArgs) => {
  const { session, admin } = await authenticate.admin(request);
  const formData = await request.formData();
  const actionType = formData.get("action");

  if (actionType === "sync") {
    return await handleSyncAction(request);
  }

  if (actionType === "delete-data") {
    return await handleDeleteDataAction(admin);
  }

  if (actionType === "disconnect") {
    return await handleDisconnectAction(admin, session.shop);
  }

  if (actionType === "add-to-theme") {
    const template = formData.get("template") as string | undefined;
    return await handleAddToThemeAction(session.shop, template);
  }

  return { success: false, message: "Invalid action", status: 400 };
};

export default function Index() {
  const {
    shop,
    instagramAccount,
    syncStats,
    isConnected,
    themePages,
    appBlockStatus,
    instagramPosts,
  } = useLoaderData<typeof loader>();

  const submit = useSubmit();
  const navigation = useNavigation();
  const fetcher = useFetcher();
  const syncFetcher = useFetcher();
  const themeFetcher = useFetcher();
  const revalidator = useRevalidator();
  const [searchParams, setSearchParams] = useSearchParams();
  const [isSyncing, setIsSyncing] = useState(false);
  const [syncStatus, setSyncStatus] = useState<string>("");
  const [syncProgress, setSyncProgress] = useState(0);
  const [deleteMessage, setDeleteMessage] = useState<string>("");
  const [selectedPage, setSelectedPage] = useState<string>("index");
  const [showPageModal, setShowPageModal] = useState(false);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [syncSuccessMessage, setSyncSuccessMessage] = useState<string>("");
  const [connectSuccessMessage, setConnectSuccessMessage] =
    useState<string>("");

  // Design settings state
  const [designSettings, setDesignSettings] = useState({
    postsLimit: 12,
    aspectRatio: "portrait" as "portrait" | "square",
    borderRadius: 24,
    gap: 32,
    paddingTopBottom: 0,
    paddingLeftRight: 0,
    showHeader: true,
    showHandle: true,
  });
  const [previewDevice, setPreviewDevice] = useState<"desktop" | "mobile">(
    "desktop",
  );

  const isActionRunning =
    navigation.state === "submitting" || fetcher.state === "submitting";

  // Check for connection success from OAuth callback
  useEffect(() => {
    if (searchParams.get("connected") === "true") {
      setConnectSuccessMessage(
        "✓ Your Instagram account has been successfully connected!",
      );

      // Remove the parameter from URL
      const newParams = new URLSearchParams(searchParams);
      newParams.delete("connected");
      setSearchParams(newParams, { replace: true });

      // Auto-dismiss after 5 seconds
      setTimeout(() => {
        setConnectSuccessMessage("");
      }, 5000);
    }
  }, [searchParams, setSearchParams]);

  // Handle fetcher response (for delete/disconnect actions)
  useEffect(() => {
    if (fetcher.data && fetcher.state === "idle") {
      const data = fetcher.data as {
        success?: boolean;
        deletedMetaobjects?: number;
        deletedFiles?: number;
        message?: string;
      };
      if (data.success) {
        // Show success message with details
        if (
          data.deletedMetaobjects !== undefined &&
          data.deletedFiles !== undefined
        ) {
          setDeleteMessage(
            `✓ Successfully deleted ${data.deletedMetaobjects} metaobjects and ${data.deletedFiles} files`,
          );

          // Auto-dismiss message after 5 seconds
          setTimeout(() => {
            setDeleteMessage("");
          }, 5000);
        }
        // Don't reload - the fetcher automatically revalidates the loader
        // This keeps the Shopify session intact
      }
    }
  }, [fetcher.data, fetcher.state]);

  const handleSync = () => {
    setIsSyncing(true);
    setSyncStatus("Connecting to Instagram...");
    setSyncProgress(10);

    // Use fetcher to submit to the sync endpoint (using POST action instead of GET loader)
    // This will automatically revalidate the loader after completion
    const formData = new FormData();
    formData.append("action", "sync");
    syncFetcher.submit(formData, {
      method: "post",
      action: "/api/instagram/staged-upload",
    });
  };

  // Handle sync fetcher response
  useEffect(() => {
    if (syncFetcher.state === "submitting" && isSyncing) {
      setSyncStatus("Fetching Instagram posts...");
      setSyncProgress(30);
    }

    if (syncFetcher.state === "idle" && syncFetcher.data && isSyncing) {
      const result = syncFetcher.data as any;

      // Check if there was an error in the response
      if (result.error) {
        setSyncStatus(`❌ ${result.error}`);
        setSyncProgress(0);
        setTimeout(() => setIsSyncing(false), 5000);
        return;
      }

      // Success!
      setSyncStatus("Uploading media files to Shopify...");
      setSyncProgress(60);

      setTimeout(() => {
        setSyncStatus("Creating metaobjects...");
        setSyncProgress(80);

        setTimeout(() => {
          setSyncProgress(100);
          setSyncStatus("✓ Sync completed successfully!");

          // Show detailed success message
          setSyncSuccessMessage(
            `Successfully synced Instagram posts! Your content is now available in Shopify.`,
          );

          // Reset sync state and revalidate loader data
          setTimeout(() => {
            setIsSyncing(false);
            setSyncStatus("");
            setSyncProgress(0);
            // Revalidate to fetch updated stats without full page reload
            revalidator.revalidate();

            // Clear success message after showing updated stats
            setTimeout(() => {
              setSyncSuccessMessage("");
            }, 5000);
          }, 2000);
        }, 1500);
      }, 2000);
    }
  }, [syncFetcher.state, syncFetcher.data, isSyncing, revalidator]);

  // Handle theme fetcher response
  useEffect(() => {
    if (themeFetcher.state === "idle" && themeFetcher.data) {
      const result = themeFetcher.data as any;
      if (result.success && result.redirectUrl) {
        // Open the theme editor in a new tab
        window.open(result.redirectUrl, "_blank");
      }
    }
  }, [themeFetcher.state, themeFetcher.data]);

  const handleConnect = () => {
    window.open(
      `/instagram?shop=${encodeURIComponent(shop)}`,
      "_parent",
      "width=600,height=700",
    );
  };

  const handleSwitchAccount = () => {
    window.open(
      `/instagram?shop=${encodeURIComponent(shop)}`,
      "_parent",
      "width=600,height=700",
    );
  };

  const handleRefresh = () => {
    setIsRefreshing(true);
    // Use revalidator instead of window.location.reload to avoid breaking Shopify session
    revalidator.revalidate();
    // Reset loading state after a moment
    setTimeout(() => {
      setIsRefreshing(false);
    }, 1000);
  };

  const handleDeleteData = () => {
    if (
      confirm(
        "Are you sure you want to delete all Instagram posts, files, and metaobjects? This cannot be undone.",
      )
    ) {
      const formData = new FormData();
      formData.append("action", "delete-data");
      fetcher.submit(formData, { method: "post" });
    }
  };

  const handleDisconnect = () => {
    if (
      confirm(
        "Are you sure you want to disconnect your Instagram account? This will delete all synced data and cannot be undone.",
      )
    ) {
      const formData = new FormData();
      formData.append("action", "disconnect");
      fetcher.submit(formData, { method: "post" });
    }
  };

  const handleAddToTheme = () => {
    // Show modal to select page
    setShowPageModal(true);
  };

  const handleAddToThemeWithPage = (template: string) => {
    const formData = new FormData();
    formData.append("action", "add-to-theme");
    formData.append("template", template);
    themeFetcher.submit(formData, { method: "post" });
    setShowPageModal(false);
  };

  const handleDownloadThemeFiles = async () => {
    try {
      // Fetch the file
      const response = await fetch("/api/download-theme");

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        alert(errorData.message || "Failed to download theme files");
        return;
      }

      // Get the blob
      const blob = await response.blob();

      // Create a download link and trigger it
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = "nn-instagram-theme.zip";
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);
    } catch (error) {
      console.error("Download error:", error);
      alert("Failed to download theme files");
    }
  };

  const formatDate = (dateString: string | null) => {
    if (!dateString) return "Never";
    const date = new Date(dateString);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMs / 3600000);
    const diffDays = Math.floor(diffMs / 86400000);

    if (diffMins < 1) return "Just now";
    if (diffMins < 60)
      return `${diffMins} minute${diffMins > 1 ? "s" : ""} ago`;
    if (diffHours < 24)
      return `${diffHours} hour${diffHours > 1 ? "s" : ""} ago`;
    return `${diffDays} day${diffDays > 1 ? "s" : ""} ago`;
  };

  // Calculate setup progress
  const hasPosts = syncStats.postsCount > 0;
  const hasAddedToTheme = false; // You could track this in your database if needed

  type Step = {
    id: number;
    title: string;
    description: string;
    completed: boolean;
    current: boolean;
    action: () => void;
    actionLabel: string;
    iconType: "social-post" | "refresh" | "theme";
    disabled?: boolean;
    optional?: boolean;
  };

  const steps: Step[] = [
    {
      id: 1,
      title: "Connect Instagram",
      description:
        "Authenticate with Instagram OAuth and grant permissions to access your posts and profile information. This allows the app to display your Instagram content on your Shopify store.",
      completed: isConnected,
      current: !isConnected,
      action: handleConnect,
      actionLabel: "Connect Account",
      iconType: "social-post" as const,
    },
    {
      id: 2,
      title: "Sync Posts",
      description:
        "Fetch your Instagram posts using the Instagram Basic Display API. This uploads your media files to Shopify and creates metaobjects for each post with captions, likes, and comments.",
      completed: hasPosts,
      current: isConnected && !hasPosts,
      action: handleSync,
      actionLabel: "Sync Now",
      iconType: "refresh" as const,
      disabled: !isConnected,
    },
  ];

  // Add to Theme is optional and not counted in progress
  const optionalSteps = [
    {
      id: 3,
      title: "Add to Theme",
      description:
        "Add the Instagram feed block to your store pages (optional). Make sure to click the save button in the theme editor.",
      completed: hasAddedToTheme,
      current: false, // Never show as current step
      action: handleAddToTheme,
      actionLabel: "Add to Theme",
      iconType: "theme" as const,
      disabled: !isConnected || !hasPosts,
      optional: true,
    },
    {
      id: 4,
      title: "Refresh",
      description:
        "If app block status or sync data isn't updating, click refresh to reload the page and update the information.",
      completed: false,
      current: false,
      action: handleRefresh,
      actionLabel: "Refresh",
      iconType: "refresh" as const,
      optional: true,
    },
  ];

  const allSteps = [...steps, ...optionalSteps];
  const completedSteps = steps.filter((step) => step.completed).length;
  const progressPercentage = (completedSteps / steps.length) * 100;

  return (
    <s-page>
      {/* API Permissions Info Banner - Show when connected */}
      {isConnected && (
        <s-section>
          <s-banner tone="info">
            <s-stack gap="small-100">
              <s-text type="strong">Instagram API Integration Active</s-text>
              <s-text>
                This app uses the Instagram Basic Display API to fetch and sync
                your Instagram posts to your Shopify store. Posts are
                automatically synced every 24 hours, or you can manually sync
                anytime using the "Sync Now" button below.
              </s-text>
            </s-stack>
          </s-banner>
        </s-section>
      )}

      {/* Progress Steps Card */}
      <s-section>
        <s-card>
          <s-stack gap="base">
            <s-stack direction="inline" gap="small-200">
              <s-heading>Getting Started</s-heading>
              <s-badge
                tone={completedSteps === steps.length ? "success" : "info"}
              >
                {completedSteps} of {steps.length} completed
              </s-badge>
            </s-stack>

            {/* Progress Bar - Using div with Polaris CSS variables */}
            <s-box padding="none" background="subdued" borderRadius="base">
              <div
                style={{
                  width: `${progressPercentage}%`,
                  height: "8px",
                  background:
                    completedSteps === steps.length
                      ? "var(--p-color-bg-success)"
                      : "var(--p-color-bg-info)",
                  transition: "width 0.5s ease",
                  borderRadius: "var(--p-border-radius-100)",
                }}
              />
            </s-box>

            {/* Steps List */}
            <s-stack gap="base">
              {allSteps.map((step, index) => (
                <s-box key={step.id}>
                  <s-stack gap="small-200" direction="inline">
                    {/* Step Icon/Status - Using div wrapper for custom styling */}
                    <div
                      style={{
                        minWidth: "40px",
                        height: "40px",
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        borderRadius: "50%",
                        background: step.completed
                          ? "var(--p-color-bg-success)"
                          : step.current
                            ? "var(--p-color-bg-info)"
                            : "var(--p-color-bg-subdued)",
                        padding: "var(--p-space-200)",
                      }}
                    >
                      {step.completed ? (
                        <s-icon type="check" tone="success" />
                      ) : (
                        <s-icon
                          type={step.iconType}
                          tone={step.current ? "info" : undefined}
                        />
                      )}
                    </div>

                    {/* Step Content - Using div wrapper for flex */}
                    <div style={{ flex: 1 }}>
                      <s-stack gap="small-100">
                        <s-stack direction="inline" gap="small-200">
                          <s-text type="strong">{step.title}</s-text>
                          {step.completed && (
                            <s-badge tone="success">Completed</s-badge>
                          )}
                          {step.current && !step.completed && (
                            <s-badge tone="info">In Progress</s-badge>
                          )}
                          {step.optional && (
                            <s-badge tone="neutral">Optional</s-badge>
                          )}
                        </s-stack>
                        <s-text color="subdued">{step.description}</s-text>

                        {/* Action Button */}
                        {!step.completed && (step.current || step.optional) && (
                          <s-box padding="small-400 none small-400 none">
                            {step.id === 3 && showPageModal ? (
                              // Show page selector for "Add to Theme" step
                              <s-stack gap="small-200">
                                <s-text type="strong">Select a page:</s-text>
                                {themePages.map((page) => {
                                  const isInstalled =
                                    appBlockStatus?.[page.value] || false;
                                  return (
                                    <s-clickable
                                      key={page.value}
                                      onClick={() =>
                                        handleAddToThemeWithPage(page.value)
                                      }
                                      border="base"
                                      borderRadius="base"
                                      padding="small-100"
                                    >
                                      <s-stack
                                        direction="inline"
                                        gap="small-200"
                                      >
                                        <s-icon
                                          type={
                                            page.value === "index"
                                              ? "home"
                                              : page.value === "product"
                                                ? "product"
                                                : page.value === "collection"
                                                  ? "collection"
                                                  : "page"
                                          }
                                        />
                                        <div style={{ flex: 1 }}>
                                          <s-text>{page.label}</s-text>
                                        </div>
                                        <s-badge
                                          tone={
                                            isInstalled ? "success" : "neutral"
                                          }
                                        >
                                          {isInstalled
                                            ? "✓ Active"
                                            : "Inactive"}
                                        </s-badge>
                                      </s-stack>
                                    </s-clickable>
                                  );
                                })}
                                <s-button
                                  onClick={() => setShowPageModal(false)}
                                >
                                  Cancel
                                </s-button>
                              </s-stack>
                            ) : (
                              <s-button
                                onClick={step.action}
                                disabled={
                                  step.disabled || isActionRunning || isSyncing
                                }
                                variant={step.current ? "primary" : undefined}
                              >
                                {step.actionLabel}
                              </s-button>
                            )}
                          </s-box>
                        )}
                      </s-stack>
                    </div>
                  </s-stack>

                  {/* Divider between steps */}
                  {index < allSteps.length - 1 && <s-divider />}
                </s-box>
              ))}
            </s-stack>

            {/* Completion Message */}
            {completedSteps === steps.length && (
              <>
                <s-divider />
                <s-banner tone="success">
                  <s-stack gap="small-200">
                    <s-text type="strong">🎉 All set up!</s-text>
                    <s-text>
                      Your Instagram feed is now synced and ready to display on
                      your store.
                    </s-text>
                  </s-stack>
                </s-banner>
              </>
            )}
          </s-stack>
        </s-card>
      </s-section>

      {/* Delete Success Banner */}
      {deleteMessage && (
        <s-section>
          <s-banner tone="success" onDismiss={() => setDeleteMessage("")}>
            {deleteMessage}
          </s-banner>
        </s-section>
      )}

      {/* Connection Success Banner */}
      {connectSuccessMessage && (
        <s-section>
          <s-banner
            tone="success"
            onDismiss={() => setConnectSuccessMessage("")}
          >
            {connectSuccessMessage}
          </s-banner>
        </s-section>
      )}

      {/* Sync Success Banner */}
      {syncSuccessMessage && (
        <s-section>
          <s-banner tone="success" onDismiss={() => setSyncSuccessMessage("")}>
            <s-stack gap="small-200">
              <s-text type="strong">✓ {syncSuccessMessage}</s-text>
              {syncStats.postsCount > 0 && (
                <s-stack direction="inline" gap="small-200">
                  <s-text>📸 {syncStats.postsCount} posts synced</s-text>
                  <s-text>
                    🖼️ {syncStats.filesCount} media files uploaded
                  </s-text>
                </s-stack>
              )}
              <s-text color="subdued">
                Your Instagram content is now available in Shopify and ready to
                display on your store.
              </s-text>
            </s-stack>
          </s-banner>
        </s-section>
      )}

      {/* Manual Sync Card */}
      {isConnected && (
        <s-section>
          <s-banner tone="info">
            Your Instagram posts sync automatically every 24 hours. Use the
            "Sync Now" button above to manually fetch the latest posts.
          </s-banner>
          <s-card>
            <s-stack gap="base">
              <s-stack gap="small-500">
                <s-heading>Instagram Sync</s-heading>

                <s-text color="subdued">
                  Fetch and sync your latest Instagram posts to Shopify
                </s-text>
              </s-stack>

              {isSyncing && (
                <s-stack gap="base">
                  <s-stack gap="small-200" direction="inline">
                    <s-spinner />
                    <s-text>{syncStatus}</s-text>
                  </s-stack>
                  {syncProgress > 0 && (
                    <div
                      style={{
                        width: "100%",
                        height: "4px",
                        background: "#e1e1e1",
                        borderRadius: "2px",
                      }}
                    >
                      <div
                        style={{
                          width: `${syncProgress}%`,
                          height: "100%",
                          background: "#008060",
                          borderRadius: "2px",
                          transition: "width 0.3s ease",
                        }}
                      />
                    </div>
                  )}
                </s-stack>
              )}

              {!isSyncing && (
                <s-stack gap="small-100">
                  <s-box>
                    <s-button
                      onClick={handleSync}
                      loading={isSyncing}
                      disabled={isActionRunning}
                    >
                      Sync Now
                    </s-button>
                  </s-box>
                  {syncStats.lastSyncTime && (
                    <s-text color="subdued">
                      Last synced {formatDate(syncStats.lastSyncTime)}
                    </s-text>
                  )}
                </s-stack>
              )}
            </s-stack>
          </s-card>
        </s-section>
      )}

      {/* Connection Status */}
      <s-section>
        <s-card>
          <s-stack gap="base">
            <s-stack direction="inline" gap="small-200">
              <s-heading>Instagram Account</s-heading>
              {isConnected ? (
                <s-badge tone="success">Connected</s-badge>
              ) : (
                <s-badge tone="critical">Not Connected</s-badge>
              )}
            </s-stack>

            {isConnected && instagramAccount ? (
              <s-stack gap="base">
                <s-stack gap="base" direction="inline">
                  {instagramAccount.profilePicture && (
                    <s-thumbnail
                      src={instagramAccount.profilePicture}
                      alt={instagramAccount.username}
                      size="large"
                    />
                  )}
                  <s-stack gap="small-100">
                    <s-badge>@{instagramAccount.username}</s-badge>
                    <s-text color="subdued">
                      Connected {formatDate(instagramAccount.connectedAt)}
                    </s-text>
                  </s-stack>
                </s-stack>

                <s-divider />

                <s-stack gap="small-200" direction="inline">
                  <s-button
                    onClick={handleSwitchAccount}
                    disabled={isSyncing || isActionRunning}
                  >
                    Switch Account
                  </s-button>
                  <s-button
                    onClick={handleDeleteData}
                    tone="critical"
                    loading={
                      fetcher.state === "submitting" &&
                      fetcher.formData?.get("action") === "delete-data"
                    }
                    disabled={isSyncing || isActionRunning}
                  >
                    Delete Data
                  </s-button>
                  <s-button
                    onClick={handleDisconnect}
                    tone="critical"
                    loading={
                      fetcher.state === "submitting" &&
                      fetcher.formData?.get("action") === "disconnect"
                    }
                    disabled={isSyncing || isActionRunning}
                  >
                    Disconnect
                  </s-button>
                </s-stack>
              </s-stack>
            ) : (
              <s-stack gap="base">
                <s-text>
                  Connect your Instagram Business account to sync posts to
                  Shopify metaobjects and files.
                </s-text>

                <s-divider />

                <s-stack gap="small-200">
                  <s-text type="strong">What happens when you connect:</s-text>

                  <s-stack direction="inline" gap="small-200">
                    <s-icon type="lock" tone="info" />
                    <s-stack gap="small-100">
                      <s-text type="strong">1. Log in with Instagram</s-text>
                      <s-text color="subdued">
                        Enter your Instagram username and password (or use
                        existing session)
                      </s-text>
                    </s-stack>
                  </s-stack>

                  <s-stack direction="inline" gap="small-200">
                    <s-icon type="check-circle" tone="success" />
                    <s-stack gap="small-100">
                      <s-text type="strong">2. Grant permissions</s-text>
                      <s-text color="subdued">
                        Allow access to your Instagram posts and profile
                        information
                      </s-text>
                    </s-stack>
                  </s-stack>

                  <s-stack direction="inline" gap="small-200">
                    <s-icon type="arrow-right" tone="info" />
                    <s-stack gap="small-100">
                      <s-text type="strong">3. Return to dashboard</s-text>
                      <s-text color="subdued">
                        You'll be redirected back here to complete setup
                      </s-text>
                    </s-stack>
                  </s-stack>
                </s-stack>

                <s-banner tone="info">
                  <s-stack gap="small-100">
                    <s-text type="strong">Required Permissions:</s-text>
                    <s-text>
                      • <strong>instagram_business_basic:</strong> Access your
                      Instagram posts and profile information
                    </s-text>
                    <s-text color="subdued">
                      These permissions allow us to display your Instagram
                      content on your Shopify store.
                    </s-text>
                  </s-stack>
                </s-banner>

                <s-box>
                  <s-button variant="primary" onClick={handleConnect}>
                    Connect Instagram Account
                  </s-button>
                </s-box>
              </s-stack>
            )}
          </s-stack>
        </s-card>
      </s-section>

      {/* Sync Statistics */}
      {isConnected && instagramAccount ? (
        <>
          <s-section>
            <s-stack gap="small-100">
              <s-heading>Sync Statistics</s-heading>

              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "repeat(3, 1fr)",
                  gap: "16px",
                }}
              >
                {/* Posts Card */}
                <s-clickable
                  href={`https://admin.shopify.com/store/${shop.replace(
                    ".myshopify.com",
                    "",
                  )}/content/metaobjects/entries/nn_instagram_post`}
                  target="_blank"
                  border="base"
                  borderRadius="base"
                  padding="base"
                >
                  <s-stack gap="small-200">
                    <s-icon type="social-post" tone="info" />
                    <div style={{ fontSize: "28px", fontWeight: "600" }}>
                      {syncStats.postsCount}
                    </div>
                    <s-text color="subdued">Posts Synced</s-text>
                  </s-stack>
                </s-clickable>

                {/* Files Card */}
                <s-clickable
                  href={`https://admin.shopify.com/store/${shop.replace(
                    ".myshopify.com",
                    "",
                  )}/content/files?selectedView=all&media_type=IMAGE%2CVIDEO&query=${instagramAccount.username}-post-`}
                  target="_blank"
                  border="base"
                  borderRadius="base"
                  padding="base"
                >
                  <s-stack gap="small-200">
                    <s-icon type="image" tone="success" />
                    <div style={{ fontSize: "28px", fontWeight: "600" }}>
                      {syncStats.filesCount}
                    </div>
                    <s-text color="subdued">Files Created</s-text>
                  </s-stack>
                </s-clickable>

                {/* Metaobjects Card */}
                <s-clickable
                  href={`https://admin.shopify.com/store/${shop.replace(
                    ".myshopify.com",
                    "",
                  )}/content/metaobjects`}
                  target="_blank"
                  border="base"
                  borderRadius="base"
                  padding="base"
                >
                  <s-stack gap="small-200">
                    <s-icon type="file" tone="warning" />
                    <div style={{ fontSize: "28px", fontWeight: "600" }}>
                      {syncStats.metaobjectsCount}
                    </div>
                    <s-text color="subdued">Metaobjects</s-text>
                  </s-stack>
                </s-clickable>
              </div>
              <s-banner tone="info">
                Click the statistics cards above to view your metaobjects in
                Shopify admin and explore all fields.
              </s-banner>
            </s-stack>
          </s-section>

          {/* Theme Snippets Download Section */}
          <s-section>
            <s-card>
              <s-stack gap="base">
                <s-stack gap="small-200">
                  <s-heading>Theme Integration</s-heading>
                  <s-text color="subdued">
                    Download ready-to-use Liquid snippets for your Shopify theme
                  </s-text>
                </s-stack>

                <s-stack gap="small-200">
                  <s-text type="strong">Horizon Theme Files</s-text>
                  <s-text color="subdued">
                    Download pre-built Instagram carousel snippets optimized for
                    Horizon theme
                  </s-text>
                  <s-button
                    variant="primary"
                    onClick={handleDownloadThemeFiles}
                  >
                    Download Horizon Files
                  </s-button>
                </s-stack>
              </s-stack>
            </s-card>
          </s-section>

          {/* Developer Guide */}
          <s-section>
            <s-card>
              <s-stack gap="base">
                <s-heading>Developer Guide</s-heading>

                <s-text color="subdued">
                  Access the synced Instagram posts in your theme with this
                  simple Liquid code.
                </s-text>

                <s-divider />

                <s-stack gap="small-200">
                  <s-text type="strong">Accessing the Data</s-text>
                  <s-box
                    padding="base"
                    background="subdued"
                    borderRadius="base"
                  >
                    <pre
                      style={{
                        fontSize: "12px",
                        lineHeight: "1.5",
                        overflow: "auto",
                        margin: 0,
                        fontFamily: "monospace",
                      }}
                    >
                      {`{% assign instagram = metaobjects['nn_instagram_list']['instagram-feed-list'] %}

{% for post in instagram.posts.value %}
  {{ post.caption.value }}
  {{ post.likes.value }}
  {{ post.comments.value }}
  
  {% for media in post.images.value %}
    {{ media | image_url: width: 800 }}
  {% endfor %}
{% endfor %}`}
                    </pre>
                  </s-box>
                </s-stack>

                <s-divider />

                <s-stack gap="small-200">
                  <s-text type="strong">Available Fields</s-text>
                  <s-text color="subdued">
                    Each post includes: caption, likes, comments, images, and
                    permalink
                  </s-text>
                </s-stack>
              </s-stack>
            </s-card>
          </s-section>
        </>
      ) : (
        <></>
      )}

      {/* Design Configuration Section - Show when posts are synced */}
      {isConnected && hasPosts && (
        <s-section>
          <s-card>
            <s-stack gap="base">
              <s-stack gap="small-200">
                <s-heading>Design Settings</s-heading>
                <s-text color="subdued">
                  Configure your Instagram feed appearance. Preview updates in
                  real-time.
                </s-text>
              </s-stack>

              <s-divider />

              {/* Two Column Layout: Settings Left, Preview Right */}
              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "400px 1fr",
                  gap: "24px",
                }}
              >
                {/* Left Column: Settings */}
                <s-stack gap="base">
                  {/* Number of Posts */}
                  <s-box>
                    <s-stack gap="small-200">
                      <s-text type="strong">
                        Posts: {designSettings.postsLimit}
                      </s-text>
                      <input
                        type="range"
                        min="4"
                        max="24"
                        step="1"
                        value={designSettings.postsLimit}
                        onChange={(e) =>
                          setDesignSettings({
                            ...designSettings,
                            postsLimit: parseInt(e.target.value),
                          })
                        }
                        style={{ width: "100%" }}
                      />
                    </s-stack>
                  </s-box>

                  {/* Aspect Ratio */}
                  <s-box>
                    <s-stack gap="small-200">
                      <s-text type="strong">Aspect ratio</s-text>
                      <s-stack direction="inline" gap="small-200">
                        <s-button
                          variant={
                            designSettings.aspectRatio === "portrait"
                              ? "primary"
                              : undefined
                          }
                          onClick={() =>
                            setDesignSettings({
                              ...designSettings,
                              aspectRatio: "portrait",
                            })
                          }
                        >
                          4:6
                        </s-button>
                        <s-button
                          variant={
                            designSettings.aspectRatio === "square"
                              ? "primary"
                              : undefined
                          }
                          onClick={() =>
                            setDesignSettings({
                              ...designSettings,
                              aspectRatio: "square",
                            })
                          }
                        >
                          1:1
                        </s-button>
                      </s-stack>
                    </s-stack>
                  </s-box>

                  {/* Border Radius */}
                  <s-box>
                    <s-stack gap="small-200">
                      <s-text type="strong">
                        Radius: {designSettings.borderRadius}px
                      </s-text>
                      <input
                        type="range"
                        min="0"
                        max="32"
                        step="4"
                        value={designSettings.borderRadius}
                        onChange={(e) =>
                          setDesignSettings({
                            ...designSettings,
                            borderRadius: parseInt(e.target.value),
                          })
                        }
                        style={{ width: "100%" }}
                      />
                    </s-stack>
                  </s-box>

                  {/* Gap */}
                  <s-box>
                    <s-stack gap="small-200">
                      <s-text type="strong">Gap: {designSettings.gap}px</s-text>
                      <input
                        type="range"
                        min="0"
                        max="48"
                        step="4"
                        value={designSettings.gap}
                        onChange={(e) =>
                          setDesignSettings({
                            ...designSettings,
                            gap: parseInt(e.target.value),
                          })
                        }
                        style={{ width: "100%" }}
                      />
                    </s-stack>
                  </s-box>

                  {/* Padding Vertical */}
                  <s-box>
                    <s-stack gap="small-200">
                      <s-text type="strong">
                        Padding V: {designSettings.paddingTopBottom}px
                      </s-text>
                      <input
                        type="range"
                        min="0"
                        max="80"
                        step="4"
                        value={designSettings.paddingTopBottom}
                        onChange={(e) =>
                          setDesignSettings({
                            ...designSettings,
                            paddingTopBottom: parseInt(e.target.value),
                          })
                        }
                        style={{ width: "100%" }}
                      />
                    </s-stack>
                  </s-box>

                  {/* Padding Horizontal */}
                  <s-box>
                    <s-stack gap="small-200">
                      <s-paragraph>
                        <s-text type="strong">
                          Padding H: {designSettings.paddingLeftRight}px
                        </s-text>
                        <s-text> (Max: 80px)</s-text>
                      </s-paragraph>

                      <input
                        type="range"
                        min="0"
                        max="80"
                        step="4"
                        value={designSettings.paddingLeftRight}
                        onChange={(e) =>
                          setDesignSettings({
                            ...designSettings,
                            paddingLeftRight: parseInt(e.target.value),
                          })
                        }
                        style={{ width: "100%" }}
                      />
                    </s-stack>
                  </s-box>

                  <s-divider />

                  {/* Display Options */}
                  <s-box>
                    <s-stack gap="small-200">
                      <s-clickable
                        onClick={() =>
                          setDesignSettings({
                            ...designSettings,
                            showHeader: !designSettings.showHeader,
                          })
                        }
                        border="base"
                        borderRadius="base"
                        padding="small-200"
                      >
                        <s-stack direction="inline" gap="small-200">
                          <input
                            type="checkbox"
                            checked={designSettings.showHeader}
                            onChange={() => {}}
                            style={{ width: "18px", height: "18px" }}
                          />
                          <s-text type="strong">Show header</s-text>
                        </s-stack>
                      </s-clickable>

                      <s-clickable
                        onClick={() =>
                          setDesignSettings({
                            ...designSettings,
                            showHandle: !designSettings.showHandle,
                          })
                        }
                        border="base"
                        borderRadius="base"
                        padding="small-200"
                      >
                        <s-stack direction="inline" gap="small-200">
                          <input
                            type="checkbox"
                            checked={designSettings.showHandle}
                            onChange={() => {}}
                            style={{ width: "18px", height: "18px" }}
                          />
                          <s-text type="strong">Show @handle</s-text>
                        </s-stack>
                      </s-clickable>
                    </s-stack>
                  </s-box>
                </s-stack>

                {/* Right Column: Preview */}
                <s-stack gap="base">
                  <style>{`
                    .hide-scrollbar::-webkit-scrollbar {
                      display: none;
                    }
                  `}</style>

                  <s-stack direction="inline" gap="small-200">
                    <s-text type="strong">Preview</s-text>
                    <s-stack direction="inline" gap="small-200">
                      <s-button
                        variant={
                          previewDevice === "desktop" ? "primary" : undefined
                        }
                        onClick={() => setPreviewDevice("desktop")}
                      >
                        Desktop
                      </s-button>
                      <s-button
                        variant={
                          previewDevice === "mobile" ? "primary" : undefined
                        }
                        onClick={() => setPreviewDevice("mobile")}
                      >
                        Mobile
                      </s-button>
                    </s-stack>
                  </s-stack>

                  {/* Preview Container */}
                  <s-box
                    background="subdued"
                    padding="small-200"
                    borderRadius="base"
                  >
                    <div
                      style={{
                        background: "white",
                        borderRadius: "8px",
                        padding: `${designSettings.paddingTopBottom}px ${designSettings.paddingLeftRight}px`,
                        maxWidth: previewDevice === "mobile" ? "375px" : "100%",
                        margin: "0 auto",
                      }}
                    >
                      {/* Header */}
                      {designSettings.showHeader && (
                        <div
                          style={{
                            fontSize: "18px",
                            fontWeight: "600",
                            marginBottom: "12px",
                            textAlign: "center",
                            fontFamily: "system-ui, -apple-system, sans-serif",
                          }}
                        >
                          Instagram Feed
                        </div>
                      )}

                      {/* Feed Preview */}
                      <div
                        style={{
                          display: "flex",
                          gap: `${designSettings.gap}px`,
                          overflowX: "auto",
                          scrollbarWidth: "none",
                          msOverflowStyle: "none",
                          WebkitOverflowScrolling: "touch",
                        }}
                        className="hide-scrollbar"
                      >
                        {instagramPosts
                          .slice(0, previewDevice === "desktop" ? 4 : 3)
                          .map((post: any, index: number) => (
                            <div
                              key={post.id}
                              style={{
                                position: "relative",
                                width:
                                  previewDevice === "desktop"
                                    ? "140px"
                                    : "100px",
                                maxWidth:
                                  previewDevice === "desktop"
                                    ? "140px"
                                    : "100px",
                                aspectRatio:
                                  designSettings.aspectRatio === "portrait"
                                    ? "4/6"
                                    : "1/1",
                                borderRadius: `${designSettings.borderRadius}px`,
                                overflow: "hidden",
                                flexShrink: 0,
                                cursor: "pointer",
                                background: "#111",
                              }}
                            >
                              {/* Image */}
                              {post.imageUrl && (
                                <img
                                  src={post.imageUrl}
                                  alt="Instagram post"
                                  style={{
                                    width: "100%",
                                    height: "100%",
                                    objectFit: "cover",
                                    display: "block",
                                    maxWidth: "100%",
                                  }}
                                />
                              )}

                              {/* Overlay on hover */}
                              <div
                                style={{
                                  position: "absolute",
                                  top: 0,
                                  left: 0,
                                  width: "100%",
                                  height: "100%",
                                  background: "rgba(0, 0, 0, 0.7)",
                                  opacity: 0,
                                  display: "flex",
                                  flexDirection: "column",
                                  justifyContent: "center",
                                  alignItems: "center",
                                  gap: "8px",
                                  transition: "opacity 240ms ease",
                                  borderRadius: `${designSettings.borderRadius}px`,
                                }}
                                onMouseEnter={(e) =>
                                  (e.currentTarget.style.opacity = "1")
                                }
                                onMouseLeave={(e) =>
                                  (e.currentTarget.style.opacity = "0")
                                }
                              >
                                {/* Instagram Icon */}
                                <svg
                                  width="32px"
                                  height="32px"
                                  fill="#ffffff"
                                  viewBox="0 0 64 64"
                                  xmlns="http://www.w3.org/2000/svg"
                                >
                                  <path d="M44,57H20A13,13,0,0,1,7,44V20A13,13,0,0,1,20,7H44A13,13,0,0,1,57,20V44A13,13,0,0,1,44,57ZM20,9A11,11,0,0,0,9,20V44A11,11,0,0,0,20,55H44A11,11,0,0,0,55,44V20A11,11,0,0,0,44,9Z"></path>
                                  <path d="M32,43.67A11.67,11.67,0,1,1,43.67,32,11.68,11.68,0,0,1,32,43.67Zm0-21.33A9.67,9.67,0,1,0,41.67,32,9.68,9.68,0,0,0,32,22.33Z"></path>
                                  <path d="M44.5,21A3.5,3.5,0,1,1,48,17.5,3.5,3.5,0,0,1,44.5,21Zm0-5A1.5,1.5,0,1,0,46,17.5,1.5,1.5,0,0,0,44.5,16Z"></path>
                                </svg>

                                {/* Stats */}
                                <div
                                  style={{
                                    display: "flex",
                                    gap: "12px",
                                    color: "white",
                                    fontSize: "14px",
                                    alignItems: "center",
                                  }}
                                >
                                  <span
                                    style={{
                                      display: "flex",
                                      alignItems: "center",
                                      gap: "6px",
                                    }}
                                  >
                                    {post.likes || 0}
                                    <svg
                                      width="16"
                                      height="16"
                                      viewBox="0 0 24 24"
                                      fill="white"
                                    >
                                      <path d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z" />
                                    </svg>
                                  </span>
                                  <span
                                    style={{
                                      display: "flex",
                                      alignItems: "center",
                                      gap: "6px",
                                    }}
                                  >
                                    {post.comments || 0}
                                    <svg
                                      width="16"
                                      height="16"
                                      viewBox="0 0 24 24"
                                      fill="white"
                                    >
                                      <path d="M20 2H4c-1.1 0-2 .9-2 2v18l4-4h14c1.1 0 2-.9 2-2V4c0-1.1-.9-2-2-2z" />
                                    </svg>
                                  </span>
                                </div>
                              </div>
                            </div>
                          ))}

                        {instagramPosts.length === 0 && (
                          <div
                            style={{
                              padding: "20px",
                              textAlign: "center",
                              color: "#999",
                              fontSize: "14px",
                            }}
                          >
                            No posts synced yet
                          </div>
                        )}
                      </div>

                      {/* Instagram Handle */}
                      {designSettings.showHandle &&
                        instagramAccount?.username && (
                          <div
                            style={{
                              fontSize: "14px",
                              fontWeight: "600",
                              marginTop: "12px",
                              textAlign: "center",
                              color: "#666",
                              fontFamily:
                                "system-ui, -apple-system, sans-serif",
                            }}
                          >
                            @{instagramAccount.username}
                          </div>
                        )}
                    </div>
                  </s-box>
                </s-stack>
              </div>

              <s-divider />

              {/* Info Banner */}
              <s-banner tone="info">
                <s-text>
                  Configure settings here, then add the block to your theme.
                  Fine-tune in the theme editor for real-time preview.
                </s-text>
              </s-banner>
            </s-stack>
          </s-card>
        </s-section>
      )}
    </s-page>
  );
}
export const headers: HeadersFunction = (headersArgs) => {
  return boundary.headers(headersArgs);
};

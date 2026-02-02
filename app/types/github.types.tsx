export interface GitHubTreeItem {
  path: string;
  type: "blob" | "tree";
  sha: string;
  url: string;
}

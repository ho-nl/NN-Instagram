interface GitHubTreeItem {
  path: string;
  type: "blob" | "tree";
  sha: string;
  url: string;
}

interface GitHubTree {
  tree: GitHubTreeItem[];
}

interface RepoData {
  default_branch: string;
}

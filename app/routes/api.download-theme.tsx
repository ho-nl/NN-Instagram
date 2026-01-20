import type { LoaderFunctionArgs } from "react-router";
import { authenticate } from "../shopify.server";
import archiver from "archiver";

const GITHUB_REPO = "mohamedamezian/NN-Instagram-Carousel";
const GITHUB_API = "https://api.github.com";
const GITHUB_TOKEN = process.env.GITHUB_TOKEN; // Optional

function isInstagramFile(filePath: string): boolean {
  return filePath.toLowerCase().includes("instagram");
}

function isThemeFile(filePath: string): boolean {
  const themeDirs = [
    "sections",
    "blocks",
    "snippets",
    "templates",
    "assets",
    "layout",
    "locales",
    "config",
  ];
  const pathParts = filePath.split("/");
  return themeDirs.includes(pathParts[0]);
}

async function fetchGitHubTree(): Promise<{
  tree: GitHubTreeItem[];
  defaultBranch: string;
}> {
  const headers: HeadersInit = {
    Accept: "application/vnd.github.v3+json",
  };

  if (GITHUB_TOKEN) {
    headers["Authorization"] = `token ${GITHUB_TOKEN}`;
  }

  // Get default branch
  const repoResponse = await fetch(`${GITHUB_API}/repos/${GITHUB_REPO}`, {
    headers,
  });
  if (!repoResponse.ok) {
    throw new Error(
      `Failed to fetch repository info: ${repoResponse.statusText}`,
    );
  }
  const repoData: RepoData = await repoResponse.json();
  const defaultBranch = repoData.default_branch || "main";

  // Get tree
  const treeResponse = await fetch(
    `${GITHUB_API}/repos/${GITHUB_REPO}/git/trees/${defaultBranch}?recursive=1`,
    { headers },
  );

  if (!treeResponse.ok) {
    throw new Error(`Failed to fetch tree: ${treeResponse.statusText}`);
  }

  const treeData: GitHubTree = await treeResponse.json();
  return { tree: treeData.tree, defaultBranch };
}

async function downloadFile(
  path: string,
  defaultBranch: string,
): Promise<Buffer> {
  const rawUrl = `https://raw.githubusercontent.com/${GITHUB_REPO}/${defaultBranch}/${path}`;

  const headers: HeadersInit = {};
  if (GITHUB_TOKEN) {
    headers["Authorization"] = `token ${GITHUB_TOKEN}`;
  }

  const response = await fetch(rawUrl, { headers });

  if (!response.ok) {
    throw new Error(`Failed to download ${path}: ${response.statusText}`);
  }

  const arrayBuffer = await response.arrayBuffer();
  return Buffer.from(arrayBuffer);
}

export const loader = async ({ request }: LoaderFunctionArgs) => {
  await authenticate.admin(request);

  try {
    console.log("📦 Generating theme zip from GitHub...");

    // Fetch the repository tree
    const { tree: allFiles, defaultBranch } = await fetchGitHubTree();

    // Filter for Instagram theme files
    const instagramFiles = allFiles.filter(
      (item) =>
        item.type === "blob" &&
        isInstagramFile(item.path) &&
        isThemeFile(item.path),
    );

    if (instagramFiles.length === 0) {
      return new Response(
        JSON.stringify({
          success: false,
          message: "No Instagram theme files found in repository",
        }),
        {
          status: 404,
          headers: { "Content-Type": "application/json" },
        },
      );
    }

    console.log(`✨ Found ${instagramFiles.length} Instagram files`);

    // Create a zip archive in memory
    const archive = archiver("zip", {
      zlib: { level: 9 },
    });

    // Create a promise to collect all chunks
    const zipPromise = new Promise<Buffer>((resolve, reject) => {
      const chunks: Buffer[] = [];

      archive.on("data", (chunk: Buffer) => {
        chunks.push(chunk);
      });

      archive.on("end", () => {
        resolve(Buffer.concat(chunks));
      });

      archive.on("error", (err: Error) => {
        reject(err);
      });
    });

    // Download and add each file to the zip
    for (const file of instagramFiles) {
      console.log(`  ⬇️  ${file.path}`);
      const content = await downloadFile(file.path, defaultBranch);
      archive.append(content, { name: file.path });
    }

    // Finalize the archive (this will trigger the 'end' event)
    archive.finalize();

    // Wait for the zip to be fully created
    const zipBuffer = await zipPromise;

    console.log(
      `✅ Zip created: ${(zipBuffer.length / 1024).toFixed(2)} KB with ${instagramFiles.length} files`,
    );

    // Return the zip file as a Uint8Array (compatible with Response)
    return new Response(new Uint8Array(zipBuffer), {
      status: 200,
      headers: {
        "Content-Type": "application/zip",
        "Content-Disposition": "attachment; filename=nn-instagram-theme.zip",
        "Content-Length": zipBuffer.length.toString(),
      },
    });
  } catch (error) {
    console.error("❌ Error generating theme zip:", error);
    return new Response(
      JSON.stringify({
        success: false,
        message: "Failed to generate theme files",
        error: error instanceof Error ? error.message : "Unknown error",
      }),
      {
        status: 500,
        headers: { "Content-Type": "application/json" },
      },
    );
  }
};

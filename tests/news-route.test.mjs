import test from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

test("the canonical /news route renders links to published newsroom articles", { timeout: 120_000 }, () => {
  const routeEntries = ["src/pages/news.astro", "src/pages/news/index.astro"]
    .filter((entry) => {
      try {
        readFileSync(path.join(root, entry));
        return true;
      } catch (error) {
        if (error?.code === "ENOENT") return false;
        throw error;
      }
    });

  assert.deepEqual(routeEntries, ["src/pages/news/index.astro"], "/news should have one canonical page entry");

  execFileSync("npm", ["run", "build:offline"], {
    cwd: root,
    env: { ...process.env, ASTRO_TELEMETRY_DISABLED: "1" },
    stdio: "inherit",
  });

  const newsDist = path.join(root, "dist/news");
  const reservedRoutes = new Set(["around-the-web", "category", "page"]);
  const articleSlugs = readdirSync(newsDist, { withFileTypes: true })
    .filter((entry) => entry.isDirectory() && !reservedRoutes.has(entry.name))
    .filter((entry) => {
      const html = readFileSync(path.join(newsDist, entry.name, "index.html"), "utf8");
      return /["']@type["']\s*:\s*["']NewsArticle["']/.test(html);
    })
    .map((entry) => entry.name);

  const newsroomHtml = readFileSync(path.join(newsDist, "index.html"), "utf8");
  assert.match(newsroomHtml, /<h1[^>]*>Newsroom<\/h1>/i);
  assert.doesNotMatch(newsroomHtml, /Trending Now/i);
  if (articleSlugs.length) {
    assert.ok(
      articleSlugs.some((slug) => newsroomHtml.includes(`href="/news/${slug}/"`)),
      "built /news HTML should link to at least one published article",
    );
  }
});

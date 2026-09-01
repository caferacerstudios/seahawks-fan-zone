import test from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const artifact = path.join(root, "tests/fixtures/playerProfiles.generated.json");
const fallback = "No verified biography is available in the current player data.";

test("offline rendering embeds generated profiles in final static HTML", { timeout: 120_000 }, () => {
  execFileSync("npm", ["run", "build:offline"], {
    cwd: root,
    env: { ...process.env, PLAYER_PROFILES_ARTIFACT: artifact },
    stdio: "inherit",
  });

  const numericHtml = fs.readFileSync(path.join(root, "dist/players/12345/index.html"), "utf8");
  const aliasHtml = fs.readFileSync(path.join(root, "dist/players/jaxon-smith-njigba/index.html"), "utf8");
  const missingHtml = fs.readFileSync(path.join(root, "dist/players/aj-barner/index.html"), "utf8");

  for (const html of [numericHtml, aliasHtml]) {
    assert.match(html, /SFZ PLAYER BIO ACCEPTANCE SENTINEL/);
    assert.ok(!html.includes(fallback));
  }
  assert.ok(missingHtml.includes(fallback));
});

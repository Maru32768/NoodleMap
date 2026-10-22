import { copyFileSync, existsSync } from "node:fs";
import { dirname, join, relative } from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), "..");
const guidelineDirs = [".", "web", "server", "typespec", "db"];

for (const dir of guidelineDirs) {
  const source = join(repoRoot, dir, "CLAUDE.md");
  const target = join(repoRoot, dir, "AGENTS.md");

  if (!existsSync(source)) {
    throw new Error(`Missing ${relative(repoRoot, source)}`);
  }

  copyFileSync(source, target);
  console.log(`${relative(repoRoot, source)} -> ${relative(repoRoot, target)}`);
}

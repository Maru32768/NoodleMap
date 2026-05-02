import { readdir, readFile } from "node:fs/promises";
import path from "node:path";

const root = path.resolve("src");
const extensions = new Set([".css", ".html", ".ts", ".tsx"]);
const mojibakePattern =
  /縺|繧|繝|荳|蠎|譛|蝨|逕|蜈|鬆|菫|髢|險|邱|譁|蜷|驛|謦|蝠|謫|逡|讀|蜑|謇|邨|�|/u;

const failures = [];

async function walk(dir) {
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      await walk(fullPath);
      continue;
    }

    if (!extensions.has(path.extname(entry.name))) {
      continue;
    }

    const text = await readFile(fullPath, "utf8");
    const lines = text.split(/\r?\n/u);
    lines.forEach((line, index) => {
      if (mojibakePattern.test(line)) {
        failures.push({
          file: path.relative(process.cwd(), fullPath),
          line: index + 1,
          text: line.trim(),
        });
      }
    });
  }
}

await walk(root);

if (failures.length > 0) {
  console.error("Possible mojibake text found:");
  for (const failure of failures) {
    console.error(`${failure.file}:${failure.line}: ${failure.text}`);
  }
  process.exit(1);
}

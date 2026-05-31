import { mkdir } from "node:fs/promises";
import path from "node:path";
import { spawn } from "node:child_process";

const DEFAULT_SOURCE = "https://build.protomaps.com/20251201.pmtiles";
const DEFAULT_BBOX = "122.0,20.0,154.0,46.5";
const DEFAULT_VERSION = "v1";

function parseArgs(argv) {
  const result = {};

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (!arg.startsWith("--")) {
      continue;
    }

    const [rawKey, rawValue] = arg.slice(2).split("=", 2);
    const value = rawValue ?? argv[i + 1];
    if (!rawValue) {
      i += 1;
    }
    result[rawKey] = value;
  }

  return result;
}

const argsByName = parseArgs(process.argv.slice(2));
const source = argsByName.source ?? process.env.BASEMAP_SOURCE ?? DEFAULT_SOURCE;
const bbox = argsByName.bbox ?? process.env.BASEMAP_BBOX ?? DEFAULT_BBOX;
const version = argsByName.version ?? process.env.BASEMAP_VERSION ?? DEFAULT_VERSION;
const sourceDate = source.match(/\/(\d{8})\.pmtiles$/u)?.[1] ?? "custom";
const defaultOutput = `public/maps/japan-light-${sourceDate}-${version}.pmtiles`;
const output = argsByName.output ?? process.env.BASEMAP_OUTPUT ?? defaultOutput;
const outputPath = path.resolve(output);
const outputDir = path.dirname(outputPath);
const workDir = path.parse(outputPath).root;
const dockerOutput = path.posix.join(
  "/work",
  path.relative(workDir, outputPath).split(path.sep).join(path.posix.sep),
);

await mkdir(outputDir, { recursive: true });

const args = [
  "run",
  "--rm",
  "-v",
  `${workDir}:/work`,
  "protomaps/go-pmtiles",
  "extract",
  source,
  dockerOutput,
  `--bbox=${bbox}`,
];

console.log(`Extracting basemap from ${source}`);
console.log(`bbox: ${bbox}`);
console.log(`output: ${outputPath}`);

const child = spawn("docker", args, {
  stdio: "inherit",
});

child.on("exit", (code) => {
  process.exit(code ?? 1);
});

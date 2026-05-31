import { spawn } from "node:child_process";

const DEFAULT_BUCKET = "noodle-map-basemap";
const DEFAULT_SOURCE = "https://build.protomaps.com/20251201.pmtiles";
const DEFAULT_VERSION = "v1";
const DEFAULT_ACCOUNT_ID = "27f0188849b71a6222f1aa078299a54a";
const CACHE_CONTROL = "public, max-age=31536000, immutable";
const CONTENT_TYPE = "application/octet-stream";

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
const bucket = argsByName.bucket ?? process.env.R2_BUCKET ?? DEFAULT_BUCKET;
const source =
  argsByName.source ?? process.env.BASEMAP_SOURCE ?? DEFAULT_SOURCE;
const version =
  argsByName.version ?? process.env.BASEMAP_VERSION ?? DEFAULT_VERSION;
const sourceDate = source.match(/\/(\d{8})\.pmtiles$/u)?.[1] ?? "custom";
const defaultKey = `maps/japan-light-${sourceDate}-${version}.pmtiles`;
const defaultFile = `public/maps/japan-light-${sourceDate}-${version}.pmtiles`;
const key = argsByName.key ?? process.env.R2_OBJECT_KEY ?? defaultKey;
const file = argsByName.file ?? process.env.PMTILES_FILE ?? defaultFile;
const accountId =
  argsByName["account-id"] ??
  process.env.R2_ACCOUNT_ID ??
  process.env.CLOUDFLARE_ACCOUNT_ID ??
  process.env.CF_ACCOUNT_ID ??
  DEFAULT_ACCOUNT_ID;
const objectPath = `${bucket}/${key}`;
const aws = process.platform === "win32" ? "aws.cmd" : "aws";

const missingCredentials = [
  "AWS_ACCESS_KEY_ID",
  "AWS_SECRET_ACCESS_KEY",
].filter((name) => !process.env[name]);

if (missingCredentials.length > 0) {
  console.error(
    `Missing R2 S3 credential environment variable(s): ${missingCredentials.join(", ")}`,
  );
  console.error(
    "Create an R2 API token with S3 credentials and export AWS_ACCESS_KEY_ID and AWS_SECRET_ACCESS_KEY.",
  );
  process.exit(1);
}

console.log(`Uploading ${file}`);
console.log(`R2 object: ${objectPath}`);
console.log("Resource location: remote");
console.log("Uploader: aws s3 cp");
console.log(`Cache-Control: ${CACHE_CONTROL}`);

const child = spawn(
  aws,
  [
    "s3",
    "cp",
    file,
    `s3://${bucket}/${key}`,
    "--endpoint-url",
    `https://${accountId}.r2.cloudflarestorage.com`,
    "--region",
    "auto",
    "--content-type",
    CONTENT_TYPE,
    "--cache-control",
    CACHE_CONTROL,
  ],
  {
    stdio: "inherit",
    env: {
      ...process.env,
      AWS_REQUEST_CHECKSUM_CALCULATION:
        process.env.AWS_REQUEST_CHECKSUM_CALCULATION ?? "when_required",
      AWS_RESPONSE_CHECKSUM_VALIDATION:
        process.env.AWS_RESPONSE_CHECKSUM_VALIDATION ?? "when_required",
    },
  },
);

child.on("error", (error) => {
  if (error.code === "ENOENT") {
    console.error(`${aws} was not found. Install AWS CLI to upload PMTiles.`);
  } else {
    console.error(error);
  }
  process.exit(1);
});

child.on("exit", (code) => {
  process.exit(code ?? 1);
});

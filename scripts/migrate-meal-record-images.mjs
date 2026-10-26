import { createHash } from 'node:crypto';
import { mkdir, writeFile, rename } from 'node:fs/promises';
import { dirname } from 'node:path';
import { parseArgs } from 'node:util';
import { pathToFileURL } from 'node:url';

const oldKey = /^visits\/([0-9a-f-]{36})\/([0-9a-f-]{36})\.jpg$/;
const metadataHeaders = {
  contentType: 'content-type',
  cacheControl: 'cache-control',
  contentDisposition: 'content-disposition',
  contentLanguage: 'content-language',
  cacheExpiry: 'expires',
};
const digest = (bytes) => createHash('sha256').update(bytes).digest('hex');

export function imageCopies(objects) {
  const seen = new Set();
  return objects.map((object) => {
    const match = oldKey.exec(object.key);
    if (!match || seen.has(object.key)) throw new Error(`Unexpected source key: ${object.key}`);
    seen.add(object.key);
    if (object.ssec || object.http_metadata?.contentEncoding || Object.keys(object.custom_metadata ?? {}).length) {
      throw new Error(`Unsupported source metadata: ${object.key}`);
    }
    if (!Number.isSafeInteger(object.size) || object.size < 1 || object.size > 32 * 1024 * 1024) {
      throw new Error(`Invalid image size: ${object.key}`);
    }
    return {
      source: object,
      targets: [object.key, `meal-records/${match[1]}/${match[2]}.jpg`],
    };
  });
}

export function r2Client({ accountId, token, fetchImpl = fetch }) {
  if (!/^[0-9a-f]{32}$/.test(accountId) || !token) throw new Error('Cloudflare account ID and API token are required');
  const base = `https://api.cloudflare.com/client/v4/accounts/${accountId}/r2/buckets/`;
  const bucketPath = (bucket) => {
    if (!/^[a-z0-9][a-z0-9-]{1,62}[a-z0-9]$/.test(bucket)) throw new Error('Invalid bucket name');
    return base + bucket;
  };
  const objectPath = (bucket, key) => `${bucketPath(bucket)}/objects/${key.split('/').map(encodeURIComponent).join('/')}`;
  async function request(url, options = {}) {
    const response = await fetchImpl(url, {
      ...options,
      headers: { ...options.headers, authorization: `Bearer ${token}` },
      signal: AbortSignal.timeout(60_000),
      redirect: 'error',
    });
    if (!response.ok) throw new Error(`R2 ${options.method ?? 'GET'} failed (${response.status})`);
    return response;
  }
  return {
    async list(bucket) {
      const objects = [];
      const cursors = new Set();
      let cursor;
      do {
        const url = new URL(`${bucketPath(bucket)}/objects`);
        url.searchParams.set('per_page', '1000');
        if (cursor) url.searchParams.set('cursor', cursor);
        const response = await request(url);
        const page = await response.json();
        if (!page.success || !Array.isArray(page.result)) throw new Error('Invalid R2 object list');
        objects.push(...page.result);
        const info = page.result_info;
        cursor = info?.is_truncated ? info.cursor : undefined;
        if (info?.is_truncated && (!cursor || cursors.has(cursor))) throw new Error('Invalid R2 pagination cursor');
        if (!info && page.result.length >= 1000) throw new Error('R2 list completeness cannot be established');
        if (cursor) cursors.add(cursor);
      } while (cursor);
      return objects;
    },
    async read(bucket, key) {
      const response = await request(objectPath(bucket, key));
      return { bytes: Buffer.from(await response.arrayBuffer()), headers: response.headers };
    },
    async put(bucket, key, bytes, metadata) {
      const headers = {};
      for (const [field, header] of Object.entries(metadataHeaders)) {
        if (metadata?.[field]) headers[header] = field === 'cacheExpiry'
          ? new Date(metadata[field]).toUTCString()
          : metadata[field];
      }
      const response = await request(objectPath(bucket, key), { method: 'PUT', headers, body: bytes });
      const result = await response.json();
      if (!result.success) throw new Error(`R2 upload rejected: ${key}`);
    },
  };
}

function assertImage(image, source, hash) {
  if (image.bytes.length !== source.size || digest(image.bytes) !== hash) throw new Error(`Image content mismatch: ${source.key}`);
  for (const [field, header] of Object.entries(metadataHeaders)) {
    const expected = source.http_metadata?.[field];
    if (!expected) continue;
    const actual = image.headers.get(header);
    const matches = field === 'cacheExpiry'
      ? actual !== null && Date.parse(actual) === Date.parse(expected)
      : actual === expected;
    if (!matches) throw new Error(`Image metadata mismatch (${header}): ${source.key}`);
  }
}

export async function migrateImages(client, {
  sourceBucket,
  targetBucket,
  mode = 'plan',
  progress = () => {},
}) {
  if (sourceBucket === targetBucket) throw new Error('Source and target buckets must differ');
  if (!['plan', 'apply', 'verify'].includes(mode)) throw new Error('Invalid migration mode');
  const sourceObjects = await client.list(sourceBucket);
  const copies = imageCopies(sourceObjects);
  const report = {
    sourceBucket, targetBucket, mode,
    sourceCount: copies.length,
    sourceBytes: sourceObjects.reduce((sum, object) => sum + object.size, 0),
    expectedTargetCount: copies.length * 2,
    verified: [],
  };
  if (mode === 'plan') return report;
  const targetObjects = new Map((await client.list(targetBucket)).map((object) => [object.key, object]));
  for (const { source, targets } of copies) {
    const original = await client.read(sourceBucket, source.key);
    const sha256 = digest(original.bytes);
    assertImage(original, source, sha256);
    for (const key of targets) {
      if (!targetObjects.has(key)) {
        if (mode === 'verify') throw new Error(`Missing target image: ${key}`);
        await client.put(targetBucket, key, original.bytes, source.http_metadata);
      }
      const target = await client.read(targetBucket, key);
      assertImage(target, source, sha256);
    }
    report.verified.push({ sourceKey: source.key, targetKeys: targets, size: source.size, sha256 });
    progress(report.verified.length, copies.length);
  }
  const after = await client.list(sourceBucket);
  const signature = (objects) => JSON.stringify(objects.map(({ key, size, etag }) => ({ key, size, etag })).sort((a, b) => a.key.localeCompare(b.key)));
  if (signature(after) !== signature(sourceObjects)) throw new Error('Source changed during migration; stop writes and rerun');
  return report;
}

async function main() {
  const { values } = parseArgs({ options: {
    'account-id': { type: 'string' },
    'source-bucket': { type: 'string', default: 'noodle-map-visit-images' },
    'target-bucket': { type: 'string', default: 'noodle-map-meal-record-images' },
    apply: { type: 'boolean', default: false },
    verify: { type: 'boolean', default: false },
    report: { type: 'string' },
  } });
  if (values.apply && values.verify) throw new Error('Choose --apply or --verify');
  const mode = values.apply ? 'apply' : values.verify ? 'verify' : 'plan';
  const client = r2Client({ accountId: values['account-id'], token: process.env.CLOUDFLARE_API_TOKEN });
  const report = await migrateImages(client, {
    sourceBucket: values['source-bucket'], targetBucket: values['target-bucket'], mode,
    progress: (done, total) => { if (done % 10 === 0 || done === total) console.log(`Verified ${done}/${total} source images`); },
  });
  if (values.report) {
    await mkdir(dirname(values.report), { recursive: true });
    const temporary = `${values.report}.tmp`;
    await writeFile(temporary, JSON.stringify({ completedAt: new Date().toISOString(), ...report }, null, 2) + '\n', { encoding: 'utf8', mode: 0o600 });
    await rename(temporary, values.report);
  }
  console.log(JSON.stringify({ mode, sourceCount: report.sourceCount, sourceBytes: report.sourceBytes, expectedTargetCount: report.expectedTargetCount, verifiedCount: report.verified.length }));
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error) => { console.error(error.message); process.exitCode = 1; });
}

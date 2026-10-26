import test from 'node:test';
import assert from 'node:assert/strict';
import { imageCopies, migrateImages, r2Client } from './migrate-meal-record-images.mjs';

const key = 'visits/11111111-1111-4111-8111-111111111111/22222222-2222-4222-8222-222222222222.jpg';
const newKey = key.replace('visits/', 'meal-records/');
const bytes = Buffer.from('jpeg image');
const metadata = { contentType: 'image/jpeg', cacheControl: 'public, max-age=86400' };
const source = { key, size: bytes.length, etag: 'source-etag', http_metadata: metadata };

function fixture() {
  const target = new Map();
  const writes = [];
  let failAfterPut = false;
  const client = {
    list: async (bucket) => bucket === 'source' ? [source] : [...target.keys()].map((key) => ({ key })),
    read: async (bucket, requestedKey) => {
      if (failAfterPut && bucket === 'target') { failAfterPut = false; throw new Error('connection interrupted'); }
      return {
        bytes: bucket === 'source' ? bytes : target.get(requestedKey),
        headers: new Headers({ 'content-type': metadata.contentType, 'cache-control': metadata.cacheControl }),
      };
    },
    put: async (bucket, requestedKey, body, headers) => {
      writes.push({ bucket, key: requestedKey, headers });
      target.set(requestedKey, body);
    },
  };
  return { client, target, writes, interrupt: () => { failAfterPut = true; } };
}
const options = { sourceBucket: 'source', targetBucket: 'target', mode: 'apply' };

test('plan performs no writes and lists both retained and renamed destinations', async () => {
  const { client, writes } = fixture();
  const report = await migrateImages(client, { ...options, mode: 'plan' });
  assert.equal(report.expectedTargetCount, 2);
  assert.equal(report.sourceBytes, bytes.length);
  assert.deepEqual(imageCopies([source])[0].targets, [key, newKey]);
  assert.deepEqual(writes, []);
});

test('copy retains old URLs, verifies bytes and metadata, and reruns without writes', async () => {
  const { client, writes, target } = fixture();
  const report = await migrateImages(client, options);
  assert.equal(report.verified.length, 1);
  assert.deepEqual([...target.keys()], [key, newKey]);
  assert.equal(writes.length, 2);
  assert.deepEqual(writes[0].headers, metadata);
  await migrateImages(client, options);
  await migrateImages(client, { ...options, mode: 'verify' });
  assert.equal(writes.length, 2);
});

test('interrupted upload resumes by verifying existing objects', async () => {
  const { client, writes, interrupt } = fixture();
  interrupt();
  await assert.rejects(migrateImages(client, options), /connection interrupted/);
  const report = await migrateImages(client, options);
  assert.equal(report.verified.length, 1);
  assert.equal(writes.length, 2);
});

test('conflicting target bytes fail without overwriting or deleting', async () => {
  const { client, target, writes } = fixture();
  target.set(key, Buffer.from('conflict'));
  await assert.rejects(migrateImages(client, options), /content mismatch/);
  assert.deepEqual(writes, []);
  assert.equal(target.get(key).toString(), 'conflict');
});

test('verify mode refuses missing targets without writing', async () => {
  const { client, writes } = fixture();
  await assert.rejects(migrateImages(client, { ...options, mode: 'verify' }), /Missing target/);
  assert.deepEqual(writes, []);
});

test('source changes during copying invalidate the result', async () => {
  const { client } = fixture();
  let calls = 0;
  const list = client.list;
  client.list = async (bucket) => bucket === 'source' && ++calls > 1 ? [{ ...source, etag: 'changed' }] : list(bucket);
  await assert.rejects(migrateImages(client, options), /Source changed/);
});

test('expiry metadata compares ISO and HTTP dates as the same instant', async () => {
  const { client } = fixture();
  const expiry = '2027-01-01T00:00:00.000Z';
  const list = client.list;
  client.list = async (bucket) => bucket === 'source' ? [{ ...source, http_metadata: { ...metadata, cacheExpiry: expiry } }] : list(bucket);
  const read = client.read;
  client.read = async (...args) => {
    const image = await read(...args);
    image.headers.set('expires', new Date(expiry).toUTCString());
    return image;
  };
  assert.equal((await migrateImages(client, options)).verified.length, 1);
});

test('unknown source keys, metadata and duplicate keys fail before copying', () => {
  assert.throws(() => imageCopies([{ ...source, key: '../outside.jpg' }]), /Unexpected source key/);
  assert.throws(() => imageCopies([source, source]), /Unexpected source key/);
  assert.throws(() => imageCopies([{ ...source, custom_metadata: { owner: 'value' } }]), /Unsupported source metadata/);
});

test('REST client paginates and preserves literal object path slashes', async () => {
  const requests = [];
  const client = r2Client({ accountId: 'a'.repeat(32), token: 'test-token', fetchImpl: async (url, options) => {
    requests.push({ url: String(url), options });
    if (String(url).endsWith('.jpg')) return new Response(bytes);
    const page = requests.length === 1
      ? { success: true, result: [source], result_info: { is_truncated: true, cursor: 'next-page' } }
      : { success: true, result: [] };
    return Response.json(page);
  } });
  assert.equal((await client.list('source')).length, 1);
  assert.ok(requests[1].url.includes('cursor=next-page'));
  await client.read('source', key);
  assert.ok(requests[2].url.endsWith('/objects/' + key));
  assert.equal(requests[2].options.headers.authorization, 'Bearer test-token');
  assert.equal(requests[2].options.redirect, 'error');
});

test('REST client refuses uncertain pagination completeness', async () => {
  const client = r2Client({ accountId: 'a'.repeat(32), token: 'test-token', fetchImpl: async () => Response.json({ success: true, result: Array(1000).fill(source) }) });
  await assert.rejects(client.list('source'), /completeness/);
});

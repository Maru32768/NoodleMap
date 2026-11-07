import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { test } from 'node:test';
import { BATCH_COUNT, batchOf, batchProgress, exportBatch, fetchCatalog } from './export-batch.mjs';

const shoyu = { id: 't1', slug: 'shoyu-ramen', label: '醤油', category: 'ramen', sortOrder: 10, color: '#000' };
const queue = { id: 't2', slug: 'queue', label: '行列', sortOrder: 20, color: '#111' };

function makeCatalog() {
  return {
    tags: [queue, shoyu],
    shops: [
      {
        id: 'b',
        name: '閉店した店',
        nameKana: 'へいてん',
        address: '東京都杉並区',
        category: 'udon',
        openedAt: '2020-01-01',
        closedAt: '2026-09-22',
        lat: 35.7,
        lng: 139.6,
        postalCode: '166-0004',
        googlePlaceId: 'place-b',
        rate: 10,
        eaten: true,
        favorite: false,
        mealRecordCount: 2,
        tags: [],
        links: [],
      },
      {
        id: 'a',
        name: '営業中の店',
        address: '東京都港区',
        category: 'ramen',
        temporaryClosure: { startsOn: '2026-11-01' },
        lat: 35.6,
        lng: 139.7,
        postalCode: '106-0032',
        googlePlaceId: 'place-a',
        rate: 95,
        wishLevel: 'high',
        eaten: false,
        favorite: true,
        mealRecordCount: 0,
        tags: [queue, shoyu],
        links: [
          { type: 'official', label: '公式', url: 'https://a.example/' },
          { type: 'twitter', url: 'https://x.com/a' },
        ],
      },
    ],
  };
}

const options = { runId: 'run-1', fields: ['name', 'tag'] };

test('a batch carries exactly the public shop fields', () => {
  const batch = exportBatch(makeCatalog(), options);
  assert.deepEqual(Object.keys(batch.shops[0]).sort(), [
    'address',
    'category',
    'closedAt',
    'id',
    'links',
    'name',
    'nameKana',
    'openedAt',
    'tags',
    'temporaryClosure',
  ]);
  assert.deepEqual(Object.keys(batch.tags[0]).sort(), ['category', 'label', 'slug']);
  const text = JSON.stringify(batch);
  for (const secret of ['place-a', '106-0032', '35.6', '"rate"', '"high"', 'wish', 'favorite', 'mealRecordCount']) {
    assert.ok(!text.includes(secret), secret);
  }
});

test('tags keep their sort order and links their display order', () => {
  const batch = exportBatch(makeCatalog(), { ...options, shopIds: ['a'] });
  assert.deepEqual(batch.tags.map((tag) => tag.slug), ['shoyu-ramen', 'queue']);
  assert.deepEqual(batch.shops[0].tags, ['shoyu-ramen', 'queue']);
  assert.deepEqual(batch.shops[0].links.map((link) => link.type), ['official', 'twitter']);
});

test('a value the API leaves out reaches the batch as null', () => {
  const [shop] = exportBatch(makeCatalog(), { ...options, shopIds: ['a'] }).shops;
  assert.equal(shop.nameKana, null);
  assert.equal(shop.openedAt, null);
  assert.equal(shop.closedAt, null);
  assert.deepEqual(shop.temporaryClosure, { startsOn: '2026-11-01', reopensOn: null });
  assert.deepEqual(shop.links[1], { type: 'twitter', label: null, url: 'https://x.com/a' });
  assert.equal(exportBatch(makeCatalog(), options).tags[1].category, null);
});

test('the selection options narrow the shops', () => {
  const ids = (extra) => exportBatch(makeCatalog(), { ...options, ...extra }).shops.map((shop) => shop.id);
  assert.deepEqual(ids({}), ['a', 'b']);
  assert.deepEqual(ids({ shopIds: ['b'] }), ['b']);
  assert.deepEqual(ids({ skipShopIds: new Set(['a']) }), ['b']);
  assert.deepEqual(ids({ batch: batchOf('a') }), batchOf('a') === batchOf('b') ? ['a', 'b'] : ['a']);
});

test('every shop falls in exactly one batch, and a new shop moves no other shop', () => {
  const catalog = makeCatalog();
  const batches = () =>
    Array.from({ length: BATCH_COUNT }, (_, batch) =>
      exportBatch(catalog, { ...options, batch }).shops.map((shop) => shop.id),
    );
  const before = batches();
  assert.deepEqual(before.flat().sort(), ['a', 'b']);

  catalog.shops.push({ id: 'c', name: '新しい店', address: '東京都', category: 'ramen', tags: [], links: [] });
  const after = batches();
  assert.deepEqual(after.flat().sort(), ['a', 'b', 'c']);
  after.forEach((ids, batch) => assert.deepEqual(ids.filter((id) => id !== 'c'), before[batch]));
});

test('the assignment of a shop never changes', () => {
  // Results on disk are filed by this number, so a changed hash would orphan them.
  assert.equal(batchOf('11111111-2222-4333-8444-555555555555'), 2);
});

test('progress counts the shops of each batch and the ones already researched', () => {
  const id = '11111111-2222-4333-8444-555555555555';
  const progress = batchProgress([id, 'a'], (batch) => new Set(batch === batchOf(id) ? [id] : []));
  assert.equal(progress.length, BATCH_COUNT);
  assert.equal(progress.reduce((sum, entry) => sum + entry.shops, 0), 2);
  assert.equal(progress.reduce((sum, entry) => sum + entry.researched, 0), 1);
  assert.equal(progress[batchOf(id)].researched, 1);
});

test('an unknown field stops the export', () => {
  assert.throws(() => exportBatch(makeCatalog(), { ...options, fields: ['rate'] }), /Unknown field/);
});

async function withServer(handler, run) {
  const server = createServer(handler);
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  try {
    await run(`http://127.0.0.1:${server.address().port}`);
  } finally {
    server.close();
  }
}

test('the catalog comes from the public shop and tag endpoints', async () => {
  const bodies = { '/api/v1/shops': { shops: [{ id: 'a' }] }, '/api/v1/tags': { tags: [shoyu] } };
  await withServer(
    (request, response) => response.end(JSON.stringify(bodies[request.url])),
    async (origin) => assert.deepEqual(await fetchCatalog(origin), { shops: [{ id: 'a' }], tags: [shoyu] }),
  );
});

test('a failed or malformed response stops the export instead of writing a short batch', async () => {
  await withServer(
    (_request, response) => {
      response.statusCode = 500;
      response.end('{}');
    },
    (origin) => assert.rejects(fetchCatalog(origin), /answered 500/),
  );
  await withServer(
    (_request, response) => response.end('{}'),
    (origin) => assert.rejects(fetchCatalog(origin), /returned no (shops|tags) list/),
  );
});

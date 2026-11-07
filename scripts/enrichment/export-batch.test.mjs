import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { test } from 'node:test';
import { BATCH_COUNT, batchOf, batchProgress, exportBatch } from './export-batch.mjs';

function makeDb() {
  const db = new DatabaseSync(':memory:');
  db.exec(`
    CREATE TABLE shops (id TEXT, name TEXT, name_kana TEXT, address TEXT, category TEXT, opened_at TEXT, closed_at TEXT,
      temporary_closure_starts_on TEXT, temporary_closure_reopens_on TEXT,
      lat REAL, lng REAL, postal_code TEXT, google_place_id TEXT, rate INTEGER, wish_level TEXT);
    CREATE TABLE tags (id TEXT, slug TEXT, label TEXT, category TEXT, sort_order INTEGER, color TEXT);
    CREATE TABLE shops_tags (shop_id TEXT, tag_id TEXT);
    CREATE TABLE shop_links (shop_id TEXT, type TEXT, label TEXT, url TEXT, sort_order INTEGER);
    INSERT INTO shops VALUES
      ('a', '営業中の店', NULL, '東京都港区', 'ramen', NULL, NULL, '2026-11-01', NULL, 35.6, 139.7, '106-0032', 'place-a', 95, 'high'),
      ('b', '閉店した店', 'へいてん', '東京都杉並区', 'udon', '2020-01-01', '2026-09-22 09:08:40', NULL, NULL, 35.7, 139.6, '166-0004', 'place-b', 10, NULL);
    INSERT INTO tags VALUES ('t1', 'shoyu-ramen', '醤油', 'ramen', 10, '#000'), ('t2', 'queue', '行列', NULL, 20, '#111');
    INSERT INTO shops_tags VALUES ('a', 't2'), ('a', 't1');
    INSERT INTO shop_links VALUES ('a', 'twitter', NULL, 'https://x.com/a', 1), ('a', 'official', '公式', 'https://a.example/', 0);
  `);
  return db;
}

const options = { runId: 'run-1', fields: ['name', 'tag'] };
const asJson = (value) => JSON.parse(JSON.stringify(value));

test('a batch carries exactly the public shop fields', () => {
  const batch = asJson(exportBatch(makeDb(), options));
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
  for (const secret of ['place-a', '106-0032', '35.6', '"rate"', '"high"', 'wish']) {
    assert.ok(!text.includes(secret), secret);
  }
});

test('tags and links keep their display order', () => {
  const [shop] = asJson(exportBatch(makeDb(), { ...options, shopIds: ['a'] })).shops;
  assert.deepEqual(shop.tags, ['shoyu-ramen', 'queue']);
  assert.deepEqual(shop.links.map((link) => link.type), ['official', 'twitter']);
  assert.deepEqual(shop.temporaryClosure, { startsOn: '2026-11-01', reopensOn: null });
});

test('dates reach the batch as calendar dates, as the API returns them', () => {
  const closed = exportBatch(makeDb(), { ...options, shopIds: ['b'] }).shops[0];
  assert.equal(closed.closedAt, '2026-09-22');
  assert.equal(closed.openedAt, '2020-01-01');
});

test('the selection options narrow the shops', () => {
  const ids = (extra) => exportBatch(makeDb(), { ...options, ...extra }).shops.map((shop) => shop.id);
  assert.deepEqual(ids({}), ['a', 'b']);
  assert.deepEqual(ids({ shopIds: ['b'] }), ['b']);
  assert.deepEqual(ids({ skipShopIds: new Set(['a']) }), ['b']);
  assert.deepEqual(ids({ batch: batchOf('a') }), batchOf('a') === batchOf('b') ? ['a', 'b'] : ['a']);
});

test('every shop falls in exactly one batch, and a new shop moves no other shop', () => {
  const db = makeDb();
  const batches = (database) =>
    Array.from({ length: BATCH_COUNT }, (_, batch) =>
      exportBatch(database, { ...options, batch }).shops.map((shop) => shop.id),
    );
  const before = batches(db);
  assert.deepEqual(before.flat().sort(), ['a', 'b']);

  db.exec(`INSERT INTO shops (id, name, address, category) VALUES ('c', '新しい店', '東京都', 'ramen')`);
  const after = batches(db);
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
  assert.throws(() => exportBatch(makeDb(), { ...options, fields: ['rate'] }), /Unknown field/);
});

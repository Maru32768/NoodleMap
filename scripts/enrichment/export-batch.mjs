import { createHash } from 'node:crypto';
import { existsSync, readdirSync, readFileSync, realpathSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { parseArgs } from 'node:util';
import { pathToFileURL } from 'node:url';
import { CHECK_FIELDS, todayInJapan } from '../../.claude/skills/shop-research/scripts/validate-results.mjs';

// Changing this reassigns almost every shop, and the results on disk are filed by batch, so it stays fixed.
export const BATCH_COUNT = 36;

export const batchOf = (shopId) => createHash('sha256').update(shopId).digest().readUInt32BE(0) % BATCH_COUNT;

const dirNameOf = (batch) => String(batch).padStart(2, '0');

/**
 * Builds the file that enters the isolated environment. Each SELECT names its columns so that rate,
 * wish_level, coordinates, and everything about meal records and users stay out of the batch.
 */
export function exportBatch(db, { runId, fields, batch = null, shopIds = null, skipShopIds = new Set() }) {
  for (const field of fields) if (!CHECK_FIELDS.includes(field)) throw new Error(`Unknown field: ${field}`);

  const rows = db
    .prepare(
      `SELECT id, name, name_kana, address, category, opened_at, closed_at,
              temporary_closure_starts_on, temporary_closure_reopens_on
       FROM shops ORDER BY id`,
    )
    .all();
  const wanted = shopIds ? new Set(shopIds) : null;
  const selected = rows.filter(
    (row) => (batch === null || batchOf(row.id) === batch) && (!wanted || wanted.has(row.id)) && !skipShopIds.has(row.id),
  );

  const tagsOf = db.prepare(
    `SELECT t.slug FROM shops_tags st JOIN tags t ON t.id = st.tag_id WHERE st.shop_id = ? ORDER BY t.sort_order`,
  );
  const linksOf = db.prepare(`SELECT type, label, url FROM shop_links WHERE shop_id = ? ORDER BY sort_order`);

  return {
    schemaVersion: 1,
    runId,
    fields,
    tags: db.prepare('SELECT slug, label, category FROM tags ORDER BY sort_order').all(),
    shops: selected.map((row) => ({
      id: row.id,
      name: row.name,
      nameKana: row.name_kana,
      address: row.address,
      category: row.category,
      // Calendar dates, as the API returns them: the review screen compares these with production.
      openedAt: row.opened_at?.slice(0, 10) ?? null,
      closedAt: row.closed_at?.slice(0, 10) ?? null,
      temporaryClosure: row.temporary_closure_starts_on
        ? { startsOn: row.temporary_closure_starts_on, reopensOn: row.temporary_closure_reopens_on }
        : null,
      tags: tagsOf.all(row.id).map((tag) => tag.slug),
      links: linksOf.all(row.id),
    })),
  };
}

export function batchProgress(shopIds, researchedIn) {
  const progress = Array.from({ length: BATCH_COUNT }, (_, batch) => ({ batch, shops: 0, researched: 0 }));
  for (const id of shopIds) {
    const entry = progress[batchOf(id)];
    entry.shops += 1;
    if (researchedIn(entry.batch).has(id)) entry.researched += 1;
  }
  return progress;
}

function researchedShopIds(dir) {
  if (!existsSync(dir)) return new Set();
  return new Set(
    readdirSync(dir)
      .filter((name) => name.endsWith('.json'))
      .map((name) => name.slice(0, -'.json'.length)),
  );
}

function parseBatchNumber(raw) {
  const batch = Number(raw);
  if (!Number.isInteger(batch) || batch < 0 || batch >= BATCH_COUNT) {
    throw new Error(`--batch must be an integer from 0 to ${BATCH_COUNT - 1}`);
  }
  return batch;
}

function printProgress(db, resultsRoot) {
  const ids = db.prepare('SELECT id FROM shops').all().map((row) => row.id);
  const researchedByBatch = Array.from({ length: BATCH_COUNT }, (_, batch) =>
    researchedShopIds(join(resultsRoot, dirNameOf(batch))),
  );
  for (const { batch, shops, researched } of batchProgress(ids, (batch) => researchedByBatch[batch])) {
    console.log(`batch=${dirNameOf(batch)} shops=${shops} researched=${researched} remaining=${shops - researched}`);
  }
}

function main() {
  const { values } = parseArgs({
    options: {
      db: { type: 'string' },
      out: { type: 'string' },
      'run-id': { type: 'string' },
      fields: { type: 'string', default: CHECK_FIELDS.join(',') },
      batch: { type: 'string' },
      'shop-ids': { type: 'string' },
      'skip-researched': { type: 'string' },
      progress: { type: 'string' },
    },
  });
  if (values.db && values.progress) {
    const db = new DatabaseSync(values.db, { readOnly: true });
    printProgress(db, values.progress);
    db.close();
    return;
  }
  // A selection is required so that a forgotten option cannot start research on every shop.
  if (!values.db || !values.out || (values.batch === undefined && !values['shop-ids'])) {
    throw new Error(
      'Usage: export-batch.mjs --db <copy.db> --out <batch.json> (--batch <n> | --shop-ids <file>) [--run-id <id>] [--fields a,b] [--skip-researched <results-dir>]\n' +
        '       export-batch.mjs --db <copy.db> --progress <results-root>',
    );
  }
  const batch = values.batch === undefined ? null : parseBatchNumber(values.batch);
  const today = todayInJapan();
  const runId = values['run-id'] ?? (batch === null ? null : `b${dirNameOf(batch)}-${today}`);
  if (!runId) throw new Error('--run-id is required with --shop-ids');

  const db = new DatabaseSync(values.db, { readOnly: true });
  const exported = exportBatch(db, {
    runId,
    fields: values.fields.split(','),
    batch,
    shopIds: values['shop-ids'] ? readFileSync(values['shop-ids'], 'utf8').split(/\s+/).filter(Boolean) : null,
    skipShopIds: values['skip-researched'] ? researchedShopIds(values['skip-researched']) : new Set(),
  });
  db.close();
  writeFileSync(values.out, `${JSON.stringify(exported, null, 2)}\n`);
  console.log(`run=${exported.runId} shops=${exported.shops.length} fields=${exported.fields.length} tags=${exported.tags.length}`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(realpathSync(process.argv[1])).href) {
  main();
}

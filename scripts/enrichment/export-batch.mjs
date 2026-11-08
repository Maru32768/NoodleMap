import { createHash } from 'node:crypto';
import { existsSync, readdirSync, readFileSync, realpathSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { parseArgs } from 'node:util';
import { pathToFileURL } from 'node:url';
import { CHECK_FIELDS, todayInJapan } from '../../.claude/skills/shop-research/scripts/validate-results.mjs';

const PRODUCTION_ORIGIN = 'https://noodle-map.marulabs.dev';

// Changing this reassigns almost every shop, and the results on disk are filed by batch, so it stays fixed.
export const BATCH_COUNT = 36;

export const batchOf = (shopId) => createHash('sha256').update(shopId).digest().readUInt32BE(0) % BATCH_COUNT;

const dirNameOf = (batch) => String(batch).padStart(2, '0');

/** Reads the shops and tags as production serves them to anyone, so no credential is needed. */
export async function fetchCatalog(api) {
  const read = async (name) => {
    const url = new URL(`/api/v1/${name}`, api);
    const response = await fetch(url);
    if (!response.ok) throw new Error(`GET ${url} answered ${response.status}`);
    const list = (await response.json())[name];
    if (!Array.isArray(list)) throw new Error(`GET ${url} returned no ${name} list`);
    return list;
  };
  const [shops, tags] = await Promise.all([read('shops'), read('tags')]);
  return { shops, tags };
}

const bySortOrder = (a, b) => a.sortOrder - b.sortOrder;

/**
 * Builds the file that enters the isolated environment. The API also serves rate, wishLevel, and
 * coordinates, so each field is picked by name to keep the research from seeing them.
 */
export function exportBatch(catalog, { runId, fields, batch = null, shopIds = null, skipShopIds = new Set() }) {
  for (const field of fields) if (!CHECK_FIELDS.includes(field)) throw new Error(`Unknown field: ${field}`);

  const wanted = shopIds ? new Set(shopIds) : null;
  const selected = catalog.shops
    .filter((shop) => (batch === null || batchOf(shop.id) === batch) && (!wanted || wanted.has(shop.id)) && !skipShopIds.has(shop.id))
    .sort((a, b) => (a.id < b.id ? -1 : 1));

  return {
    schemaVersion: 1,
    runId,
    fields,
    tags: catalog.tags.toSorted(bySortOrder).map((tag) => ({ slug: tag.slug, label: tag.label, category: tag.category ?? null })),
    shops: selected.map((shop) => ({
      id: shop.id,
      name: shop.name,
      nameKana: shop.nameKana ?? null,
      address: shop.address,
      category: shop.category,
      openedAt: shop.openedAt ?? null,
      closedAt: shop.closedAt ?? null,
      temporaryClosure: shop.temporaryClosure
        ? { startsOn: shop.temporaryClosure.startsOn, reopensOn: shop.temporaryClosure.reopensOn ?? null }
        : null,
      businessHours: shop.businessHours ?? null,
      tags: shop.tags.toSorted(bySortOrder).map((tag) => tag.slug),
      links: shop.links.map((link) => ({ type: link.type, label: link.label ?? null, url: link.url })),
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

function printProgress(shops, resultsRoot) {
  const ids = shops.map((shop) => shop.id);
  const researchedByBatch = Array.from({ length: BATCH_COUNT }, (_, batch) =>
    researchedShopIds(join(resultsRoot, dirNameOf(batch))),
  );
  for (const { batch, shops, researched } of batchProgress(ids, (batch) => researchedByBatch[batch])) {
    console.log(`batch=${dirNameOf(batch)} shops=${shops} researched=${researched} remaining=${shops - researched}`);
  }
}

async function main() {
  const { values } = parseArgs({
    options: {
      api: { type: 'string', default: PRODUCTION_ORIGIN },
      out: { type: 'string' },
      'run-id': { type: 'string' },
      fields: { type: 'string', default: CHECK_FIELDS.join(',') },
      batch: { type: 'string' },
      'shop-ids': { type: 'string' },
      'skip-researched': { type: 'string' },
      progress: { type: 'string' },
    },
  });
  if (values.progress) {
    const { shops } = await fetchCatalog(values.api);
    printProgress(shops, values.progress);
    return;
  }
  // A selection is required so that a forgotten option cannot start research on every shop.
  if (!values.out || (values.batch === undefined && !values['shop-ids'])) {
    throw new Error(
      'Usage: export-batch.mjs --out <batch.json> (--batch <n> | --shop-ids <file>) [--run-id <id>] [--fields a,b] [--skip-researched <results-dir>] [--api <origin>]\n' +
        '       export-batch.mjs --progress <results-root> [--api <origin>]',
    );
  }
  const batch = values.batch === undefined ? null : parseBatchNumber(values.batch);
  const today = todayInJapan();
  const runId = values['run-id'] ?? (batch === null ? null : `b${dirNameOf(batch)}-${today}`);
  if (!runId) throw new Error('--run-id is required with --shop-ids');

  const exported = exportBatch(await fetchCatalog(values.api), {
    runId,
    fields: values.fields.split(','),
    batch,
    shopIds: values['shop-ids'] ? readFileSync(values['shop-ids'], 'utf8').split(/\s+/).filter(Boolean) : null,
    skipShopIds: values['skip-researched'] ? researchedShopIds(values['skip-researched']) : new Set(),
  });
  writeFileSync(values.out, `${JSON.stringify(exported, null, 2)}\n`);
  console.log(`run=${exported.runId} shops=${exported.shops.length} fields=${exported.fields.length} tags=${exported.tags.length}`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(realpathSync(process.argv[1])).href) {
  await main();
}

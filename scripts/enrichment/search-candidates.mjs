import { readFileSync, realpathSync, writeFileSync } from 'node:fs';
import { setTimeout as sleep } from 'node:timers/promises';
import { parseArgs } from 'node:util';
import { pathToFileURL } from 'node:url';
import { canonicalLinkUrl, onAnyDomain, parseBatch } from '../../.claude/skills/shop-research/scripts/validate-results.mjs';

const ENDPOINT = 'https://api.search.brave.com/res/v1/web/search';
const PER_PAGE = 20;
const MAX_PER_KIND = 5;
const SNS_TYPES = ['twitter', 'instagram', 'facebook'];

// Never a shop's own site, on top of what the validator already refuses as official: blogs, media, and directories.
// shortcut: collected from batch 0's results; add a domain when it keeps crowding out real sites.
const NOT_A_SHOP_SITE = [
  'yahoo.co.jp', 'note.com', 'ameblo.jp', 'hatenablog.com', 'hatenablog.jp', 'hatena.ne.jp', 'livedoor.jp',
  'livedoor.blog', 'fc2.com', 'seesaa.net', 'exblog.jp', 'jugem.jp', 'ldblog.jp', 'blog.jp', 'wikipedia.org',
  'timeout.com', 'hamoni.jp', 'foodle.pro', 'autoreserve.com', 'tripadvisor.com', 'tripadvisor.jp', 'rakuten.co.jp',
  'ikyu.com', 'navitime.co.jp', 'mapion.co.jp', 'jorudan.co.jp', 'ekiten.jp', 'goo.ne.jp', 'ramenwalker.jp',
  'ramendays.jp', 'favy.jp', 'wanderlog.com', 'sarahna.jp', 'ubereats.com', 'demae-can.com', 'menu.inc',
  'walkerplus.com', 'byfood.com', 'savorjapan.com', 'amazon.co.jp', 'matcha-jp.com', 'cookbiz.co.jp',
  'hatalike.jp', 'apple.com', 'bing.com',
];

/** The city, ward of Tokyo, or district of an address, which narrows a search to the shop's area. */
export function areaOf(address) {
  const match = /^(?:東京都|北海道|京都府|大阪府|.{2,3}県)(.+?[市区郡町村])/.exec(address.normalize('NFKC'));
  return match ? match[1].replace(/^(.+?市).+区$/, '$1') : '';
}

/**
 * A page path survives only when it is short ASCII, since every candidate reaches the agent that holds
 * the Write tool; anything else is cut back to the site's top page.
 */
function officialCandidate(raw) {
  const canonical = canonicalLinkUrl('official', raw);
  if (!canonical) return null;
  const url = new URL(canonical);
  if (onAnyDomain(url.hostname, NOT_A_SHOP_SITE)) return null;
  const plainPath = /^[A-Za-z0-9/._-]{0,80}$/.test(url.pathname) && !url.search;
  return plainPath ? `${url.origin}${url.pathname}` : `${url.origin}/`;
}

/** Turns result URLs, best first, into candidates: only canonical URLs, never a page's title or text. */
export function candidatesFrom(urls) {
  const candidates = { official: [], twitter: [], instagram: [], facebook: [] };
  const officialHosts = new Set();
  for (const raw of urls) {
    const type = SNS_TYPES.find((kind) => canonicalLinkUrl(kind, raw));
    if (type) {
      const url = canonicalLinkUrl(type, raw);
      const list = candidates[type];
      if (list.length < MAX_PER_KIND && !list.some((seen) => seen.toLowerCase() === url.toLowerCase())) list.push(url);
      continue;
    }
    const url = officialCandidate(raw);
    if (!url) continue;
    const host = new URL(url).hostname;
    if (candidates.official.length < MAX_PER_KIND && !officialHosts.has(host)) {
      officialHosts.add(host);
      candidates.official.push(url);
    }
  }
  return candidates;
}

export function braveSearch(key, fetchImpl = fetch) {
  return async (query, page) => {
    const url = new URL(ENDPOINT);
    url.search = new URLSearchParams({
      q: query,
      count: String(PER_PAGE),
      offset: String(page),
      country: 'JP',
      search_lang: 'jp',
      ui_lang: 'ja-JP',
    });
    // No retry: calls are already a second apart, and a rerun continues from the last saved shop.
    const response = await fetchImpl(url, { headers: { Accept: 'application/json', 'X-Subscription-Token': key } });
    if (!response.ok) throw new Error(`Brave Search answered ${response.status} for page ${page} of a query`);
    const body = await response.json();
    return { urls: (body.web?.results ?? []).map((result) => result.url), more: body.query?.more_results_available === true };
  };
}

/**
 * Two pages for the name and area, where batch 0's official sites ranked first or second and its accounts
 * within 40. An account search without the area follows only when that finds none, because it also
 * finds other shops with the same name.
 */
export async function searchShop(shop, search, pause = () => sleep(1100)) {
  const urls = [];
  const query = `${shop.name} ${areaOf(shop.address)}`.trim();
  for (let page = 0; page < 2; page++) {
    const { urls: found, more } = await search(query, page);
    await pause();
    urls.push(...found);
    if (!more) break;
  }
  let candidates = candidatesFrom(urls);
  if (SNS_TYPES.every((type) => candidates[type].length === 0)) {
    const { urls: found } = await search(`${shop.name} instagram`, 0);
    await pause();
    candidates = candidatesFrom([...urls, ...found]);
  }
  return candidates;
}

/** Adds candidates to every shop that has none yet, saving after each shop so that a rerun continues. */
export async function addCandidates(batch, search, save, pause) {
  let searched = 0;
  for (const shop of batch.shops) {
    if (shop.candidates) continue;
    shop.candidates = await searchShop(shop, search, pause);
    searched += 1;
    save(batch);
  }
  return searched;
}

async function main() {
  const { values } = parseArgs({ options: { batch: { type: 'string' }, out: { type: 'string' } } });
  if (!values.batch || !values.out) throw new Error('Usage: search-candidates.mjs --batch <batch.json> --out <batch.json>');
  const key = process.env.BRAVE_SEARCH_API_KEY;
  if (!key) throw new Error('BRAVE_SEARCH_API_KEY is not set');
  const batch = parseBatch(readFileSync(values.batch, 'utf8'));
  const save = (value) => writeFileSync(values.out, `${JSON.stringify(value, null, 2)}\n`);
  const searched = await addCandidates(batch, braveSearch(key), save);
  save(batch);
  const count = (type) => batch.shops.filter((shop) => shop.candidates[type].length > 0).length;
  console.log(
    `shops=${batch.shops.length} searched=${searched} official=${count('official')} twitter=${count('twitter')} instagram=${count('instagram')} facebook=${count('facebook')}`,
  );
}

if (process.argv[1] && import.meta.url === pathToFileURL(realpathSync(process.argv[1])).href) {
  await main();
}

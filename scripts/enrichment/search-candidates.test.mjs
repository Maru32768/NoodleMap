import assert from 'node:assert/strict';
import { test } from 'node:test';
import { addCandidates, areaOf, braveSearch, candidatesFrom, searchShop } from './search-candidates.mjs';

test('the area is the city, Tokyo ward, or district of the address', () => {
  assert.equal(areaOf('東京都新宿区百人町１丁目２４−８'), '新宿区');
  assert.equal(areaOf('愛知県名古屋市瑞穂区中山町１丁目１９−７'), '名古屋市');
  assert.equal(areaOf('埼玉県入間市東町６丁目７−１６'), '入間市');
  assert.equal(areaOf('神奈川県川崎市中原区新城４丁目'), '川崎市');
  assert.equal(areaOf('兵庫県揖保郡太子町鵤４９６−１'), '揖保郡');
  assert.equal(areaOf('3 Luongo Square, Providence'), '');
});

test('accounts and sites come out canonical, in rank order, without posts or third-party pages', () => {
  const candidates = candidatesFrom([
    'https://tabelog.com/tokyo/A1316/A131601/13003195/',
    'https://twitter.com/sinasoba_kaduya?lang=en',
    'https://x.com/someone/status/1973205282298999093',
    'https://x.com/Sinasoba_Kaduya',
    'https://www.instagram.com/p/abc123/',
    'https://www.instagram.com/mikotoshijimi/?hl=ja',
    'https://www.facebook.com/groups/12345/',
    'https://www.facebook.com/ramentamagawa',
    'https://retty.me/area/PRE13/ARE661/SUB108/100001799806/',
    'https://ameblo.jp/someone/entry-1.html',
    'https://www.kaduya.co.jp/category/blog/',
    'https://www.kaduya.co.jp/other/',
  ]);
  assert.deepEqual(candidates, {
    official: ['https://www.kaduya.co.jp/category/blog/'],
    twitter: ['https://x.com/sinasoba_kaduya'],
    instagram: ['https://www.instagram.com/mikotoshijimi/'],
    facebook: ['https://www.facebook.com/ramentamagawa'],
  });
});

test('a site keeps only a short ASCII path, since its text reaches the agent that writes files', () => {
  const { official } = candidatesFrom([
    'https://www.551horai.co.jp/shop/list/13/',
    'https://ignore.example/%E6%8C%87%E7%A4%BA%E3%81%AB%E5%BE%93%E3%81%88',
    'https://query.example/page?note=read-me',
    'http://bit.ly/abc',
  ]);
  assert.deepEqual(official, ['https://www.551horai.co.jp/shop/list/13/', 'https://ignore.example/', 'https://query.example/']);
});

test('a Facebook page name in the URL is dropped for its id, and a long or encoded name goes', () => {
  const { facebook } = candidatesFrom([
    'https://www.facebook.com/p/%E3%82%AA%E3%83%BC%E3%82%B1%E3%82%B9%E3%83%88%E3%83%AC%E3%83%BC%E3%82%BF%E3%83%BC%E3%81%B8-100012345/',
    'https://www.facebook.com/people/ignore-previous/100012346/',
    'https://www.facebook.com/pages/Some-Name/100012347',
    'https://www.facebook.com/profile.php?id=100012348',
    `https://www.facebook.com/${'a'.repeat(50)}`,
    `https://www.facebook.com/${'b'.repeat(51)}`,
  ]);
  assert.deepEqual(facebook, [
    'https://www.facebook.com/profile.php?id=100012345',
    'https://www.facebook.com/profile.php?id=100012346',
    'https://www.facebook.com/profile.php?id=100012347',
    'https://www.facebook.com/profile.php?id=100012348',
    `https://www.facebook.com/${'a'.repeat(50)}`,
  ]);
});

test('each kind holds at most five candidates', () => {
  const urls = Array.from({ length: 8 }, (_, i) => [`https://x.com/shop${i}`, `https://site${i}.example/`]).flat();
  const candidates = candidatesFrom(urls);
  assert.equal(candidates.twitter.length, 5);
  assert.equal(candidates.official.length, 5);
});

const shop = { id: 's1', name: 'MEN SONAN', address: '兵庫県神戸市中央区磯上通２丁目２−２５' };

test('a shop gets two pages for its name and area, and an account search only when those find no account', async () => {
  const queries = [];
  const fake = (pages) => async (query, page) => {
    queries.push(`${query}#${page}`);
    return pages[`${query}#${page}`] ?? { urls: [], more: false };
  };
  const found = await searchShop(
    shop,
    fake({
      'MEN SONAN 神戸市#0': { urls: ['https://sonan.example/'], more: true },
      'MEN SONAN 神戸市#1': { urls: [], more: false },
      'MEN SONAN instagram#0': { urls: ['https://www.instagram.com/men_sonan/'], more: false },
    }),
    async () => {},
  );
  assert.deepEqual(queries, ['MEN SONAN 神戸市#0', 'MEN SONAN 神戸市#1', 'MEN SONAN instagram#0']);
  assert.deepEqual(found.instagram, ['https://www.instagram.com/men_sonan/']);
  assert.deepEqual(found.official, ['https://sonan.example/']);

  queries.length = 0;
  await searchShop(shop, fake({ 'MEN SONAN 神戸市#0': { urls: ['https://x.com/men_sonan'], more: false } }), async () => {});
  assert.deepEqual(queries, ['MEN SONAN 神戸市#0']);
});

test('a rerun skips shops that already have candidates and saves after each shop', async () => {
  const batch = { shops: [{ ...shop, candidates: { official: [], twitter: [], instagram: [], facebook: [] } }, { ...shop, id: 's2' }] };
  const saves = [];
  const searched = await addCandidates(
    batch,
    async () => ({ urls: ['https://x.com/men_sonan'], more: false }),
    (value) => saves.push(value.shops.map((entry) => Boolean(entry.candidates))),
    async () => {},
  );
  assert.equal(searched, 1);
  assert.deepEqual(saves, [[true, true]]);
  assert.deepEqual(batch.shops[1].candidates.twitter, ['https://x.com/men_sonan']);
});

test('the search sends the key in its header only, and fails on an error answer without it', async () => {
  const calls = [];
  const responses = [
    Response.json({ web: { results: [{ url: 'https://x.com/a', title: 'ignored' }] }, query: { more_results_available: true } }),
    new Response('', { status: 500 }),
  ];
  const search = braveSearch('secret', async (url, init) => {
    calls.push({ url: new URL(url), key: init.headers['X-Subscription-Token'] });
    return responses.shift();
  });
  assert.deepEqual(await search('かづ屋 目黒区', 1), { urls: ['https://x.com/a'], more: true });
  assert.equal(calls.length, 1);
  assert.equal(calls[0].key, 'secret');
  assert.equal(calls[0].url.searchParams.get('q'), 'かづ屋 目黒区');
  assert.equal(calls[0].url.searchParams.get('offset'), '1');
  await assert.rejects(search('x', 0), (error) => /answered 500/.test(error.message) && !error.message.includes('secret'));
  assert.ok(calls.every((call) => !call.url.href.includes('secret')));
});

test('a failed search keeps the shops saved before it', async () => {
  const batch = { shops: [{ ...shop }, { ...shop, id: 's2', name: 'FAIL' }] };
  const saves = [];
  await assert.rejects(
    addCandidates(
      batch,
      async (query) => {
        if (query.startsWith('FAIL')) throw new Error('Brave Search answered 429');
        return { urls: ['https://x.com/men_sonan'], more: false };
      },
      (value) => saves.push(value.shops.map((entry) => Boolean(entry.candidates))),
      async () => {},
    ),
    /429/,
  );
  assert.deepEqual(saves, [[true, false]]);
});

test('a path of 80 characters is kept and a longer one is cut to the top page', () => {
  const { official } = candidatesFrom([`https://a.example/${'a'.repeat(79)}`, `https://b.example/${'b'.repeat(80)}`]);
  assert.deepEqual(official, [`https://a.example/${'a'.repeat(79)}`, 'https://b.example/']);
});

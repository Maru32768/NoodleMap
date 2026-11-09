import assert from "node:assert/strict";
import { after, beforeEach, test } from "node:test";
import { fileURLToPath } from "node:url";
import { Miniflare } from "miniflare";

const PAGE = `<!doctype html><html lang="ja"><head><meta charset="UTF-8"><title>Maru's Noodle Map</title><meta name="description" content="site"><meta property="og:title" content="site"><meta property="og:image" content="/pwa-512.png"><meta name="twitter:card" content="summary"><link rel="icon" href="/favicon.png"></head><body><div id="root"></div></body></html>`;
const META = `<title>麺屋 | NoodleMap</title>\n<meta property="og:title" content="麺屋">\n<meta name="twitter:card" content="summary_large_image">\n`;

let backend;
let backendCalls;
beforeEach(() => {
  backend = () => new Response(META, { headers: { "content-type": "text/html; charset=utf-8" } });
  backendCalls = [];
});

const mf = new Miniflare({
  modules: true,
  scriptPath: fileURLToPath(new URL("./og-worker.js", import.meta.url)),
  bindings: { BACKEND_ORIGIN: "https://backend.test" },
  outboundService(request) {
    const url = new URL(request.url);
    if (url.host !== "backend.test") {
      if (request.headers.get("if-none-match") === '"abc"') return new Response(null, { status: 304 });
      return new Response(PAGE, { headers: { "content-type": "text/html", etag: '"abc"' } });
    }
    backendCalls.push(url.pathname);
    return backend();
  },
});
after(() => mf.dispose());

const get = async (path) => (await mf.dispatchFetch(`https://noodle-map.test${path}`)).text();

test("a shop's search page carries that shop's tags instead of the site's", async () => {
  const html = await get("/search?shop=0f8e5d0c-1111-4222-8333-444455556666&context=x");

  assert.deepEqual(backendCalls, ["/api/v1/og/shops/0f8e5d0c-1111-4222-8333-444455556666"]);
  assert.ok(html.includes(META), html);
  for (const site of ["Maru's Noodle Map", 'content="site"', "/pwa-512.png", 'content="summary"']) {
    assert.ok(!html.includes(site), `${site} left in ${html}`);
  }
  assert.ok(html.includes('<meta charset="UTF-8">'));
  assert.ok(html.includes('<link rel="icon" href="/favicon.png">'));
  assert.ok(html.includes('<div id="root"></div>'));
});

test("pages without a shop pass through without asking the backend", async () => {
  for (const path of ["/search", "/search?shop=", "/admin?shop=abc"]) {
    assert.equal(await get(path), PAGE, path);
  }
  assert.deepEqual(backendCalls, []);
});

test("an unknown shop or a failing backend leaves the page as it is", async () => {
  for (const reply of [
    () => new Response("{}", { status: 404 }),
    () => new Response("boom", { status: 500 }),
    () => Promise.reject(new Error("down")),
  ]) {
    backend = reply;
    assert.equal(await get("/search?shop=x"), PAGE);
  }
});

test("a backend slower than the timeout leaves the page as it is", async () => {
  backend = () => new Promise(() => {});
  const started = Date.now();
  assert.equal(await get("/search?shop=x"), PAGE);
  assert.ok(Date.now() - started < 5000);
});

test("a revalidation still gets the shop's tags, and the page carries no validator of index.html", async () => {
  const res = await mf.dispatchFetch("https://noodle-map.test/search?shop=x", {
    headers: { "if-none-match": '"abc"' },
  });

  assert.equal(res.status, 200);
  assert.equal(res.headers.get("etag"), null);
  assert.ok((await res.text()).includes(META));
});

// Runs on the route `noodle-map.marulabs.dev/search*` (terraform/modules/cloudflare-worker-og).
// Link-preview crawlers do not run the SPA, so `/search?shop=<id>` gets that shop's OGP tags here.

const DEFAULT_TAGS =
  'title, meta[name="description"], meta[property^="og:"], meta[name^="twitter:"], link[rel="canonical"]';
const META_TIMEOUT_MS = 2000;

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const shop = url.searchParams.get("shop");
    if (request.method !== "GET" || url.pathname !== "/search" || !shop) {
      return fetch(request);
    }
    // index.html's validators say nothing about the shop's tags, so a 304 would keep stale ones.
    const headers = new Headers(request.headers);
    headers.delete("if-none-match");
    headers.delete("if-modified-since");
    const [page, meta] = await Promise.all([
      fetch(new Request(request, { headers })),
      shopMeta(env.BACKEND_ORIGIN, shop),
    ]);
    if (meta === null || !page.ok) return page;
    const tagged = new HTMLRewriter()
      .on(DEFAULT_TAGS, { element: (e) => e.remove() })
      .on("head", { element: (e) => e.append(meta, { html: true }) })
      .transform(page);
    const response = new Response(tagged.body, tagged);
    response.headers.delete("etag");
    response.headers.delete("last-modified");
    return response;
  },
};

/** The shop's `<head>` tags, or null when the shop is unknown or the backend is slow or down. */
async function shopMeta(origin, shop) {
  try {
    const res = await fetch(`${origin}/api/v1/og/shops/${encodeURIComponent(shop)}`, {
      signal: AbortSignal.timeout(META_TIMEOUT_MS),
    });
    return res.ok ? await res.text() : null;
  } catch {
    return null;
  }
}

#!/usr/bin/env node
/**
 * indexnow-submit.mjs — ping IndexNow (Bing, Yandex, Seznam, Naver) with the
 * site's LIVE sitemap URLs. Google ignores IndexNow (use Search Console there).
 *
 * Zero dependencies (Node 18+ global fetch). The IndexNow key is PUBLIC —
 * ownership is proven by hosting https://<host>/<key>.txt — so there are NO
 * secrets in this script or in the CI that runs it.
 *
 * The submit list is built from the LIVE sitemap (what is actually deployed),
 * not the local repo file, and every URL is re-checked for HTTP 200 before
 * submission, so stale/draft URLs are never pushed to search engines.
 *
 * Config (env):
 *   INDEXNOW_HOST      apex host, e.g. "colone.online"                  (required)
 *   INDEXNOW_KEY       32-char key, matches https://<host>/<key>.txt    (required)
 *   INDEXNOW_SITEMAP   sitemap URL (default https://<host>/sitemap.xml);
 *                      a <sitemapindex> is followed into its child sitemaps
 *   INDEXNOW_VERIFY    "0" to skip the live 200-check (default: verify)
 *   INDEXNOW_DRY_RUN   "1" to print the payload and NOT POST
 *
 * Usage:
 *   INDEXNOW_HOST=colone.online INDEXNOW_KEY=xxxx node scripts/indexnow-submit.mjs
 */

const HOST = (process.env.INDEXNOW_HOST || "").trim();
const KEY = (process.env.INDEXNOW_KEY || "").trim();
const SITEMAP = (process.env.INDEXNOW_SITEMAP || (HOST && `https://${HOST}/sitemap.xml`)).trim();
const VERIFY = process.env.INDEXNOW_VERIFY !== "0";
const DRY_RUN = process.env.INDEXNOW_DRY_RUN === "1";
const ENDPOINT = "https://api.indexnow.org/indexnow";
const UA = "indexnow-submit/1.0 (+https://www.indexnow.org/)";

if (!HOST || !KEY) {
  console.error("ERROR: INDEXNOW_HOST and INDEXNOW_KEY are required.");
  process.exit(2);
}

const locs = (xml) => [...xml.matchAll(/<loc>\s*([^<\s]+)\s*<\/loc>/g)].map((m) => m[1]);

async function fetchText(url) {
  const res = await fetch(url, { headers: { "user-agent": UA } });
  if (!res.ok) throw new Error(`GET ${url} -> HTTP ${res.status}`);
  return res.text();
}

// Collect all page URLs, following <sitemapindex> entries (one or more levels).
async function collectUrls(sitemapUrl, seen = new Set()) {
  if (seen.has(sitemapUrl)) return [];
  seen.add(sitemapUrl);
  const xml = await fetchText(sitemapUrl);
  const found = locs(xml);
  if (/<sitemapindex[\s>]/i.test(xml)) {
    const nested = [];
    for (const child of found) nested.push(...(await collectUrls(child, seen)));
    return nested;
  }
  return found;
}

async function isLive(url) {
  try {
    let res = await fetch(url, { method: "HEAD", headers: { "user-agent": UA }, redirect: "follow" });
    if (res.status === 405 || res.status === 501) {
      res = await fetch(url, { method: "GET", headers: { "user-agent": UA }, redirect: "follow" });
    }
    return res.status >= 200 && res.status < 300;
  } catch {
    return false;
  }
}

// Tiny concurrency limiter so verification of many URLs stays polite + fast.
async function mapLimit(items, limit, fn) {
  const out = new Array(items.length);
  let i = 0;
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (i < items.length) {
      const idx = i++;
      out[idx] = await fn(items[idx], idx);
    }
  });
  await Promise.all(workers);
  return out;
}

(async () => {
  console.log(`IndexNow: host=${HOST} sitemap=${SITEMAP} verify=${VERIFY} dryRun=${DRY_RUN}`);

  let urls = [...new Set(await collectUrls(SITEMAP))].filter((u) => {
    try {
      return new URL(u).host === HOST;
    } catch {
      return false;
    }
  });

  if (!urls.length) {
    console.error("ERROR: no URLs found in sitemap.");
    process.exit(1);
  }
  console.log(`Found ${urls.length} sitemap URL(s) on ${HOST}.`);

  if (VERIFY) {
    const checks = await mapLimit(urls, 8, async (u) => [u, await isLive(u)]);
    const dead = checks.filter(([, ok]) => !ok).map(([u]) => u);
    if (dead.length) console.warn(`Skipping ${dead.length} non-200 URL(s):\n  ${dead.join("\n  ")}`);
    urls = checks.filter(([, ok]) => ok).map(([u]) => u);
  }

  if (!urls.length) {
    console.error("ERROR: no live URLs to submit.");
    process.exit(1);
  }

  const payload = {
    host: HOST,
    key: KEY,
    keyLocation: `https://${HOST}/${KEY}.txt`,
    urlList: urls.slice(0, 10000), // IndexNow caps a batch at 10k URLs
  };

  console.log(`Submitting ${payload.urlList.length} URL(s):`);
  for (const u of payload.urlList) console.log(`  ${u}`);

  if (DRY_RUN) {
    console.log("DRY RUN — not posting.");
    return;
  }

  const res = await fetch(ENDPOINT, {
    method: "POST",
    headers: { "content-type": "application/json; charset=utf-8", "user-agent": UA },
    body: JSON.stringify(payload),
  });
  const body = await res.text();
  console.log(`IndexNow responded HTTP ${res.status}${body ? ` — ${body}` : ""}`);
  if (res.status !== 200 && res.status !== 202) process.exit(1); // 200 OK / 202 Accepted = success
})().catch((err) => {
  console.error("FATAL:", err.message);
  process.exit(1);
});

#!/usr/bin/env node
/**
 * gsc-sitemap-submit.mjs — resubmit sitemaps to Google Search Console via the
 * Webmasters API (same effect as clicking "resubmit" in the GSC UI: queues a
 * re-read by Googlebot).
 *
 * Zero dependencies (Node 18+: global fetch + node:crypto for RS256 JWT).
 *
 * Config (env):
 *   GSC_SA_KEY    full JSON of a Google Cloud service-account key. The SA's
 *                 email must be added as a user on the GSC property.
 *                 Required: if unset the script exits 2, because a run that
 *                 quietly did nothing is worse than a red one.
 *   GSC_SITE      GSC property, e.g. "sc-domain:finopsllm.com" (domain
 *                 property) or "https://finopsllm.com/" (URL-prefix property)
 *   GSC_SITEMAPS  comma-separated full sitemap URLs to resubmit
 *
 * Usage:
 *   GSC_SA_KEY="$(cat sa.json)" GSC_SITE=sc-domain:finopsllm.com \
 *   GSC_SITEMAPS=https://finopsllm.com/sitemap-index.xml node scripts/gsc-sitemap-submit.mjs
 */

import { createSign } from "node:crypto";
import { readFileSync } from "node:fs";

// GSC_SA_KEY_FILE is the local convenience path (see ~/projects/ai/llm-cfo/.env);
// CI sets GSC_SA_KEY inline.
const SA_KEY = (
  process.env.GSC_SA_KEY ||
  (process.env.GSC_SA_KEY_FILE ? readFileSync(process.env.GSC_SA_KEY_FILE, "utf8") : "")
).trim();
const SITE = (process.env.GSC_SITE || "").trim();
const SITEMAPS = (process.env.GSC_SITEMAPS || "")
  .split(",")
  .map((s) => s.trim())
  .filter(Boolean);

if (!SA_KEY) {
  // Deliberately fatal. This used to exit 0 so CI would stay green before the
  // secret existed, and the cost was seven weeks of green runs that silently
  // resubmitted nothing — indistinguishable from a working integration. A
  // missing credential is a broken integration; say so.
  console.error(
    "ERROR: GSC_SA_KEY is not set — the Google sitemap resubmit did NOT run.\n" +
      "  Local: export GSC_SA_KEY_FILE=~/projects/ai/llm-cfo/.secrets/gsc-sa.json\n" +
      "  CI:    gh secret set GSC_SA_KEY --repo lisn0/tidal --body-file < sa.json\n" +
      "  The service account's email must also be a user on the GSC property.",
  );
  process.exit(2);
}
if (!SITE || !SITEMAPS.length) {
  console.error("ERROR: GSC_SITE and GSC_SITEMAPS are required.");
  process.exit(2);
}

const sa = JSON.parse(SA_KEY);
const b64u = (b) => Buffer.from(b).toString("base64url");

async function accessToken() {
  const now = Math.floor(Date.now() / 1000);
  const unsigned =
    b64u(JSON.stringify({ alg: "RS256", typ: "JWT" })) +
    "." +
    b64u(
      JSON.stringify({
        iss: sa.client_email,
        scope: "https://www.googleapis.com/auth/webmasters",
        aud: "https://oauth2.googleapis.com/token",
        iat: now,
        exp: now + 3600,
      }),
    );
  const sig = createSign("RSA-SHA256").update(unsigned).sign(sa.private_key);
  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
      assertion: `${unsigned}.${b64u(sig)}`,
    }),
  });
  const body = await res.json();
  if (!res.ok) throw new Error(`token exchange HTTP ${res.status}: ${JSON.stringify(body)}`);
  return body.access_token;
}

(async () => {
  const token = await accessToken();
  let failed = 0;
  for (const sm of SITEMAPS) {
    const url = `https://www.googleapis.com/webmasters/v3/sites/${encodeURIComponent(
      SITE,
    )}/sitemaps/${encodeURIComponent(sm)}`;
    const res = await fetch(url, {
      method: "PUT",
      headers: { authorization: `Bearer ${token}` },
    });
    if (res.ok) {
      console.log(`OK   ${sm}`);
    } else {
      failed++;
      console.error(`FAIL ${sm} -> HTTP ${res.status} ${await res.text()}`);
      if (res.status === 403)
        console.error(
          `  hint: is ${sa.client_email} added as a user on "${SITE}"? ` +
            `If the property is URL-prefix (not domain), set GSC_SITE=https://<host>/`,
        );
    }
  }
  process.exit(failed ? 1 : 0);
})().catch((err) => {
  console.error("FATAL:", err.message);
  process.exit(1);
});

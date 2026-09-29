/**
 * Refreshes src/_data/releases.json, the dated snapshot the release tracker page
 * server-renders. The page ships this file so the table is in the HTML for
 * crawlers and readers with JS off; /api/releases is the live overlay on top.
 *
 * The filter is imported from the worker, not reimplemented, so the snapshot and
 * the live endpoint can never disagree about which models count.
 *
 * Run: npm run fetch-releases   (or: node scripts/fetch-releases.mjs)
 */
import { writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

import { buildReleases } from '../src/worker.js';

const OUT = join(dirname(fileURLToPath(import.meta.url)), '..', 'src', '_data', 'releases.json');
const SOURCE = 'https://openrouter.ai/api/v1/models';

// Same guard the worker applies: a truncated or reshaped feed must not overwrite
// a good snapshot with a thin one.
const MIN_ROWS = 100;

const res = await fetch(SOURCE, { headers: { 'User-Agent': 'llmcfo-release-bot' } });
if (!res.ok) {
	console.error(`fetch failed: HTTP ${res.status} — snapshot left untouched`);
	process.exit(1);
}

const data = (await res.json()).data;
if (!Array.isArray(data) || data.length < MIN_ROWS) {
	console.error(`feed returned ${Array.isArray(data) ? data.length : 'no'} models, expected >= ${MIN_ROWS} — snapshot left untouched`);
	process.exit(1);
}

const now = Date.now();
const { releases, retirements } = buildReleases(data, now);

// Countdown for the retirement table, stamped at generation so the template does
// no date maths. The page recomputes it on load, so a snapshot that is a few
// days old still counts down correctly for a reader with JS.
const daysLeft = (iso) => Math.round((Date.parse(iso + 'T00:00:00Z') - now) / 864e5);
for (const r of retirements) r.daysLeft = daysLeft(r.expires);

// Lab list for the filter chips, busiest first so the labs a reader actually
// cares about are the ones they do not have to hunt for.
const counts = new Map();
for (const r of [...releases, ...retirements]) counts.set(r.provider, (counts.get(r.provider) || 0) + 1);
const labs = [...counts.keys()].sort((a, b) => counts.get(b) - counts.get(a) || a.localeCompare(b));

const snapshot = {
	updated: new Date(now).toISOString().slice(0, 10),
	source: SOURCE,
	note: 'Dates are the day a model first became purchasable via OpenRouter, not the lab announcement date. in/out are USD per 1M tokens; null means the lab has not published a price.',
	labs,
	releases,
	retirements,
};

await writeFile(OUT, JSON.stringify(snapshot, null, 2) + '\n');
console.log(
	`wrote ${OUT}\n  ${releases.length} releases, ${retirements.length} retirements, ${data.length} models upstream`
);

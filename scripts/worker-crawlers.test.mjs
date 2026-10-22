// Self-check for AI crawler detection. Run: node scripts/worker-crawlers.test.mjs
//
// Worth testing because Analytics Engine fails SILENTLY: if detection breaks,
// the dashboard shows zero AI traffic, which is indistinguishable from a site
// no assistant has ever crawled. That is the one failure mode we cannot see.

import assert from 'node:assert/strict';
import worker, { detectAiCrawler, detectAiReferrer, isTrackedPath } from '../src/worker.js';

// Real user-agent strings, with the classification each must receive.
const CASES = [
	['Mozilla/5.0 AppleWebKit/537.36 (KHTML, like Gecko); compatible; ChatGPT-User/1.0; +https://openai.com/bot', 'ChatGPT-User', 'live'],
	['Mozilla/5.0 AppleWebKit/537.36 (KHTML, like Gecko); compatible; OAI-SearchBot/1.0; +https://openai.com/searchbot', 'OAI-SearchBot', 'search'],
	['Mozilla/5.0 AppleWebKit/537.36 (KHTML, like Gecko); compatible; GPTBot/1.2; +https://openai.com/gptbot', 'GPTBot', 'train'],
	['Mozilla/5.0 (compatible; ClaudeBot/1.0; +claudebot@anthropic.com)', 'ClaudeBot', 'train'],
	['Mozilla/5.0 (compatible; Claude-User/1.0; +Claude-User@anthropic.com)', 'Claude-User', 'live'],
	['Mozilla/5.0 (compatible; PerplexityBot/1.0; +https://perplexity.ai/perplexitybot)', 'PerplexityBot', 'search'],
	['Mozilla/5.0 (compatible; Perplexity-User/1.0; +https://perplexity.ai/perplexity-user)', 'Perplexity-User', 'live'],
	['Mozilla/5.0 (compatible; Google-Extended/1.0)', 'Google-Extended', 'train'],
	['Mozilla/5.0 (compatible; bingbot/2.0; +http://www.bing.com/bingbot.htm)', 'Bingbot', 'search'],
	['meta-externalagent/1.1 (+https://developers.facebook.com/docs/sharing/webmasters/crawler)', 'Meta-ExternalAgent', 'train'],
	['Mozilla/5.0 (compatible; Bytespider; spider-feedback@bytedance.com)', 'Bytespider', 'train'],
	['CCBot/2.0 (https://commoncrawl.org/faq/)', 'CCBot', 'train'],
];

for (const [ua, name, kind] of CASES) {
	const hit = detectAiCrawler(ua);
	assert.ok(hit, `should detect a crawler in: ${ua.slice(0, 60)}`);
	assert.equal(hit.name, name, `wrong crawler for: ${ua.slice(0, 60)}`);
	assert.equal(hit.kind, kind, `wrong kind for ${name}`);
}

// Humans and non-AI bots must NOT be logged — counting a browser as an AI hit
// would silently inflate every number the product reports.
for (const ua of [
	'',
	undefined,
	null,
	'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36',
	'Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)', // classic search, not AI
	'Mozilla/5.0 (compatible; YandexBot/3.0)',
	'facebookexternalhit/1.1',
]) {
	assert.equal(detectAiCrawler(ua), null, `should NOT count as AI crawler: ${String(ua).slice(0, 50)}`);
}

// Ordering guard: 'chatgpt-user' contains 'gpt', and 'claude-user' vs 'claudebot'
// share a prefix. A careless reorder of AI_CRAWLERS silently reclassifies live
// citation traffic as training traffic — the most valuable signal becoming the
// least valuable one, with no error anywhere.
assert.equal(detectAiCrawler('ChatGPT-User/1.0').kind, 'live', 'ChatGPT-User must not fall through to GPTBot');
assert.equal(detectAiCrawler('Claude-User/1.0').kind, 'live', 'Claude-User must not fall through to ClaudeBot');
assert.equal(detectAiCrawler('Perplexity-User/1.0').kind, 'live', 'Perplexity-User must not fall through to PerplexityBot');

// Case-insensitive: real crawlers vary the casing between versions.
assert.equal(detectAiCrawler('GPTBOT/1.0').name, 'GPTBot');
assert.equal(detectAiCrawler('gptbot/1.0').name, 'GPTBot');

console.log(`✅ AI crawler detection: ${CASES.length} crawlers classified, negatives rejected, ordering held`);

// ---------------------------------------------------------------------------
// AI referral detection — the human arriving from an answer.
// Same failure mode as above: silent, and the dashboard would just read zero.
// ---------------------------------------------------------------------------

const REFERRER_CASES = [
	['https://chatgpt.com/', 'ChatGPT'],
	['https://chatgpt.com/?q=llm+cost', 'ChatGPT'],
	['https://chat.openai.com/g/abc', 'ChatGPT'],
	['https://perplexity.ai/search?q=x', 'Perplexity'],
	['https://www.perplexity.ai/', 'Perplexity'],
	['https://claude.ai/chat/xyz', 'Claude'],
	['https://copilot.microsoft.com/', 'Copilot'],
	['https://gemini.google.com/app', 'Gemini'],
	['https://poe.com/s/Claude', 'Poe'],
];

for (const [referer, name] of REFERRER_CASES) {
	const ref = detectAiReferrer(referer);
	assert.ok(ref, `should detect a referrer in: ${referer}`);
	assert.equal(ref.name, name, `wrong surface for: ${referer}`);
}

// The host guard prevents malformed and lookalike domains from matching. A
// valid Referer remains caller-controlled and is only an observed signal.
for (const spoof of [
	'https://chatgpt.com.evil.net/',
	'https://notchatgpt.com/',
	'https://evil.net/?r=chatgpt.com',
	'https://perplexity.ai.evil.net/',
]) {
	assert.equal(detectAiReferrer(spoof), null, `must not count spoofed referer: ${spoof}`);
}

// Ordinary traffic must never register as an AI referral.
for (const plain of [
	'',
	undefined,
	null,
	'not-a-url',
	'https://www.google.com/search?q=llm',
	'https://www.bing.com/search?q=llm',
	'https://openai.com/news/',
	'https://www.anthropic.com/',
	'https://mistral.ai/',
	'https://news.ycombinator.com/',
	'https://llmcfo.com/research/',
]) {
	assert.equal(detectAiReferrer(plain), null, `should NOT count as AI referral: ${String(plain).slice(0, 50)}`);
}

console.log(`✅ AI referral detection: ${REFERRER_CASES.length} surfaces matched, spoofing rejected`);

// ---------------------------------------------------------------------------
// Some ChatGPT links carry ?utm_source=chatgpt.com where a Referer is absent.
// ---------------------------------------------------------------------------

const url = (s) => new URL(s);

for (const [target, name] of [
	['https://llmcfo.com/?utm_source=chatgpt.com', 'ChatGPT'],
	['https://llmcfo.com/?utm_source=grok.com&utm_medium=referral', 'Grok'],
	['https://llmcfo.com/?utm_source=chat.deepseek.com', 'DeepSeek'],
	['https://llmcfo.com/?utm_source=meta.ai', 'Meta AI'],
	['https://llmcfo.com/?utm_source=perplexity.ai', 'Perplexity'],
	['https://llmcfo.com/?utm_source=chatgpt', 'ChatGPT'], // bare label, not a host
	['https://llmcfo.com/?utm_source=https://chatgpt.com/', 'ChatGPT'], // full URL
]) {
	const ref = detectAiReferrer(null, url(target));
	assert.ok(ref, `should detect utm_source in: ${target}`);
	assert.equal(ref.name, name, `wrong surface for: ${target}`);
}

// The Referer still wins when present, and a spoofed utm_source is rejected by
// the same exact-or-subdomain test that guards the header.
assert.equal(
	detectAiReferrer('https://claude.ai/chat/x', url('https://llmcfo.com/?utm_source=chatgpt.com')).name,
	'Claude',
	'Referer must take precedence over utm_source'
);
for (const spoof of [
	'https://llmcfo.com/?utm_source=chatgpt.com.evil.net',
	'https://llmcfo.com/?utm_source=notchatgpt.com',
	'https://llmcfo.com/?utm_source=https://chatgpt.com.evil.net/',
]) {
	assert.equal(
		detectAiReferrer(null, url(spoof)),
		null,
		`must not count spoofed utm_source: ${spoof}`
	);
}

// An unrelated campaign parameter must not be mistaken for a surface.
assert.equal(detectAiReferrer(null, url('https://llmcfo.com/?utm_source=newsletter')), null);
assert.equal(detectAiReferrer(null, url('https://llmcfo.com/?utm_medium=email')), null);

console.log(`✅ utm_source fallback: ${4} new surfaces + label/URL forms, spoofing rejected`);

// ---------------------------------------------------------------------------
// Asset guard — the bug that made every referral number 10-30x too high.
// One click loads a document plus its CSS, JS, fonts and images; all carry the
// same Referer. Only page requests may be counted.
// ---------------------------------------------------------------------------

for (const page of [
	'/',
	'/research/',
	'/research/llm-cost-per-request',
	'/pricing',
	'/index.html',
	// Extensionless is the rule that matters: a dot inside a slug is not a suffix.
	'/research/v1.2-guide',
	'/blog/llm.cost',
	// Exempt from the dotfile rule on purpose: a real API catalog worth counting.
	'/.well-known/api-catalog',
]) {
	assert.equal(isTrackedPath(page), true, `should track page: ${page}`);
}

for (const asset of [
	'/main.css',
	'/app.js',
	'/main.css?v=2',
	'/logo.svg',
	'/hero.avif',
	'/fonts/geist-latin.woff2',
	'/robots.txt',
	'/sitemap.xml',
	'/llms.txt',
	'/favicon.ico',
	'/data/table.json',
	'/main.8f3a.css',
	// Probes. The extension arm cannot catch these, which is why /.env logged
	// 32 hits here before DOTFILE_PATH_RE existed.
	'/.env',
	'/.env.local',
	'/.env.prod',
	'/.git/HEAD',
	'/.htaccess',
	'/research/.env',
]) {
	assert.equal(isTrackedPath(asset), false, `should NOT track asset: ${asset}`);
}

// OpenAI appends an explicit `robots.txt` marker to the crawler UA when
// fetching it, so the .txt path guard must exclude the request.
assert.equal(
	detectAiCrawler('Mozilla/5.0 AppleWebKit/537.36 (KHTML, like Gecko); compatible; OAI-SearchBot/1.4; robots.txt; +https://openai.com/searchbot').name,
	'OAI-SearchBot',
	'robots.txt fetches still identify the crawler — the path guard drops them, not the UA match'
);
assert.equal(
	isTrackedPath('/robots.txt'),
	false,
	'the robots.txt-marked fetch must be excluded by path'
);

console.log('✅ Asset guard: pages tracked, assets + robots.txt dropped');

// A visitor landing on www must produce one observed referral on the final
// apex response, not one event for each redirect hop. Failed page responses do
// not count as visits.
const referralPoints = [];
const referralEnv = {
	AI_HITS: { writeDataPoint: (point) => referralPoints.push(point) },
	ASSETS: {
		fetch: async () => new Response('<html><main>Page</main></html>', {
			status: 200,
			headers: { 'Content-Type': 'text/html; charset=utf-8' },
		}),
	},
};
const wwwRequest = new Request('https://www.llmcfo.com/research/example', {
	headers: { Referer: 'https://chatgpt.com/' },
});
const wwwResponse = await worker.fetch(wwwRequest, referralEnv);
assert.equal(wwwResponse.status, 301, 'www landing redirects to apex');
assert.equal(referralPoints.length, 0, 'redirect response is not counted as a visit');
const finalRequest = new Request(wwwResponse.headers.get('Location'), {
	headers: { Referer: 'https://chatgpt.com/' },
});
const finalResponse = await worker.fetch(finalRequest, referralEnv);
assert.equal(finalResponse.status, 200, 'final page is served');
assert.equal(referralPoints.length, 1, 'one final response yields one referral event');
assert.deepEqual(referralPoints[0].blobs.slice(0, 2), ['ChatGPT', 'referral']);

await worker.fetch(new Request('https://llmcfo.com/research/head', {
	method: 'HEAD',
	headers: { Referer: 'https://chatgpt.com/' },
}), referralEnv);
assert.equal(referralPoints.length, 1, 'HEAD requests are not counted as visits');

const missingEnv = {
	...referralEnv,
	ASSETS: { fetch: async () => new Response('missing', { status: 404 }) },
};
await worker.fetch(new Request('https://llmcfo.com/research/missing', {
	headers: { Referer: 'https://chatgpt.com/' },
}), missingEnv);
assert.equal(referralPoints.length, 1, '404 responses do not add a referral event');
const nonHtmlEnv = {
	...referralEnv,
	ASSETS: { fetch: async () => new Response('{"status":"ok"}', {
		status: 200,
		headers: { 'Content-Type': 'application/json' },
	}) },
};
await worker.fetch(new Request('https://llmcfo.com/research/json', {
	headers: { Referer: 'https://chatgpt.com/' },
}), nonHtmlEnv);
assert.equal(referralPoints.length, 1, 'non-HTML responses are not counted as visits');
console.log('✅ Referral logging: redirect chain counted once on final 200 only');


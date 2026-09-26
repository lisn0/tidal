// Self-check for AI crawler detection. Run: node scripts/worker-crawlers.test.mjs
//
// Worth testing because Analytics Engine fails SILENTLY: if detection breaks,
// the dashboard shows zero AI traffic, which is indistinguishable from a site
// no assistant has ever crawled. That is the one failure mode we cannot see.

import assert from 'node:assert/strict';
import { detectAiCrawler, detectAiReferrer, isTrackedPath } from '../src/worker.js';

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

// The spoofing guard. Anyone can set Referer, so a substring match would let
// any third party inflate the referral count — the single number the product
// is sold on. Only a real hostname match may count.
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
	'https://news.ycombinator.com/',
	'https://llmcfo.com/research/',
]) {
	assert.equal(detectAiReferrer(plain), null, `should NOT count as AI referral: ${String(plain).slice(0, 50)}`);
}

console.log(`✅ AI referral detection: ${REFERRER_CASES.length} surfaces matched, spoofing rejected`);

// ---------------------------------------------------------------------------
// utm_source — the only surviving signal for the largest surface.
// ChatGPT's paid-tier inline links are rel=noreferrer (no Referer at all) and
// its free-tier citations arrive as ?utm_source=chatgpt.com. If this regresses,
// ChatGPT reads zero while actually being the top referrer.
// ---------------------------------------------------------------------------

const url = (s) => new URL(s);

for (const [target, name] of [
	['https://llmcfo.com/?utm_source=chatgpt.com', 'ChatGPT'],
	['https://llmcfo.com/?utm_source=grok.com&utm_medium=referral', 'Grok'],
	['https://llmcfo.com/?utm_source=deepseek.com', 'DeepSeek'],
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
]) {
	assert.equal(isTrackedPath(asset), false, `should NOT track asset: ${asset}`);
}

// robots.txt is the one that matters for correctness: OpenAI appends an
// explicit `robots.txt` marker to the crawler UA when fetching it, so without
// the .txt arm every robots.txt read would count as a citation.
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


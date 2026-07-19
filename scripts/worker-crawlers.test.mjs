// Self-check for AI crawler detection. Run: node scripts/worker-crawlers.test.mjs
//
// Worth testing because Analytics Engine fails SILENTLY: if detection breaks,
// the dashboard shows zero AI traffic, which is indistinguishable from a site
// no assistant has ever crawled. That is the one failure mode we cannot see.

import assert from 'node:assert/strict';
import { detectAiCrawler } from '../src/worker.js';

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

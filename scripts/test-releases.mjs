/**
 * Asserts the /api/releases logic against a fixture, no network and no
 * wrangler. Run: node scripts/test-releases.mjs
 */
import assert from 'node:assert/strict';
import worker from '../src/worker.js';

const DAY = 864e5;
const now = Date.now();
const iso = (ms) => new Date(ms).toISOString().slice(0, 10);

function fixture() {
	return {
		data: [
			// real shapes, in deliberately unsorted order
			{ id: 'openai/gpt-9', created: Math.floor((now - 2 * DAY) / 1000), context_length: 400000, pricing: { prompt: '0.0000015', completion: '0.000006' } },
			{ id: 'anthropic/claude-x', created: Math.floor((now - 1 * DAY) / 1000), context_length: 1000000, pricing: { prompt: '0.000003', completion: '0.000015' } },
			// same model, batch endpoint -> must not appear
			{ id: 'openai/gpt-9:batch', created: Math.floor((now - 2 * DAY) / 1000), pricing: { prompt: '0.0000005', completion: '0.000002' } },
			// quant mirror -> not a lab announcement
			{ id: '~openai/gpt-9-quant', created: Math.floor((now - 2 * DAY) / 1000), pricing: { prompt: '0.000001', completion: '0.000004' } },
			// third-party router -> not a lab announcement
			{ id: 'stealth/space-bunny-alpha', created: Math.floor((now - 1 * DAY) / 1000), pricing: { prompt: '0.000001', completion: '0.000002' } },
			// unpublished price sentinel
			{ id: 'cohere/cmd-free', created: Math.floor((now - 3 * DAY) / 1000), pricing: { prompt: '-1', completion: '-1' } },
			// outside the 45d window
			{ id: 'google/old-model', created: Math.floor((now - 90 * DAY) / 1000), pricing: { prompt: '0.000001', completion: '0.000002' } },
			// created in the future (clock skew) -> must not appear
			{ id: 'meta/llama-next', created: Math.floor((now + 5 * DAY) / 1000), pricing: { prompt: '0.000001', completion: '0.000002' } },
			// retirements
			{ id: 'deepseek/v3-old', created: Math.floor((now - 300 * DAY) / 1000), expiration_date: iso(now + 10 * DAY), pricing: { prompt: '0.00000027', completion: '0.0000011' } },
			{ id: 'deepseek/v1-ancient', created: Math.floor((now - 500 * DAY) / 1000), expiration_date: iso(now - 20 * DAY), pricing: { prompt: '0.0000001', completion: '0.0000005' } },
		],
	};
}

const PAD = { 'content-type': 'text/plain' };
const get = (path, body) => worker.fetch(new Request('https://llmcfo.com' + path, { headers: PAD }), {}, {});

// 1. happy path
const filler = Array.from({ length: 200 }, (_, i) => ({ id: `filler/model-${i}`, created: Math.floor((now - 200 * DAY) / 1000) }));
globalThis.fetch = async () => ({ ok: true, json: async () => ({ data: [...fixture().data, ...filler] }) });

const res = await get('/api/releases');
assert.equal(res.status, 200, 'expected 200 from a well-formed feed');
const body = await res.json();

const ids = body.releases.map((r) => r.id);
assert.deepEqual(ids, ['anthropic/claude-x', 'openai/gpt-9', 'cohere/cmd-free'], `unexpected release set: ${ids}`);
assert.ok(!ids.some((i) => i.includes(':batch')), 'batch endpoint leaked');
assert.ok(!ids.some((i) => i.startsWith('~')), 'quant mirror leaked');
assert.ok(!ids.some((i) => i.startsWith('stealth/')), 'third-party drop leaked');
assert.ok(!ids.includes('google/old-model'), 'out-of-window model leaked');
assert.ok(!ids.includes('meta/llama-next'), 'future-dated model leaked');

// 2. prices are per 1M tokens, not per token
const gpt9 = body.releases.find((r) => r.id === 'openai/gpt-9');
assert.equal(gpt9.in, 1.5, 'input price must be USD per 1M tokens');
assert.equal(gpt9.out, 6, 'output price must be USD per 1M tokens');
assert.equal(gpt9.provider, 'OpenAI');
assert.equal(gpt9.ctx, 400000);

// 3. unpublished price is null, never a number
const free = body.releases.find((r) => r.id === 'cohere/cmd-free');
assert.equal(free.in, null, 'negative sentinel must become null');
assert.equal(free.out, null, 'negative sentinel must become null');

// 4. newest first
assert.ok(body.releases[0].date >= body.releases[1].date, 'releases must be newest first');

// 5. retirements: future only, soonest first
assert.deepEqual(body.retirements.map((r) => r.id), ['deepseek/v3-old'], 'lapsed retirement must be dropped');
assert.equal(body.retirements[0].expires, iso(now + 10 * DAY));
assert.equal(body.retirements[0].in, 0.27);

// 6. payload is self-describing for API consumers
assert.match(body.note, /not the lab announcement date/);
assert.equal(body.source, 'https://openrouter.ai/api/v1/models');

// 7. upstream failure -> 503 with empty lists, never a fake feed
globalThis.fetch = async () => ({ ok: false, json: async () => ({}) });
const down = await get('/api/releases');
assert.equal(down.status, 503);
assert.deepEqual((await down.json()).releases, []);

// 8. truncated/reshaped feed -> 503, not a half-truth
globalThis.fetch = async () => ({ ok: true, json: async () => ({ data: fixture().data }) });
assert.equal((await get('/api/releases')).status, 503, 'small feed must be rejected');

console.log('ok - 8 assertions on /api/releases');

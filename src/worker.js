/**
 * LLM CFO — static-assets Worker with Markdown for Agents.
 *
 * Runs in front of the static assets (assets.run_worker_first = true). For
 * normal browser/crawler traffic it transparently proxies to env.ASSETS. When
 * a client negotiates `Accept: text/markdown` (typically an AI agent), it
 * converts the page's <main> HTML to Markdown at the edge.
 *
 * Free-plan equivalent of Cloudflare's paid "Markdown for Agents". Crucially it
 * preserves the AI-training opt-out (Content-Signal: ai-train=no) rather than
 * Cloudflare's native ai-train=yes default.
 *
 * Also performs the www -> apex redirect here, because Workers static-assets
 * _redirects matches on path only and cannot see the request hostname.
 */

const APEX = 'llmcfo.com';
const DEFAULT_TITLE = 'LLM CFO';
const CONTENT_SIGNAL = 'search=yes, ai-input=yes, ai-train=no';
const CONTACT_TO = 'hello@llmcfo.com';
const CONTACT_FROM = 'noreply@llmcfo.com';
const CONTACT_TOPICS = new Set(['audit', 'telemetry', 'partnership', 'other']);
const CONTACT_MAX_BYTES = 8192;

function contactJson(body, status = 200) {
	return new Response(JSON.stringify(body), {
		status,
		headers: {
			'Content-Type': 'application/json; charset=utf-8',
			'Cache-Control': 'no-store',
			'X-Content-Type-Options': 'nosniff',
			'Access-Control-Allow-Origin': 'https://llmcfo.com',
		},
	});
}

function contactReply(body, status, request) {
	const form = (request.headers.get('Content-Type') || '').toLowerCase().startsWith('application/x-www-form-urlencoded');
	if (!form || !/text\/html/i.test(request.headers.get('Accept') || '')) return contactJson(body, status);
	const message = body.ok
		? 'Message sent. Thank you.'
		: status === 429 ? 'Too many attempts. Please try again later.'
		: 'Message could not be sent. Please check your details or book a call.';
	return new Response(`<!doctype html><html lang="en"><meta charset="utf-8"><title>Contact LLM CFO</title><main><h1>${message}</h1><p><a href="/contact">Back to contact</a> · <a href="/book/schedule">Book a call</a></p></main></html>`, {
		status,
		headers: { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' },
	});
}

function logContactFailure(stage, error, request) {
	const code = typeof error?.code === 'string' && /^[A-Z0-9_]{1,40}$/.test(error.code) ? error.code : 'UNKNOWN';
	const ray = request.headers.get('CF-Ray');
	console.error('contact delivery unavailable', { stage, code, ray: ray && /^[a-zA-Z0-9-]{1,40}$/.test(ray) ? ray : undefined });
}

async function readLimitedBody(request) {
	const reader = request.body?.getReader();
	if (!reader) return '';
	const chunks = [];
	let size = 0;
	while (true) {
		const { done, value } = await reader.read();
		if (done) break;
		size += value.byteLength;
		if (size > CONTACT_MAX_BYTES) {
			await reader.cancel();
			return null;
		}
		chunks.push(value);
	}
	const bytes = new Uint8Array(size);
	let offset = 0;
	for (const chunk of chunks) {
		bytes.set(chunk, offset);
		offset += chunk.byteLength;
	}
	return new TextDecoder('utf-8', { fatal: true }).decode(bytes);
}

function contactField(value, max) {
	return typeof value === 'string' && value.trim().length > 0 && value.trim().length <= max && !/[\r\n\x00-\x1f\x7f]/.test(value);
}

async function contactApi(request, env) {
	if (request.method === 'GET') {
		return contactJson({
			endpoint: '/api/contact',
			method: 'POST',
			contentTypes: ['application/json', 'application/x-www-form-urlencoded'],
			required: ['name', 'email', 'topic', 'message'],
			optional: ['company'],
			topics: [...CONTACT_TOPICS],
			maxBodyBytes: CONTACT_MAX_BYTES,
			humanForm: 'https://llmcfo.com/contact',
		});
	}
	if (request.method !== 'POST') return contactJson({ error: 'method_not_allowed' }, 405);
	const reply = (body, status = 200) => contactReply(body, status, request);
	const origin = request.headers.get('Origin');
	if (origin && origin !== 'https://llmcfo.com') return reply({ error: 'forbidden_origin' }, 403);
	const type = (request.headers.get('Content-Type') || '').split(';')[0].trim().toLowerCase();
	if (type !== 'application/json' && type !== 'application/x-www-form-urlencoded') {
		return reply({ error: 'unsupported_media_type' }, 415);
	}
	const length = Number(request.headers.get('Content-Length'));
	if (Number.isFinite(length) && length > CONTACT_MAX_BYTES) return reply({ error: 'payload_too_large' }, 413);
	if (!env.CONTACT_RATE_LIMIT?.limit) return reply({ error: 'contact_unavailable' }, 503);
	const ip = request.headers.get('CF-Connecting-IP');
	if (!ip) return reply({ error: 'contact_unavailable' }, 503);
	try {
		const { success } = await env.CONTACT_RATE_LIMIT.limit({ key: `contact:${ip}` });
		if (!success) return reply({ error: 'rate_limited' }, 429);
	} catch (error) {
		logContactFailure('rate_limit', error, request);
		return reply({ error: 'contact_unavailable' }, 503);
	}
	let data;
	try {
		const body = await readLimitedBody(request);
		if (body === null) return reply({ error: 'payload_too_large' }, 413);
		data = type === 'application/json' ? JSON.parse(body) : Object.fromEntries(new URLSearchParams(body));
	} catch {
		return reply({ error: 'invalid_body' }, 400);
	}
	if (!data || typeof data !== 'object' || Array.isArray(data)) return reply({ error: 'invalid_body' }, 400);
	if (Object.keys(data).some((key) => !['name', 'email', 'company', 'topic', 'message', 'website'].includes(key)) ||
		(data.website !== undefined && typeof data.website !== 'string')) {
		return reply({ error: 'invalid_fields' }, 400);
	}
	// Honeypot is deliberately quiet so automated submissions learn nothing.
	if (data.website) return reply({ ok: true });
	const { name, email, company = '', topic, message } = data;
	if (!contactField(name, 120) || !contactField(email, 254) || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) ||
		(typeof company !== 'string' || (company && !contactField(company, 120))) ||
		!CONTACT_TOPICS.has(topic) || typeof message !== 'string' || message.trim().length < 10 ||
		message.trim().length > 4000 || /[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]/.test(message)) {
		return reply({ error: 'invalid_fields' }, 400);
	}
	if (!env.EMAIL?.send) return reply({ error: 'contact_unavailable' }, 503);
	try {
		await env.EMAIL.send({
			to: CONTACT_TO,
			from: CONTACT_FROM,
			replyTo: email.trim(),
			subject: `LLM CFO contact: ${topic}`,
			text: `Name: ${name.trim()}\nEmail: ${email.trim()}\nCompany: ${company.trim()}\nTopic: ${topic}\n\n${message.trim()}`,
		});
		return reply({ ok: true });
	} catch (error) {
		logContactFailure('email', error, request);
		return reply({ error: 'contact_unavailable' }, 503);
	}
}

/* ------------------------------------------------------------------ */
/* A/B test: homepage variant (control vs v2 mockup)                  */
/* ------------------------------------------------------------------ */

const AB_COOKIE = 'ab_test';
const AB_PATHS = new Set(['/', '/index.html']);

// UA strings we never experiment on: crawlers, AI agents, preview tools.
const BOT_RE = /bot|crawl|spider|slurp|mediapartners|facebookexternalhit|embedly|quora|pinterest|whatsapp|googlebot|bingbot|duckduckbot|yandex|baidu|applebot|amazonbot|gptbot|claudebot|claude-|oai-searchbot|chatgpt-user|perplexity|mistralai|meta-externalagent|google-extended|preview|lighthouse/i;

// Only real browser UAs get experimented on. Anything unrecognised (curl, a new
// AI crawler not yet in BOT_RE, empty UA) falls through to control.
const BROWSER_RE = /Mozilla\/5\.0 .*(Chrome|Safari|Firefox|Edg|OPR)\//i;

function isBot(request) {
	const ua = request.headers.get('User-Agent') || '';
	return BOT_RE.test(ua) || !BROWSER_RE.test(ua);
}

function abCookieValue(request) {
	const c = request.headers.get('Cookie') || '';
	const m = c.match(new RegExp(`(?:^|;\\s*)${AB_COOKIE}=(control|v2)\\b`));
	return m ? m[1] : null;
}

function pickVariant(request) {
	const existing = abCookieValue(request);
	if (existing) return existing;
	return Math.random() < 0.5 ? 'control' : 'v2';
}

function abTargetUrl(url, variant) {
	if (variant === 'v2') {
		const u = new URL(url.toString());
		u.pathname = '/index-v2.html';
		return u;
	}
	return url;
}

function abCookieHeader(variant) {
	const maxAge = 60 * 60 * 24 * 30; // 30 days
	return `${AB_COOKIE}=${variant}; Max-Age=${maxAge}; Path=/; SameSite=Lax; Secure`;
}

/* ------------------------------------------------------------------ */
/* AI crawler logging (GEO analytics)                                  */
/* ------------------------------------------------------------------ */

// AI crawlers self-identify in the User-Agent — they WANT to be found — so
// detection is a lookup table, not bot-scoring. Cloudflare's botScore is for
// catching bots that lie; it costs money and answers a question we don't have.
//
// `kind` is the part that matters commercially:
//   live  — a human asked the assistant something and it fetched this page NOW.
//           The strongest available evidence of an actual citation.
//   search— indexing for the assistant's answer engine (citation-eligible).
//   train — corpus collection for model training. No citation value.
//
// Longest/most specific token first: 'chatgpt-user' must win before any
// substring of it could match something broader.
//
// Deliberately duplicated from the finops-llm worker: the two sites share no
// code by design (see ../../CLAUDE.md). Keep the two tables in sync by hand.
const AI_CRAWLERS = [
	{ token: 'chatgpt-user', name: 'ChatGPT-User', kind: 'live' },
	{ token: 'oai-searchbot', name: 'OAI-SearchBot', kind: 'search' },
	{ token: 'gptbot', name: 'GPTBot', kind: 'train' },
	{ token: 'claude-searchbot', name: 'Claude-SearchBot', kind: 'search' },
	{ token: 'claude-user', name: 'Claude-User', kind: 'live' },
	{ token: 'claudebot', name: 'ClaudeBot', kind: 'train' },
	{ token: 'perplexity-user', name: 'Perplexity-User', kind: 'live' },
	{ token: 'perplexitybot', name: 'PerplexityBot', kind: 'search' },
	{ token: 'google-extended', name: 'Google-Extended', kind: 'train' },
	{ token: 'bingbot', name: 'Bingbot', kind: 'search' },
	{ token: 'duckassistbot', name: 'DuckAssistBot', kind: 'search' },
	{ token: 'meta-externalagent', name: 'Meta-ExternalAgent', kind: 'train' },
	{ token: 'mistralai-user', name: 'MistralAI-User', kind: 'live' },
	{ token: 'bytespider', name: 'Bytespider', kind: 'train' },
	{ token: 'amazonbot', name: 'Amazonbot', kind: 'search' },
	{ token: 'applebot-extended', name: 'Applebot-Extended', kind: 'train' },
	{ token: 'youbot', name: 'YouBot', kind: 'search' },
	{ token: 'ccbot', name: 'CCBot', kind: 'train' },
	{ token: 'cohere-ai', name: 'Cohere', kind: 'train' },
];

// Returns the matching crawler descriptor, or null for humans and non-AI bots.
export function detectAiCrawler(userAgent) {
	const ua = (userAgent || '').toLowerCase();
	if (!ua) return null;
	return AI_CRAWLERS.find((c) => ua.includes(c.token)) || null;
}

// Answer surfaces that send a *human* to the site. This is the only half of
// the journey that proves anything: a crawl is a cost, a referral is a
// visitor. Until now the worker logged only the first.
//
// Hostname is matched with a real URL parse and an exact-or-subdomain test,
// never a substring test. `Referer: https://chatgpt.com.evil.net/` must not
// be counted as a ChatGPT referral, and a substring match would count it —
// anyone can set that header, so a naive test would let a third party
// manufacture the one number this product sells.
const AI_REFERRERS = [
	{ host: 'chatgpt.com', name: 'ChatGPT' },
	{ host: 'chat.openai.com', name: 'ChatGPT' },
	{ host: 'openai.com', name: 'OpenAI' },
	{ host: 'perplexity.ai', name: 'Perplexity' },
	{ host: 'claude.ai', name: 'Claude' },
	{ host: 'anthropic.com', name: 'Claude' },
	{ host: 'copilot.microsoft.com', name: 'Copilot' },
	{ host: 'bing.com', name: 'Copilot' },
	{ host: 'gemini.google.com', name: 'Gemini' },
	{ host: 'mistral.ai', name: 'Mistral' },
	{ host: 'poe.com', name: 'Poe' },
	{ host: 'you.com', name: 'You.com' },
	{ host: 'phind.com', name: 'Phind' },
	{ host: 'deepseek.com', name: 'DeepSeek' },
	{ host: 'grok.com', name: 'Grok' },
	{ host: 'meta.ai', name: 'Meta AI' },
	{ host: 'bard.google.com', name: 'Gemini' }, // pre-Gemini legacy surface
];

// Returns { name } for a human arriving from an AI answer, else null.
// Only the host is ever read, and only the surface name is stored — a
// Referer can carry query strings with real user data in it, and none of
// that is needed to answer "did this page get cited".
function matchAiHost(host) {
	return (
		AI_REFERRERS.find((r) => host === r.host || host.endsWith('.' + r.host)) || null
	);
}

// `utm_source` can also arrive as a bare surface label ('chatgpt') rather than
// a hostname, so keep a name index alongside the host table.
const AI_REFERRERS_BY_NAME = new Map(AI_REFERRERS.map((r) => [r.name.toLowerCase(), r]));

export function detectAiReferrer(referer, url) {
	if (referer) {
		try {
			const hit = matchAiHost(new URL(referer).hostname.toLowerCase());
			if (hit) return hit;
		} catch {
			// a malformed Referer is routine, not exceptional — fall through
			// to the query string rather than giving up.
		}
	}

	// The Referer header alone undercounts our largest surface. ChatGPT's
	// free-tier citation links carry ?utm_source=chatgpt.com, and its paid-tier
	// inline links are rel=noreferrer, so the query string is the only signal
	// that survives. Both go through the same exact-or-subdomain host test, so
	// a spoofed utm_source cannot out-count a spoofed Referer.
	const utm = url && url.searchParams && url.searchParams.get('utm_source');
	if (utm) {
		const value = utm.trim().toLowerCase();
		const host = value.includes('.')
			? value.replace(/^https?:\/\//, '').split('/')[0]
			: null;
		const hit = (host && matchAiHost(host)) || AI_REFERRERS_BY_NAME.get(value);
		if (hit) return hit;
	}

	return null;
}

// Referral counterpart to logAiCrawler. A crawler carrying a Referer would
// otherwise be counted twice — once as a hit, once as a visitor — so UA
// detection runs first and wins.
function logAiReferral(request, env, url) {
	if (!env || !env.AI_HITS) return;
	if (detectAiCrawler(request.headers.get('User-Agent'))) return;
	const ref = detectAiReferrer(request.headers.get('Referer'), url);
	if (!ref) return;
	try {
		env.AI_HITS.writeDataPoint({
			blobs: [ref.name, 'referral', url.pathname.slice(0, 200), url.hostname],
			doubles: [1],
			indexes: [ref.name],
		});
	} catch (e) {
		// Swallowed on purpose: analytics must never break the response.
	}
}

// Fire-and-forget write to Workers Analytics Engine. Deliberately never throws:
// a logging fault must not take down page serving. Note AE itself also fails
// SILENTLY on malformed data — `npx wrangler tail` is the only way to see that,
// so detectAiCrawler carries a self-check (scripts/worker-crawlers.test.mjs).
function logAiCrawler(request, env, url) {
	if (!env || !env.AI_HITS) return; // binding absent in local dev — fine.
	const hit = detectAiCrawler(request.headers.get('User-Agent'));
	if (!hit) return;
	try {
		env.AI_HITS.writeDataPoint({
			// Path is attacker-controlled and unbounded; AE drops the whole data
			// point (silently) past ~5KB, so cap it. Real paths are well under 200.
			blobs: [hit.name, hit.kind, url.pathname.slice(0, 200), url.hostname],
			doubles: [1],
			indexes: [hit.name],
		});
	} catch (e) {
		// Swallowed on purpose: analytics must never break the response.
	}
}

// Only page requests count. Without this, one human click from an assistant
// logs the document plus every stylesheet, script, font and image it pulls in —
// all of which carry the same Referer, inflating referrals roughly 10-30x.
// The .txt arm also drops robots.txt fetches, which OpenAI marks with an
// explicit `robots.txt` marker inside the crawler UA
// (docs: developers.openai.com/api/docs/bots). Referrers are a floor on AI
// traffic, not a total — mobile AI apps often send no Referer at all.
const ASSET_PATH_RE =
	/\.(?:css|js|mjs|map|json|xml|txt|ico|png|jpe?g|gif|svg|webp|avif|woff2?|ttf|otf|eot|mp4|webm|webmanifest)$/i;
// Dotfile segments are scanner probes, not pages, and the extension arm above
// misses them: /.env logged 32 hits in this dataset before this rule existed.
// Anchored to a segment start so an ordinary slug like /research/v1.2-guide is
// unaffected; /.well-known is exempt because we serve a real API catalog there.
const DOTFILE_PATH_RE = /(?:^|\/)\.(?!well-known(?:\/|$))/i;

export function isTrackedPath(pathname) {
	// Callers pass url.pathname, which never carries a query — but strip one
	// anyway so a cache-busted asset path can't slip past if that ever changes.
	const p = (pathname || '').split(/[?#]/)[0];
	return !ASSET_PATH_RE.test(p) && !DOTFILE_PATH_RE.test(p);
}

/* ------------------------------------------------------------------ */
/* Model releases and retirements (/api/releases)                      */
/* ------------------------------------------------------------------ */

/**
 * OpenRouter is the release feed: one public JSON call returns every model it
 * serves with the timestamp it first appeared and, where the lab has announced
 * one, the date the model is switched off. That covers "what shipped" and
 * "what is going away" without scraping anyone's newsroom or their timeline.
 *
 * What it cannot know is the lab's own announcement wording or date, so `date`
 * is the day the model became purchasable, not the day the lab posted about it.
 * The payload says so in `note`, and the page repeats it.
 */
const RELEASE_SOURCE = 'https://openrouter.ai/api/v1/models';

/**
 * First-party lab prefixes, keyed as they appear on OpenRouter. Anything absent
 * is dropped: third-party routers, `~` quant mirrors and `stealth` drops all
 * carry a `created` timestamp but are not a lab shipping anything. A first-party
 * shape change (OpenRouter renames a prefix) yields an empty list, which
 * RELEASES_MIN_ROWS rejects, and the page keeps its dated snapshot.
 */
const RELEASE_LABS = {
	openai: 'OpenAI',
	anthropic: 'Anthropic',
	google: 'Google',
	'meta-llama': 'Meta',
	meta: 'Meta',
	mistralai: 'Mistral',
	deepseek: 'DeepSeek',
	qwen: 'Alibaba',
	alibaba: 'Alibaba',
	'z-ai': 'Z.ai',
	moonshotai: 'Moonshot',
	'x-ai': 'xAI',
	cohere: 'Cohere',
	microsoft: 'Microsoft',
	nvidia: 'NVIDIA',
	amazon: 'Amazon',
	minimax: 'MiniMax',
	upstage: 'Upstage',
	baidu: 'Baidu',
	'01-ai': '01.AI',
	tencent: 'Tencent',
	'bytedance-seed': 'ByteDance',
	inclusionai: 'InclusionAI',
	sakana: 'Sakana',
	xiaomi: 'Xiaomi',
	'aion-labs': 'Aion Labs',
	thales: 'Thales',
};

const RELEASES_WINDOW_DAYS = 45;
const RELEASES_MIN_ROWS = 100;

/**
 * Which lab ships this model, or null when it is not a first-party listing.
 * `:batch`, `:free` and `:extended` are the same weights behind a different
 * endpoint, so they are excluded as duplicates of a row already in the feed.
 */
function releaseLab(id) {
	if (!id.includes('/')) return null;
	const prefix = id.split('/')[0];
	if (prefix.startsWith('~')) return null;
	return RELEASE_LABS[prefix] || null;
}

const isEndpointVariant = (id) => id.includes(':');

/**
 * OpenRouter quotes dollars per token and uses a negative number for "not
 * published". The site quotes per 1M tokens, and an unpublished price renders
 * as a dash: printing a number we do not have is how a tracker loses trust.
 */
function releasePrice(model) {
	const p = model.pricing || {};
	const one = (key) => {
		const n = Number(p[key]);
		return Number.isFinite(n) && n >= 0 ? Math.round(n * 1e6 * 1e4) / 1e4 : null;
	};
	return { in: one('prompt'), out: one('completion') };
}

const isoDay = (ts) => new Date(ts * 1000).toISOString().slice(0, 10);

/**
 * Read the feed, keep the recent first-party movements, serve them split into
 * what shipped and what is switching off. No storage: one edge-cached upstream
 * call per colo per 6h. On any upstream or shape fault this returns null and
 * the caller answers 503, which the page treats as "keep the snapshot you have".
 *
 * The transform is exported so scripts/fetch-releases.mjs writes the page's
 * snapshot with the identical filter, rather than a second copy of the lab list
 * that can quietly disagree with the live endpoint.
 */
export async function serveReleases() {
	let data;
	try {
		const res = await fetch(RELEASE_SOURCE, {
			headers: { 'User-Agent': 'finopsllm-release-bot' },
			cf: { cacheTtl: 21600, cacheEverything: true },
		});
		if (!res.ok) return null;
		data = (await res.json()).data;
	} catch {
		return null;
	}
	if (!Array.isArray(data) || data.length < RELEASES_MIN_ROWS) return null;

	const body = buildReleases(data);
	return new Response(
		JSON.stringify({
			updated: isoDay(Date.now() / 1000),
			source: RELEASE_SOURCE,
			windowDays: RELEASES_WINDOW_DAYS,
			note:
				'Dates are the day a model first became purchasable via OpenRouter, not the lab announcement date. in/out are USD per 1M tokens; null means the lab has not published a price.',
			...body,
		}),
		{
			headers: {
				'Content-Type': 'application/json; charset=utf-8',
				'Cache-Control': 'public, max-age=3600',
				'Access-Control-Allow-Origin': '*',
			},
		}
	);
}

/**
 * The whole filter, as a pure function of the upstream array. `now` is a
 * parameter rather than a read of the clock so the build script can stamp a
 * reproducible snapshot and the tests can pin a day.
 */
export function buildReleases(data, now = Date.now()) {
	const cutoff = now - RELEASES_WINDOW_DAYS * 864e5;
	const today = isoDay(now / 1000);
	const releases = [];
	const retirements = [];

	for (const m of data) {
		const lab = releaseLab(m.id || '');
		if (!lab || isEndpointVariant(m.id)) continue;
		const price = releasePrice(m);

		if (m.created && m.created * 1000 >= cutoff && m.created * 1000 <= now) {
			releases.push({
				id: m.id,
				provider: lab,
				date: isoDay(m.created),
				in: price.in,
				out: price.out,
				ctx: m.context_length || 0,
			});
		}

		// Only retirements still ahead of us. A lapsed date is history, and this
		// page is about what is about to cost a migration, not a graveyard.
		if (m.expiration_date && m.expiration_date >= today) {
			retirements.push({ id: m.id, provider: lab, expires: m.expiration_date, in: price.in, out: price.out });
		}
	}

	releases.sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : a.id < b.id ? 1 : -1));
	retirements.sort((a, b) => (a.expires < b.expires ? -1 : a.expires > b.expires ? 1 : 0));

	return { releases, retirements };
}

export default {
	async fetch(request, env) {
		const url = new URL(request.url);
		if (url.pathname === '/api/contact') return contactApi(request, env);

		// Release and retirement feed for the release tracker. Ahead of crawler
		// logging, redirects and the A/B test: it is an API response, not a page,
		// and must not be counted as a tracked hit or bucketed for the experiment.
		if (url.pathname === '/api/releases') {
			const releases = await serveReleases();
			return (
				releases ||
				new Response(JSON.stringify({ error: 'release feed unavailable', releases: [], retirements: [] }), {
					status: 503,
					headers: {
						'Content-Type': 'application/json; charset=utf-8',
						'Cache-Control': 'public, max-age=600',
						'Access-Control-Allow-Origin': '*',
					},
				})
			);
		}

		// 0. Record AI crawler hits before any redirect, so a bot that lands on
		//    www is still counted against the URL it asked for. Never throws.
		//    Referrals share the dataset: kind 'referral' is a human arriving
		//    from an AI answer, which is the only signal that shows a crawl
		//    turned into a reader.
		if (isTrackedPath(url.pathname)) {
			logAiCrawler(request, env, url);
			logAiReferral(request, env, url);
		}

		// 1. www -> apex (301).
		if (url.hostname === 'www.' + APEX) {
			url.hostname = APEX;
			return Response.redirect(url.toString(), 301);
		}

		// 2. Homepage A/B test: humans only, crawlers always see control.
		let abVariant = null;
		let abRequest = request;
		if (!isBot(request) && request.method === 'GET' && AB_PATHS.has(url.pathname)) {
			abVariant = pickVariant(request);
			const targetUrl = abTargetUrl(url, abVariant);
			if (targetUrl.toString() !== url.toString()) {
				abRequest = new Request(targetUrl, request);
			}
		}

		// 3. Fetch whatever the static host would serve (also applies _redirects/_headers).
		const assetResponse = await env.ASSETS.fetch(abRequest);

		// 4. Attach A/B cookie/headers if we ran the experiment on this request.
		let response = assetResponse;
		if (abVariant) {
			const headers = new Headers(assetResponse.headers);
			headers.set('X-AB-Variant', abVariant);
			// Response body depends on the ab_test cookie — without this the CDN
			// can serve one variant's cached HTML to the other bucket.
			headers.append('Vary', 'Cookie');
			if (!abCookieValue(request)) {
				headers.append('Set-Cookie', abCookieHeader(abVariant));
			}
			response = new Response(assetResponse.body, {
				status: assetResponse.status,
				statusText: assetResponse.statusText,
				headers,
			});
		}

		// 5. Only transform GET requests that explicitly negotiate markdown.
		const accept = request.headers.get('Accept') || '';
		if (request.method !== 'GET' || !/text\/markdown/i.test(accept)) {
			return response;
		}

		// 6. Only transform real HTML pages.
		const contentType = assetResponse.headers.get('Content-Type') || '';
		if (assetResponse.status !== 200 || !contentType.includes('text/html')) {
			return response;
		}

		// Read from `response`: when an A/B wrapper exists it owns the body stream.
		const html = await response.text();
		const markdown = htmlToMarkdown(html, url, DEFAULT_TITLE);

		return new Response(markdown, {
			status: 200,
			headers: {
				'Content-Type': 'text/markdown; charset=utf-8',
				'Content-Signal': CONTENT_SIGNAL,
				'X-Content-Type-Options': 'nosniff',
				'Cache-Control': 'public, max-age=0, must-revalidate',
				'Vary': 'Accept',
			},
		});
	},
};

/* ------------------------------------------------------------------ */
/* HTML -> Markdown (heuristic, no dependencies)                       */
/* ------------------------------------------------------------------ */

function htmlToMarkdown(html, url, defaultTitle) {
	const title = extractTitle(html, defaultTitle);
	let body = extractMain(html);

	body = body
		.replace(/<script[\s\S]*?<\/script>/gi, '')
		.replace(/<style[\s\S]*?<\/style>/gi, '')
		.replace(/<svg[\s\S]*?<\/svg>/gi, '')
		.replace(/<noscript[\s\S]*?<\/noscript>/gi, '')
		.replace(/<iframe[\s\S]*?<\/iframe>/gi, '')
		.replace(/<form[\s\S]*?<\/form>/gi, '')
		.replace(/<!--[\s\S]*?-->/g, '');

	body = body.replace(/<a\b[^>]*?href=(["'])(.*?)\1[^>]*>([\s\S]*?)<\/a>/gi, (m, q, href, text) => {
		const label = stripTags(text).trim();
		if (!label) return '';
		const target = absolutize(href, url);
		if (!target || target.startsWith('#') || target.startsWith('javascript:')) return label;
		return `[${label}](${target})`;
	});
	body = body.replace(/<(strong|b)\b[^>]*>([\s\S]*?)<\/\1>/gi, (m, _t, inner) => `**${stripTags(inner).trim()}**`);
	body = body.replace(/<(em|i)\b[^>]*>([\s\S]*?)<\/\1>/gi, (m, _t, inner) => `*${stripTags(inner).trim()}*`);
	body = body.replace(/<pre\b[^>]*>([\s\S]*?)<\/pre>/gi, (m, inner) => `\n\n\`\`\`\n${decode(stripTags(inner)).trim()}\n\`\`\`\n\n`);
	body = body.replace(/<code\b[^>]*>([\s\S]*?)<\/code>/gi, (m, inner) => `\`${stripTags(inner).trim()}\``);
	body = body.replace(/<br\s*\/?>/gi, '\n');

	body = body.replace(/<h([1-6])\b[^>]*>([\s\S]*?)<\/h\1>/gi, (m, level, inner) => {
		const text = stripTags(inner).trim();
		return text ? `\n\n${'#'.repeat(Number(level))} ${text}\n\n` : '';
	});

	body = body.replace(/<li\b[^>]*>([\s\S]*?)<\/li>/gi, (m, inner) => `\n- ${stripTags(inner).replace(/\s+/g, ' ').trim()}`);

	body = body
		.replace(/<\/(p|div|section|article|ul|ol|header|footer|main|figure|blockquote|table|tr)>/gi, '\n\n')
		.replace(/<(p|div|section|article|ul|ol|header|footer|figure|blockquote|table|tr)\b[^>]*>/gi, '\n\n');

	body = decode(stripTags(body));

	body = body
		.replace(/\r/g, '')
		.replace(/[ \t]+\n/g, '\n')
		.replace(/[ \t]{2,}/g, ' ')
		.replace(/\n{3,}/g, '\n\n')
		.trim();

	const header = `# ${title}\n\n> Source: ${url.origin}${url.pathname}\n\n`;
	return `${header}${body}\n`;
}

function extractTitle(html, defaultTitle) {
	const t = html.match(/<title\b[^>]*>([\s\S]*?)<\/title>/i);
	return t ? decode(stripTags(t[1])).trim() : defaultTitle;
}

function extractMain(html) {
	const main = html.match(/<main\b[^>]*>([\s\S]*?)<\/main>/i);
	if (main) return main[1];
	const body = html.match(/<body\b[^>]*>([\s\S]*?)<\/body>/i);
	return body ? body[1] : html;
}

function stripTags(s) {
	return s.replace(/<[^>]+>/g, '');
}

function absolutize(href, url) {
	try {
		return new URL(href, url).toString();
	} catch (e) {
		return href;
	}
}

function decode(s) {
	const named = {
		'&amp;': '&', '&lt;': '<', '&gt;': '>', '&quot;': '"', '&#39;': "'",
		'&apos;': "'", '&nbsp;': ' ', '&mdash;': '—', '&ndash;': '–',
		'&hellip;': '…', '&rsquo;': '’', '&lsquo;': '‘',
		'&ldquo;': '“', '&rdquo;': '”', '&copy;': '©',
		'&reg;': '®', '&trade;': '™', '&times;': '×', '&euro;': '€',
	};
	return s
		.replace(/&[a-zA-Z]+;/g, (m) => (m in named ? named[m] : m))
		.replace(/&#(\d+);/g, (m, n) => String.fromCodePoint(Number(n)))
		.replace(/&#x([0-9a-fA-F]+);/g, (m, n) => String.fromCodePoint(parseInt(n, 16)));
}

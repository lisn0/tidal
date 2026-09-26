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

export function isTrackedPath(pathname) {
	// Callers pass url.pathname, which never carries a query — but strip one
	// anyway so a cache-busted asset path can't slip past if that ever changes.
	return !ASSET_PATH_RE.test((pathname || '').split(/[?#]/)[0]);
}

export default {
	async fetch(request, env) {
		const url = new URL(request.url);

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

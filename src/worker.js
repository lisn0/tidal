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

export default {
	async fetch(request, env) {
		const url = new URL(request.url);

		// 0. Record AI crawler hits before any redirect, so a bot that lands on
		//    www is still counted against the URL it asked for. Never throws.
		logAiCrawler(request, env, url);

		// 1. www -> apex (301).
		if (url.hostname === 'www.' + APEX) {
			url.hostname = APEX;
			return Response.redirect(url.toString(), 301);
		}

		// 2. Fetch whatever the static host would serve (also applies _redirects/_headers).
		const assetResponse = await env.ASSETS.fetch(request);

		// 3. Only transform GET requests that explicitly negotiate markdown.
		const accept = request.headers.get('Accept') || '';
		if (request.method !== 'GET' || !/text\/markdown/i.test(accept)) {
			return assetResponse;
		}

		// 4. Only transform real HTML pages.
		const contentType = assetResponse.headers.get('Content-Type') || '';
		if (assetResponse.status !== 200 || !contentType.includes('text/html')) {
			return assetResponse;
		}

		const html = await assetResponse.text();
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

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

export default {
	async fetch(request, env) {
		const url = new URL(request.url);

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

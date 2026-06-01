/**
 * Markdown for Agents — dependency-free edge content negotiation.
 *
 * When a client (typically an AI agent) sends `Accept: text/markdown`, this
 * middleware fetches the requested static HTML page, extracts its <main>
 * content, and converts it to Markdown on the fly. Browsers and normal crawlers
 * (which do not ask for text/markdown) are passed through untouched.
 *
 * This is the free-plan equivalent of Cloudflare's paid "Markdown for Agents".
 * Critically, it preserves LLM CFO's AI-training opt-out:
 *   Content-Signal: search=yes, ai-input=yes, ai-train=no
 * (Cloudflare's native feature defaults to ai-train=yes — we intentionally do not.)
 */

const CONTENT_SIGNAL = 'search=yes, ai-input=yes, ai-train=no';

export async function onRequest(context) {
	const { request, next } = context;

	// Only consider GET requests that explicitly negotiate markdown.
	const accept = request.headers.get('Accept') || '';
	if (request.method !== 'GET' || !/text\/markdown/i.test(accept)) {
		return next();
	}

	// Fetch whatever the static host would serve for this path.
	const response = await next();
	const contentType = response.headers.get('Content-Type') || '';

	// Only transform real HTML pages; everything else passes through.
	if (!contentType.includes('text/html') || response.status !== 200) {
		return response;
	}

	const html = await response.text();
	const url = new URL(request.url);
	const markdown = htmlToMarkdown(html, url);

	const headers = new Headers({
		'Content-Type': 'text/markdown; charset=utf-8',
		'Content-Signal': CONTENT_SIGNAL,
		'X-Content-Type-Options': 'nosniff',
		'Cache-Control': 'public, max-age=0, must-revalidate',
		'Vary': 'Accept',
	});
	return new Response(markdown, { status: 200, headers });
}

/* ------------------------------------------------------------------ */
/* HTML -> Markdown (heuristic, no dependencies)                       */
/* ------------------------------------------------------------------ */

function htmlToMarkdown(html, url) {
	const title = extractTitle(html);
	let body = extractMain(html);

	// Drop non-content blocks entirely.
	body = body
		.replace(/<script[\s\S]*?<\/script>/gi, '')
		.replace(/<style[\s\S]*?<\/style>/gi, '')
		.replace(/<svg[\s\S]*?<\/svg>/gi, '')
		.replace(/<noscript[\s\S]*?<\/noscript>/gi, '')
		.replace(/<iframe[\s\S]*?<\/iframe>/gi, '')
		.replace(/<form[\s\S]*?<\/form>/gi, '')
		.replace(/<!--[\s\S]*?-->/g, '');

	// Inline conversions (do links first so their text survives tag-stripping).
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

	// Headings.
	body = body.replace(/<h([1-6])\b[^>]*>([\s\S]*?)<\/h\1>/gi, (m, level, inner) => {
		const text = stripTags(inner).trim();
		return text ? `\n\n${'#'.repeat(Number(level))} ${text}\n\n` : '';
	});

	// List items.
	body = body.replace(/<li\b[^>]*>([\s\S]*?)<\/li>/gi, (m, inner) => `\n- ${stripTags(inner).replace(/\s+/g, ' ').trim()}`);

	// Block boundaries -> blank lines.
	body = body
		.replace(/<\/(p|div|section|article|ul|ol|header|footer|main|figure|blockquote|table|tr)>/gi, '\n\n')
		.replace(/<(p|div|section|article|ul|ol|header|footer|figure|blockquote|table|tr)\b[^>]*>/gi, '\n\n');

	// Strip any remaining tags and decode entities.
	body = decode(stripTags(body));

	// Whitespace normalisation.
	body = body
		.replace(/\r/g, '')
		.replace(/[ \t]+\n/g, '\n')
		.replace(/[ \t]{2,}/g, ' ')
		.replace(/\n{3,}/g, '\n\n')
		.trim();

	const header = `# ${title}\n\n> Source: ${url.origin}${url.pathname}\n\n`;
	return `${header}${body}\n`;
}

function extractTitle(html) {
	const t = html.match(/<title\b[^>]*>([\s\S]*?)<\/title>/i);
	return t ? decode(stripTags(t[1])).trim() : 'LLM CFO';
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

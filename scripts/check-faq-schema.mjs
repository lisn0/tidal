// Fails the build if a page's FAQ data is not reaching its schema.
// Run via postbuild: node scripts/check-faq-schema.mjs
//
// This is a guard against a failure that is completely silent. Five research
// pages carried a hand-written `faqJsonLd` front-matter key that no template
// ever read: the build succeeded, the page looked fine, and the FAQ simply did
// not exist for crawlers — no visible section, no FAQPage schema. The content
// was written, reviewed, and published, and was invisible to every AI answer
// that would otherwise have quoted it.
//
// A schema that renders nothing costs nothing to check, so check it.

import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { join } from 'node:path';

const SITE = '_site';
const SRC = 'src';

let failures = 0;
const fail = (msg) => {
  console.error(`  ✗ ${msg}`);
  failures++;
};

// Front matter was matched at byte 0, so a BOM or a stray leading newline made
// the match fail, `declaresFaq` went false, and the page was skipped — a silent
// pass in the one script whose entire job is preventing silent passes. Normalise
// the things that actually break the match, and return null only when there is
// genuinely no front matter, so callers can insist it parsed.
const readFrontMatter = (text) => {
  const t = text.replace(/^﻿/, '').replace(/^\s+/, '');
  const m = t.match(/^---\r?\n([\s\S]*?)\r?\n---/);
  return m ? m[1] : null;
};

// 1. The dead key must not come back. `faqJsonLd` in front matter is dead code:
//    research.njk builds its schema from `faq`, and nothing consumes this key.
for (const dir of [`${SRC}/research`, SRC]) {
  if (!existsSync(dir)) continue;
  for (const f of readdirSync(dir).filter((f) => f.endsWith('.njk'))) {
    const text = readFileSync(join(dir, f), 'utf8');
    const fm = readFrontMatter(text);
    if (fm && /^faqJsonLd:/m.test(fm)) {
      fail(`${dir}/${f} uses "faqJsonLd", which no template reads — rename it to "faq"`);
    }
  }
}

// 2. Every page that declares an faq must actually emit FAQPage JSON-LD, and
//    the JSON-LD must parse. Presence is not enough; a malformed blob renders
//    nothing in a search snippet and fails silently in every consumer.
if (!existsSync(SITE)) {
  console.error('  ✗ no _site/ — did the build run?');
  process.exit(1);
}

let checked = 0;
for (const f of readdirSync(`${SITE}/research`).filter((f) => f.endsWith('.html'))) {
  const html = readFileSync(join(SITE, 'research', f), 'utf8');
  const blocks = [...html.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)];
  const types = [];
  for (const b of blocks) {
    try {
      types.push(JSON.parse(b[1])['@type']);
    } catch (e) {
      fail(`${f}: JSON-LD does not parse — ${e.message}`);
    }
  }
  const srcPath = join(SRC, 'research', f.replace('.html', '.njk'));
  if (!existsSync(srcPath)) continue;
  const fm = readFrontMatter(readFileSync(srcPath, 'utf8'));
  if (fm === null) {
    fail(`${f}: front matter did not parse — this check cannot see whether the page declares an faq`);
    continue;
  }
  if (/^faq:/m.test(fm)) {
    checked++;
    if (!types.includes('FAQPage')) fail(`${f}: declares faq but emits no FAQPage schema`);
  }
}

if (failures) {
  console.error(`\n❌ check-faq-schema: ${failures} problem(s) — FAQ data is not reaching the page.`);
  process.exit(1);
}
console.log(`[check-faq-schema] ok — ${checked} pages with FAQ data all emit valid FAQPage schema.`);

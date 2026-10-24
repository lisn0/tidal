import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import { test } from 'node:test';
import worker from '../src/worker.js';

const source = readFileSync(new URL('../src/assets/consent.js', import.meta.url), 'utf8');

for (const [country, continent, requireConsent] of [
  ['PT', 'EU', true], ['DE', 'EU', true], ['GB', 'EU', true], ['CH', 'EU', true],
  ['NO', 'EU', true], ['IS', 'EU', true], ['CY', 'AS', true], ['TR', 'AS', true],
  ['US', 'NA', false], ['CA', 'NA', false], ['BR', 'SA', false], ['JP', 'AS', false],
  ['AU', 'OC', false], ['XX', 'NA', true], ['T1', 'NA', true],
  ['US', undefined, true], [undefined, undefined, true],
]) {
  test(`edge policy: ${country}/${continent}`, async () => {
    const request = new Request('https://llmcfo.com/api/analytics-policy');
    request.cf = { country, continent };
    const response = await worker.fetch(request, {});
    assert.deepEqual(await response.json(), { requireConsent });
    assert.equal(response.headers.get('Cache-Control'), 'no-store');
  });
}

test('client-supplied country header cannot override unknown edge location', async () => {
  const response = await worker.fetch(new Request('https://llmcfo.com/api/analytics-policy', {
    headers: { 'CF-IPCountry': 'US' },
  }), {});
  assert.deepEqual(await response.json(), { requireConsent: true });
});

function browser({ policy = { requireConsent: true }, stored, navigator = {}, responseOk = true, failure = false, pending } = {}) {
  const scripts = [];
  const elements = [];
  const cookies = new Map(stored ? [['llmcfo_consent', stored]] : []);
  let reloads = 0;
  let requests = 0;
  function element(tag) {
    const el = { tag, children: [], style: {}, handlers: {},
      setAttribute() {}, focus() {},
      addEventListener(name, fn) { this.handlers[name] = fn; },
      appendChild(child) { child.parentNode = this; this.children.push(child); },
      removeChild(child) { this.children = this.children.filter(item => item !== child); child.parentNode = null; },
    };
    elements.push(el);
    return el;
  }
  const document = {
    readyState: 'complete', body: element('body'),
    createElement: element, querySelectorAll: () => [],
    getElementById: id => elements.find(el => el.id === id && el.parentNode) || null,
    getElementsByTagName: () => [{ parentNode: { insertBefore(script) { scripts.push(script.src); } } }],
    addEventListener() {}, removeEventListener() {},
  };
  Object.defineProperty(document, 'cookie', {
    get: () => [...cookies].map(([k, v]) => `${k}=${v}`).join('; '),
    set: value => {
      const [pair] = value.split(';');
      const [key, val] = pair.split('=');
      if (value.includes('Max-Age=0')) cookies.delete(key);
      else cookies.set(key, val);
    },
  });
  const window = { navigator, dispatchEvent() {} };
  const context = {
    window, document, Event: class {},
    location: { protocol: 'https:', hostname: 'llmcfo.com', reload() { reloads++; } },
    fetch: async (url, options) => {
      requests++;
      assert.equal(url, '/api/analytics-policy');
      assert.equal(options.cache, 'no-store');
      if (pending) await pending;
      if (failure) throw new Error('offline');
      return { ok: responseOk, json: async () => policy };
    },
  };
  vm.runInNewContext(source, context);
  return { window, scripts, cookies, get reloads() { return reloads; }, get requests() { return requests; },
    banner: () => document.getElementById('llmcfo-consent-banner'),
    click(label) {
      const button = elements.find(el => el.textContent === label && el.parentNode?.parentNode?.parentNode);
      assert.ok(button, `button ${label} exists`);
      button.handlers.click();
    },
  };
}
const settle = () => new Promise(resolve => setImmediate(resolve));

test('European visit stays blocked until acceptance; then both tools load', async () => {
  const b = browser();
  await settle();
  assert.deepEqual(b.scripts, []);
  assert.ok(b.banner());
  b.click('Accept');
  assert.equal(b.scripts.length, 2);
  assert.equal(b.window.analyticsConsent, true);
  assert.equal(b.cookies.get('llmcfo_consent'), 'accepted');
  assert.ok(b.window.clarity.q.some(args => args[0] === 'consentv2' && args[1].analytics_Storage === 'granted' && args[1].ad_Storage === 'denied'));
});

test('known non-European visit loads both analytics tools without banner or stored acceptance', async () => {
  const b = browser({ policy: { requireConsent: false } });
  assert.deepEqual(b.scripts, [], 'must wait for edge decision');
  await settle();
	assert.equal(b.scripts.length, 2);
	assert.match(b.scripts[0], /googletagmanager/);
	assert.match(b.scripts[1], /clarity\.ms/);
  assert.equal(b.banner(), null);
  assert.equal(b.cookies.has('llmcfo_consent'), false);
  assert.equal(b.window.analyticsConsent, true);
	assert.ok(b.window.clarity.q.some(args => args[0] === 'consentv2' && args[1].analytics_Storage === 'granted' && args[1].ad_Storage === 'denied'));
  const updates = b.window.dataLayer.filter(args => args[0] === 'consent' && args[1] === 'update');
  assert.equal(updates.length, 1);
  assert.deepEqual(Object.keys(updates[0][2]), ['analytics_storage']);
  b.window.cookieSettings();
  b.click('Reject');
  assert.equal(b.window.analyticsConsent, false);
  assert.equal(b.cookies.get('llmcfo_consent'), 'rejected');
	assert.equal(b.reloads, 1, 'withdrawal must unload automatically started tags');
	assert.ok(b.window.clarity.q.some(args => args[0] === 'consentv2' && args[1].analytics_Storage === 'denied' && args[1].ad_Storage === 'denied'));
});

for (const stored of ['accepted', 'rejected']) {
  test(`saved ${stored} is respected without a location lookup`, async () => {
    const b = browser({ stored, policy: { requireConsent: false } });
    await settle();
    assert.equal(b.requests, 0);
    assert.equal(b.scripts.length, stored === 'accepted' ? 2 : 0);
  });
}

for (const options of [{ failure: true }, { responseOk: false }, { policy: {} }, { policy: null }]) {
  test(`unavailable or malformed policy requires acceptance: ${JSON.stringify(options)}`, async () => {
    const b = browser(options);
    await settle();
    assert.deepEqual(b.scripts, []);
    assert.ok(b.banner());
  });
}

for (const navigator of [{ globalPrivacyControl: true }, { doNotTrack: '1' }]) {
  test(`browser privacy preference blocks automatic and remembered tracking: ${JSON.stringify(navigator)}`, async () => {
    for (const stored of [undefined, 'accepted']) {
      const b = browser({ policy: { requireConsent: false }, navigator, stored });
      await settle();
      assert.deepEqual(b.scripts, []);
      assert.equal(b.requests, 0);
      b.window.cookieSettings();
      b.click(stored === 'accepted' ? 'Keep accepted' : 'Accept');
      assert.deepEqual(b.scripts, [], 'settings cannot override browser privacy preference');
    }
  });
}

test('rejecting while location is pending prevents later automatic loading', async () => {
  let release;
  const pending = new Promise(resolve => { release = resolve; });
  const b = browser({ policy: { requireConsent: false }, pending });
  await settle();
  b.window.cookieSettings();
  b.click('Reject');
  release();
  await settle();
  assert.deepEqual(b.scripts, []);
});

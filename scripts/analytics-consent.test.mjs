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
  const tracks = [];
  const clarityCalls = [];
  const consentStates = [];
  let consentAtInjection = false;
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
    getElementsByTagName: () => [{ parentNode: { insertBefore(script) {
      scripts.push(script.src);
      consentAtInjection = window.analyticsConsent;
      window.zaraz = { track: (...args) => tracks.push(args), consent: { setAll: value => consentStates.push(value) } };
      if (script.onload) script.onload();
    } } }],
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
  const window = { navigator, dispatchEvent() {}, clarity: (...args) => clarityCalls.push(args) };
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
  return { window, scripts, tracks, clarityCalls, consentStates, cookies, get consentAtInjection() { return consentAtInjection; }, get reloads() { return reloads; }, get requests() { return requests; },
    banner: () => document.getElementById('llmcfo-consent-banner'),
    click(label) {
      const button = elements.find(el => el.textContent === label && el.parentNode?.parentNode?.parentNode);
      assert.ok(button, `button ${label} exists`);
      button.handlers.click();
    },
  };
}
const settle = () => new Promise(resolve => setImmediate(resolve));

test('European visit stays blocked until acceptance; then loads only Zaraz', async () => {
  const b = browser();
  await settle();
  assert.deepEqual(b.scripts, []);
  assert.ok(b.banner());
  b.click('Accept');
  assert.equal(b.scripts.length, 1);
  assert.equal(b.scripts[0], '/cdn-cgi/zaraz/i.js');
  assert.equal(b.consentAtInjection, true, 'Zaraz must see consent before its initial Pageview');
  assert.equal(b.window.analyticsConsent, true);
  assert.equal(b.cookies.get('llmcfo_consent'), 'accepted');
  const initial = b.window.dataLayer[0].google_consent_default;
  const granted = b.window.dataLayer[1].google_consent_update;
  assert.equal(initial.analytics_storage, 'denied');
  assert.equal(initial.ad_storage, 'denied');
  assert.equal(granted.analytics_storage, 'granted');
  assert.equal(granted.ad_storage, 'denied');
  assert.equal(granted.ad_user_data, 'denied');
  assert.equal(granted.ad_personalization, 'denied');
});

test('known non-European visit loads only Zaraz without banner or stored acceptance', async () => {
  const b = browser({ policy: { requireConsent: false } });
  assert.deepEqual(b.scripts, [], 'must wait for edge decision');
  await settle();
	assert.equal(b.scripts.length, 1);
	assert.equal(b.scripts[0], '/cdn-cgi/zaraz/i.js');
  assert.equal(b.banner(), null);
  assert.equal(b.cookies.has('llmcfo_consent'), false);
  assert.equal(b.window.analyticsConsent, true);
	assert.equal(b.window.dataLayer[1].google_consent_update.analytics_storage, 'granted');
	assert.equal(b.window.dataLayer[1].google_consent_update.ad_personalization, 'denied');
	b.window.zaraz.track('test_event', { sample: 'value' });
	assert.equal(b.tracks[0][0], 'test_event');
	assert.equal(b.tracks[0][1].sample, 'value');
  b.window.cookieSettings();
  b.click('Reject');
  assert.equal(b.window.analyticsConsent, false);
  assert.equal(b.cookies.get('llmcfo_consent'), 'rejected');
	assert.equal(b.reloads, 1, 'withdrawal must unload automatically started tags');
	assert.ok(b.clarityCalls.some(args => args[0] === 'consentv2' && args[1].analytics_Storage === 'denied' && args[1].ad_Storage === 'denied'));
	assert.deepEqual(b.consentStates, [false]);
	assert.equal(b.window.dataLayer.at(-1).google_consent_update.analytics_storage, 'denied');
});

for (const stored of ['accepted', 'rejected']) {
  test(`saved ${stored} is respected without a location lookup`, async () => {
    const b = browser({ stored, policy: { requireConsent: false } });
    await settle();
    assert.equal(b.requests, 0);
    assert.equal(b.scripts.length, stored === 'accepted' ? 1 : 0);
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

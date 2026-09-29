import assert from 'node:assert/strict';
import worker from '../src/worker.js';

const url = 'https://llmcfo.com/api/contact';
const valid = {
  name: 'Ada Lovelace', email: 'ada@example.com', company: 'Example',
  topic: 'audit', message: 'Please review our AI spend.',
};
const sent = [];
const env = {
  CONTACT_RATE_LIMIT: { async limit() { return { success: true }; } },
  EMAIL: { async send(message) { sent.push(message); return { messageId: 'test' }; } },
};
const post = (body, options = {}) => worker.fetch(new Request(url, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json', 'CF-Connecting-IP': '203.0.113.10', ...options.headers },
  body: typeof body === 'string' ? body : JSON.stringify(body),
}), options.env ?? env);

let response = await worker.fetch(new Request(url), env);
assert.equal(response.status, 200);
assert.deepEqual((await response.json()).required, ['name', 'email', 'topic', 'message']);

response = await post(valid);
assert.deepEqual(await response.json(), { ok: true });
assert.equal(sent.length, 1);
assert.equal(sent[0].to, 'hello@llmcfo.com');
assert.equal(sent[0].from, 'noreply@llmcfo.com');
assert.equal(sent[0].replyTo, valid.email);
assert.ok(sent[0].text.includes(valid.message));
assert.equal(sent[0].html, undefined);

response = await post(new URLSearchParams(valid).toString(), { headers: { 'Content-Type': 'application/x-www-form-urlencoded' } });
assert.equal(response.status, 200);
assert.equal(sent.length, 2);

response = await post(new URLSearchParams(valid).toString(), { headers: { 'Content-Type': 'application/x-www-form-urlencoded', Accept: 'text/html' } });
assert.equal(response.status, 200);
assert.match(response.headers.get('Content-Type'), /text\/html/);
assert.match(await response.text(), /Message sent/);
assert.equal(sent.length, 3);

for (const bad of [
  { ...valid, name: 'Bad\nBcc: victim@example.com' },
  { ...valid, email: 'not-an-email' },
  { ...valid, topic: 'unknown' },
  { ...valid, message: 'short' },
  { ...valid, message: 'x'.repeat(4001) },
]) {
  response = await post(bad);
  assert.equal(response.status, 400);
  assert.deepEqual(await response.json(), { error: 'invalid_fields' });
}
assert.equal(sent.length, 3);

response = await post(new URLSearchParams({ ...valid, name: '<script>alert(1)</script>\n' }).toString(), {
  headers: { 'Content-Type': 'application/x-www-form-urlencoded', Accept: 'text/html' },
});
assert.equal(response.status, 400);
const failurePage = await response.text();
assert.match(failurePage, /Message could not be sent/);
assert.doesNotMatch(failurePage, /script|alert/);

response = await post({ ...valid, website: 'bot.example' });
assert.deepEqual(await response.json(), { ok: true });
assert.equal(sent.length, 3);

response = await post(valid, { headers: { Origin: 'https://attacker.example' } });
assert.equal(response.status, 403);
response = await post(valid, { headers: { 'Content-Type': 'text/plain' } });
assert.equal(response.status, 415);
response = await post('{bad json');
assert.equal(response.status, 400);
response = await post({ ...valid, message: 'x'.repeat(9000) });
assert.equal(response.status, 413);
response = await post(valid, { env: { ...env, CONTACT_RATE_LIMIT: { async limit() { return { success: false }; } } } });
assert.equal(response.status, 429);
response = await post(valid, { env: { EMAIL: env.EMAIL } });
assert.equal(response.status, 503);
response = await post(valid, { headers: { 'CF-Connecting-IP': '' } });
assert.equal(response.status, 503);
response = await post(valid, { env: { CONTACT_RATE_LIMIT: env.CONTACT_RATE_LIMIT } });
assert.equal(response.status, 503);
const oldError = console.error;
const logged = [];
console.error = (...items) => logged.push(items);
response = await post(valid, {
  headers: { 'CF-Ray': 'safe-ray-1' },
  env: { ...env, EMAIL: { async send() { throw Object.assign(new Error('private address ada@example.com'), { code: 'E_SENDER_NOT_VERIFIED' }); } } },
});
console.error = oldError;
assert.equal(response.status, 503);
assert.equal(logged[0][1].code, 'E_SENDER_NOT_VERIFIED');
assert.equal(logged[0][1].ray, 'safe-ray-1');
assert.doesNotMatch(JSON.stringify(logged), /ada@example.com|private address/);
assert.equal(sent.length, 3);

console.log('Contact API tests passed');

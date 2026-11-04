import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { handle, MISS_KEY, normalizePath } from '../src/core.ts';

const cases = JSON.parse(readFileSync(new URL('./parity-cases.json', import.meta.url), 'utf8'));
const expected: Array<{ path: string; status: number; location: string | null; logged: string | null }> = JSON.parse(
  readFileSync(new URL('./parity-expected.json', import.meta.url), 'utf8'),
);
const BASE = 'https://short.example';

// parity-expected.json is produced by running parity_flask.py against the
// original Flask app, so these assert behavior parity case by case.
for (const exp of expected) {
  test(`parity: GET ${exp.path}`, () => {
    const { response, event } = handle(new Request(BASE + exp.path), cases.redirects);
    assert.equal(response.status, exp.status);
    assert.equal(response.headers.get('location'), exp.location);
    assert.equal(event?.key ?? null, exp.logged);
  });
}

test('normalizePath strips non-alphanumerics and lowercases', () => {
  assert.equal(normalizePath('Foo-Bar_9!/x'), 'foobar9x');
});

test('hit event records url, referer and time', () => {
  const now = new Date('2026-11-04T19:00:00Z');
  const req = new Request(`${BASE}/foobar?x=1`, { headers: { Referer: 'https://flyer.example/' } });
  const { event } = handle(req, cases.redirects, now);
  assert.deepEqual(event, {
    quickshort: 'hit',
    t: '2026-11-04T19:00:00.000Z',
    key: 'foobar',
    url: `${BASE}/foobar?x=1`,
    referer: 'https://flyer.example/',
  });
});

test('miss is logged under _404 with the original url', () => {
  const { event } = handle(new Request(`${BASE}/Nope`), cases.redirects);
  assert.equal(event?.key, MISS_KEY);
  assert.equal(event?.url, `${BASE}/Nope`);
});

test('HEAD redirects like GET', () => {
  const { response } = handle(new Request(`${BASE}/foobar`, { method: 'HEAD' }), cases.redirects);
  assert.equal(response.status, 302);
});

test('POST is 405 and not logged', () => {
  const { response, event } = handle(new Request(`${BASE}/foobar`, { method: 'POST' }), cases.redirects);
  assert.equal(response.status, 405);
  assert.equal(event, null);
});

test('keys that collide with Object.prototype are not redirects', () => {
  const { response } = handle(new Request(`${BASE}/constructor`), cases.redirects);
  assert.equal(response.status, 404);
});

test('malformed percent-encoding is a 404, not a crash', () => {
  const { response } = handle(new Request(`${BASE}/%E0%A4%A`), cases.redirects);
  assert.equal(response.status, 404);
});

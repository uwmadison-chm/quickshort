import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { handle, MISS_KEY, normalizePath, publicUrl } from '../src/core.ts';

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

test('logged url uses X-Forwarded-Host and X-Forwarded-Proto from a proxy', () => {
  const req = new Request('https://quickshort.acct.workers.dev/Foo-Bar?x=1', {
    headers: { 'X-Forwarded-Host': 'go.example.edu, inner.proxy', 'X-Forwarded-Proto': 'https' },
  });
  const { event, response } = handle(req, cases.redirects);
  assert.equal(event?.url, 'https://go.example.edu/Foo-Bar?x=1');
  assert.equal(response.headers.get('location'), 'https://example.com?x=1&a=b');
});

test('publicUrl keeps the request url without proxy headers, and ignores junk', () => {
  assert.equal(publicUrl(new Request('http://h.example/a?b=1')), 'http://h.example/a?b=1');
  const junk = new Request('http://h.example/a', { headers: { 'X-Forwarded-Host': 'bad host/x', 'X-Forwarded-Proto': 'gopher' } });
  assert.equal(publicUrl(junk), 'http://h.example/a');
});

test('publicUrl drops the internal port when the forwarded host has none', () => {
  const req = new Request('http://localhost:8080/x', { headers: { 'X-Forwarded-Host': 'go.example.edu', 'X-Forwarded-Proto': 'https' } });
  assert.equal(publicUrl(req), 'https://go.example.edu/x');
  const withPort = new Request('http://localhost:8080/x', { headers: { 'X-Forwarded-Host': 'go.example.edu:8443' } });
  assert.equal(publicUrl(withPort), 'http://go.example.edu:8443/x');
});

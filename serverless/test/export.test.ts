import assert from 'node:assert/strict';
import { test } from 'node:test';
import { HOUR_MS, objectKey, pendingWindows, toJsonl } from '../src/export/windows.ts';

const t0 = Date.parse('2026-11-04T19:00:00Z');

test('pendingWindows returns complete hours past the lag', () => {
  const ws = pendingWindows(t0 + 5 * 60 * 1000, t0 + 3 * HOUR_MS + 5 * 60 * 1000);
  // 19:00 and 20:00 are complete and 10+ min old; 21:00 ended only 5 min ago.
  assert.deepEqual(ws.map((w) => new Date(w.start).toISOString()), ['2026-11-04T19:00:00.000Z', '2026-11-04T20:00:00.000Z']);
});

test('pendingWindows respects max', () => {
  assert.equal(pendingWindows(t0, t0 + 100 * HOUR_MS, 0, 48).length, 48);
});

test('pendingWindows is empty when nothing is complete', () => {
  assert.deepEqual(pendingWindows(t0, t0 + HOUR_MS), []);
});

test('objectKey is per-hour and stable', () => {
  assert.equal(objectKey('hits/', { start: t0, end: t0 + HOUR_MS }), 'hits/2026/11/04/19.jsonl');
});

test('toJsonl keeps hit events only, sorted by time', () => {
  const b = { quickshort: 'hit', t: '2026-11-04T19:30:00.000Z', key: 'b', url: 'u', referer: '' };
  const a = { quickshort: 'hit', t: '2026-11-04T19:10:00.000Z', key: 'a', url: 'u', referer: '' };
  const out = toJsonl([JSON.stringify(b), 'START RequestId: x', '{"other":1}', JSON.stringify(a) + '\n']);
  assert.equal(out, JSON.stringify(a) + '\n' + JSON.stringify(b) + '\n');
});

test('toJsonl of nothing is empty', () => {
  assert.equal(toJsonl([]), '');
});

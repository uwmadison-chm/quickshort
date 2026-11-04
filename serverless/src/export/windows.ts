// Pure helpers for log exporters: split time into hour windows, name output
// objects, and turn raw log messages into JSON-lines files. Platform-specific
// exporters (see ./aws.ts) fetch logs and write objects; this decides what.

import type { HitEvent } from '../core.ts';

export const HOUR_MS = 60 * 60 * 1000;

export interface Window {
  start: number; // inclusive, ms since epoch, on an hour boundary
  end: number; // exclusive
}

/**
 * Complete hour windows from `watermark` up to `now - lagMs`, oldest first,
 * at most `max`. Logs reach the log service a few seconds late, so an hour
 * isn't exported until `lagMs` after it ends.
 */
export function pendingWindows(watermark: number, now: number, lagMs = 10 * 60 * 1000, max = 48): Window[] {
  const out: Window[] = [];
  let start = Math.floor(watermark / HOUR_MS) * HOUR_MS;
  while (out.length < max && start + HOUR_MS <= now - lagMs) {
    out.push({ start, end: start + HOUR_MS });
    start += HOUR_MS;
  }
  return out;
}

/** Object key for a window, e.g. "hits/2026/11/04/19.jsonl". Rerunning a window overwrites it. */
export function objectKey(prefix: string, w: Window): string {
  const iso = new Date(w.start).toISOString(); // 2026-11-04T19:00:00.000Z
  const [y, m, d, h] = [iso.slice(0, 4), iso.slice(5, 7), iso.slice(8, 10), iso.slice(11, 13)];
  return `${prefix}${y}/${m}/${d}/${h}.jsonl`;
}

/** Keep only well-formed hit events; return them as a JSON-lines string sorted by time. */
export function toJsonl(messages: Iterable<string>): string {
  const events: HitEvent[] = [];
  for (const msg of messages) {
    let parsed: unknown;
    try {
      parsed = JSON.parse(msg.trim());
    } catch {
      continue;
    }
    if (isHitEvent(parsed)) events.push(parsed);
  }
  events.sort((a, b) => (a.t < b.t ? -1 : a.t > b.t ? 1 : 0));
  return events.map((e) => JSON.stringify(e) + '\n').join('');
}

function isHitEvent(x: unknown): x is HitEvent {
  if (typeof x !== 'object' || x === null) return false;
  const e = x as Record<string, unknown>;
  return e.quickshort === 'hit' && typeof e.t === 'string' && typeof e.key === 'string';
}

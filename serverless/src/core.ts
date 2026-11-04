// Platform-independent quickshort logic. Takes a standard Request, returns a
// Response plus (optionally) a hit event to log. Entry files in ./entry adapt
// this to each platform and decide how to emit the event.

export type Redirects = Readonly<Record<string, string>>;

export interface HitEvent {
  /** Marker so log exporters can filter hit lines out of other log output. */
  quickshort: 'hit';
  /** UTC ISO-8601 timestamp. */
  t: string;
  /** Normalized key, or "_404" for a miss. */
  key: string;
  /** Full incoming request URL. */
  url: string;
  /** Referer header, or "". */
  referer: string;
}

export interface HandleResult {
  response: Response;
  /** null when the request should not be logged (ignored paths, etc). */
  event: HitEvent | null;
}

export const MISS_KEY = '_404';
const IGNORE_PATHS = new Set(['favicon.ico', 'robots.txt']);
// The Flask app has /<path>/hits and /<path>/log routes that 404 unless
// SERVE_LOGS is set. We don't serve logs, but keep the 404 so those URLs
// don't fall through to a redirect lookup for e.g. "foohits".
const STATS_SUFFIX = /^.+\/(hits|log)$/s;

export function normalizePath(path: string): string {
  return path.replace(/[^a-z0-9]/gi, '').toLowerCase();
}

export function handle(request: Request, redirects: Redirects, now: Date = new Date()): HandleResult {
  if (request.method !== 'GET' && request.method !== 'HEAD') {
    return { response: textResponse(405, 'Method Not Allowed', { Allow: 'GET, HEAD' }), event: null };
  }
  const url = new URL(request.url);
  let path: string;
  try {
    path = decodeURIComponent(url.pathname.slice(1));
  } catch {
    return { response: notFound(), event: null };
  }
  if (path === '' || IGNORE_PATHS.has(path) || STATS_SUFFIX.test(path)) {
    return { response: notFound(), event: null };
  }

  const key = normalizePath(path);
  const target = Object.hasOwn(redirects, key) ? redirects[key] : undefined;
  const event: HitEvent = {
    quickshort: 'hit',
    t: now.toISOString(),
    key: target === undefined ? MISS_KEY : key,
    url: request.url,
    referer: request.headers.get('referer') ?? '',
  };
  if (target === undefined) {
    return { response: notFound(), event };
  }
  const location = mergeUrlParams(target, url.searchParams);
  return {
    response: new Response(null, { status: 302, headers: { Location: location } }),
    event,
  };
}

/**
 * Merge incoming query params into the saved URL's params, matching the
 * Flask app: saved params win on conflict; only the first value of a
 * repeated incoming param is kept; repeated saved params are joined with a
 * space; blank saved params are dropped; any fragment is dropped.
 */
export function mergeUrlParams(target: string, incoming: URLSearchParams): string {
  let base = target;
  const hashAt = base.indexOf('#');
  if (hashAt >= 0) base = base.slice(0, hashAt);
  let savedQuery = '';
  const qAt = base.indexOf('?');
  if (qAt >= 0) {
    savedQuery = base.slice(qAt + 1);
    base = base.slice(0, qAt);
  }

  const merged = new Map<string, string>();
  for (const [k, v] of incoming) {
    if (!merged.has(k)) merged.set(k, v);
  }
  const saved = new Map<string, string[]>();
  for (const [k, v] of parseQs(savedQuery)) {
    const vals = saved.get(k);
    if (vals) vals.push(v);
    else saved.set(k, [v]);
  }
  for (const [k, vals] of saved) merged.set(k, vals.join(' '));

  const query = [...merged].map(([k, v]) => `${quotePlus(k)}=${quotePlus(v)}`).join('&');
  return query ? `${base}?${query}` : base;
}

/** Like Python's urllib.parse.parse_qsl with keep_blank_values=False. */
function parseQs(query: string): Array<[string, string]> {
  const out: Array<[string, string]> = [];
  for (const field of query.split('&')) {
    const eq = field.indexOf('=');
    if (eq < 0) continue;
    const k = unquotePlus(field.slice(0, eq));
    const v = unquotePlus(field.slice(eq + 1));
    if (v) out.push([k, v]);
  }
  return out;
}

function unquotePlus(s: string): string {
  const spaced = s.replace(/\+/g, ' ');
  try {
    return decodeURIComponent(spaced);
  } catch {
    return spaced;
  }
}

/** Like Python's urllib.parse.quote_plus. */
function quotePlus(s: string): string {
  return encodeURIComponent(s)
    .replace(/[!'()*]/g, (c) => '%' + c.charCodeAt(0).toString(16).toUpperCase())
    .replace(/%20/g, '+');
}

function notFound(): Response {
  return textResponse(404, 'Not Found');
}

function textResponse(status: number, body: string, headers: Record<string, string> = {}): Response {
  return new Response(body + '\n', {
    status,
    headers: { 'Content-Type': 'text/plain; charset=utf-8', ...headers },
  });
}

/** The single log line entries write to stdout for each hit. */
export function logLine(event: HitEvent): string {
  return JSON.stringify(event);
}

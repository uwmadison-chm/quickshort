// AWS Lambda entry for Function URLs and API Gateway HTTP APIs (payload
// format 2.0). stdout goes to CloudWatch Logs; the Lambda service ships it
// asynchronously, so logging adds no latency for the user.

import { handle, logLine } from '../core.ts';
import redirects from '../redirects.generated.ts';

// Just the fields we use from the payload 2.0 event.
export interface HttpEventV2 {
  rawPath: string;
  rawQueryString: string;
  headers?: Record<string, string | undefined>;
  requestContext: { http: { method: string } };
}

export interface HttpResultV2 {
  statusCode: number;
  headers: Record<string, string>;
  body: string;
}

export function toRequest(event: HttpEventV2): Request {
  const headers = new Headers();
  for (const [k, v] of Object.entries(event.headers ?? {})) {
    if (v !== undefined) headers.set(k, v);
  }
  const proto = headers.get('x-forwarded-proto') ?? 'https';
  const host = headers.get('host') ?? 'localhost';
  const query = event.rawQueryString ? `?${event.rawQueryString}` : '';
  return new Request(`${proto}://${host}${event.rawPath}${query}`, {
    method: event.requestContext.http.method,
    headers,
  });
}

export async function handler(event: HttpEventV2): Promise<HttpResultV2> {
  const request = toRequest(event);
  const { response, event: hit } = handle(request, redirects);
  // process.stdout.write rather than console.log: the Lambda runtime prefixes
  // console.log lines with a timestamp and request id, and we want the raw
  // JSON so CloudWatch filter patterns and the exporter can parse it.
  if (hit) process.stdout.write(logLine(hit) + '\n');
  return {
    statusCode: response.status,
    headers: Object.fromEntries(response.headers),
    body: request.method === 'HEAD' ? '' : await response.text(),
  };
}

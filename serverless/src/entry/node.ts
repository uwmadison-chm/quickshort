// Self-hosted entry: a plain node:http server. Hit events go to stdout as
// JSON lines; point your process manager / log shipper at them, or just
// redirect stdout to a file.
//
// Env: PORT (default 8080), HOST (default 0.0.0.0).
// Behind a reverse proxy, the core uses X-Forwarded-Host/-Proto for logged URLs.

import { createServer, type IncomingMessage } from 'node:http';
import { handle, logLine } from '../core.ts';
import redirects from '../redirects.generated.ts';

function toRequest(req: IncomingMessage): Request {
  const host = req.headers.host ?? 'localhost';
  const headers = new Headers();
  for (const [k, v] of Object.entries(req.headers)) {
    if (v === undefined) continue;
    headers.set(k, Array.isArray(v) ? v.join(', ') : v);
  }
  return new Request(`http://${host}${req.url ?? '/'}`, { method: req.method, headers });
}

const server = createServer(async (req, res) => {
  let request: Request;
  try {
    request = toRequest(req);
  } catch {
    res.writeHead(400).end();
    return;
  }
  const { response, event } = handle(request, redirects);
  res.writeHead(response.status, Object.fromEntries(response.headers));
  res.end(req.method === 'HEAD' ? undefined : await response.text());
  if (event) process.stdout.write(logLine(event) + '\n');
});

const port = Number(process.env.PORT ?? 8080);
const host = process.env.HOST ?? '0.0.0.0';
server.listen(port, host, () => {
  console.error(`quickshort listening on http://${host}:${port} with ${Object.keys(redirects).length} redirects`);
});

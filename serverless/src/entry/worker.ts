// Cloudflare Workers entry. console.log output goes to Workers Logs (enable
// observability in wrangler.toml). Logging is synchronous and cheap, so
// nothing needs ctx.waitUntil.

import { handle, logLine } from '../core.ts';
import redirects from '../redirects.generated.ts';

export default {
  fetch(request: Request): Response {
    const { response, event } = handle(request, redirects);
    if (event) console.log(logLine(event));
    return response;
  },
};

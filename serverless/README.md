# quickshort, serverless

A port of `quickshort.py` to a single TypeScript request handler that runs on AWS Lambda, Cloudflare Workers, or plain Node (self-hosted). No runtime dependencies; dev dependencies are TypeScript, Node types, and the AWS SDK (types only — the Lambda runtime provides the SDK).

## How it fits together

- `redirects/` holds the redirects, one file per key, as before. They're compiled into the bundle at build time, so changing a redirect means redeploying.
- `src/core.ts` is the whole app: `handle(Request, redirects) → { response, event }`. It has no platform code.
- `src/entry/*.ts` adapt it to each platform: `node.ts` (node:http server), `lambda.ts` (Function URL / API Gateway v2 events), `worker.ts` (Cloudflare Workers). Each one writes the hit event to stdout as one JSON line.
- The platform's log service captures stdout outside the request path, so logging doesn't slow redirects down. A per-platform export job copies hit events into object storage for long-term stats. `src/export/aws.ts` does this for AWS (CloudWatch Logs → hourly JSON-lines files in S3). `src/export/windows.ts` holds the platform-neutral parts.

Hit event format, one per line:

```json
{"quickshort":"hit","t":"2026-11-04T19:10:06.000Z","key":"foobar","url":"https://go.example.edu/Foo-Bar?x=1","referer":""}
```

Misses use `"key":"_404"`, as before.

## Development

Requires Node 22.18 or newer (runs TypeScript directly).

```sh
npm install
npm test              # unit + parity tests
npm run typecheck
npm start             # local server on :8080 using ./redirects
```

`test/parity-expected.json` is the original Flask app's output for every case in `test/parity-cases.json`; the tests assert the port matches it. To regenerate after adding cases, install Flask 2.2 and run `python test/parity_flask.py`.

## Deploying

**AWS Lambda** (SAM, `template.yaml`): `npm run build && sam deploy --guided`. Creates the redirect function with a Function URL, its log group (30-day retention by default), an S3 bucket, and the hourly export function. For a custom domain, put CloudFront or an API Gateway HTTP API with an ACM certificate in front; Function URLs don't support custom domains.

**Cloudflare Workers** (`wrangler.toml`): `npm run redirects && npx wrangler deploy`. Hit events land in Workers Logs, which only keeps a few days. There's no Workers export job yet.

**Self-hosted** (`Dockerfile`): `docker build -t quickshort . && docker run -p 8080:8080 quickshort >> hits.jsonl`. Or skip Docker: `npm start >> hits.jsonl`. Put it behind a reverse proxy that sets `X-Forwarded-Proto`.

## Stats

The export files are JSON lines, so anything that reads those works. With DuckDB:

```sql
select key, count(*) as hits
from read_json('s3://BUCKET/hits/**/*.jsonl')
group by key order by hits desc;
```

For a self-hosted `hits.jsonl`: `jq -r .key hits.jsonl | sort | uniq -c`.

## Differences from the Flask app

- The referer is recorded. The Flask app looked up `HTTP_REFERER` as a header name, so it always logged an empty referer.
- No `/<key>/hits` or `/<key>/log` endpoints. Those URLs still return 404 without logging, as they did with `SERVE_LOGS` unset.
- Hit counts come from counting log events rather than a counter file, so concurrent hits can't lose counts.
- Timestamps are `Date.toISOString()` (millisecond precision, `Z` suffix) instead of Python's naive `isoformat()`.
- Invalid redirect files fail the build instead of failing on request.
- 404 and 405 bodies are plain text, and `OPTIONS` returns 405 instead of Flask's automatic 200.

## Not yet verified

The SAM template passes `cfn-lint` and the export job is tested with stubbed AWS clients, but neither has been deployed to a real account. The Docker image hasn't been built; the same commands it runs were tested directly. The Worker was run locally with `wrangler dev`.

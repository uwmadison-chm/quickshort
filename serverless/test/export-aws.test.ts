// Exercises the AWS exporter end to end with the SDK clients stubbed out.
import assert from 'node:assert/strict';
import { mock, test } from 'node:test';
import { CloudWatchLogsClient } from '@aws-sdk/client-cloudwatch-logs';
import { NoSuchKey, S3Client } from '@aws-sdk/client-s3';

test('exports complete hours to S3 and advances the watermark', async (t) => {
  const now = Date.parse('2026-11-04T21:15:00Z');
  t.mock.timers.enable({ apis: ['Date'], now });
  process.env.LOG_GROUP = 'lg';
  process.env.BUCKET = 'bkt';
  process.env.START = '2026-11-04T19:00:00Z';

  const hit = (t: string, key: string) => JSON.stringify({ quickshort: 'hit', t, key, url: 'u', referer: '' });
  const filterCalls: any[] = [];
  mock.method(CloudWatchLogsClient.prototype, 'send', async (cmd: any) => {
    filterCalls.push(cmd.input);
    const start = new Date(cmd.input.startTime).toISOString();
    if (start === '2026-11-04T19:00:00.000Z') {
      // Two pages for the first hour.
      if (!cmd.input.nextToken) return { events: [{ message: hit('2026-11-04T19:05:00.000Z', 'a') }], nextToken: 'p2' };
      return { events: [{ message: hit('2026-11-04T19:01:00.000Z', 'b') }] };
    }
    return { events: [] };
  });
  const puts: Record<string, string> = {};
  mock.method(S3Client.prototype, 'send', async (cmd: any) => {
    if (cmd.constructor.name === 'GetObjectCommand') {
      if (puts[cmd.input.Key]) return { Body: { transformToString: async () => puts[cmd.input.Key] } };
      throw new NoSuchKey({ message: 'no', $metadata: {} });
    }
    puts[cmd.input.Key] = cmd.input.Body;
    return {};
  });

  const { handler } = await import('../src/export/aws.ts');
  const result = await handler();

  // 19:00 and 20:00 are complete; 21:00 isn't.
  assert.deepEqual(result, { exported: 2, windows: 2 });
  assert.equal(filterCalls[0].filterPattern, '{ $.quickshort = "hit" }');
  assert.deepEqual(Object.keys(puts).sort(), ['hits/2026/11/04/19.jsonl', 'hits/_watermark.json']);
  assert.match(puts['hits/2026/11/04/19.jsonl'], /^\{.*"key":"b".*\}\n\{.*"key":"a".*\}\n$/);
  assert.equal(JSON.parse(puts['hits/_watermark.json']).watermark, '2026-11-04T21:00:00.000Z');

  // A second run in the same hour has nothing to do.
  assert.deepEqual(await handler(), { exported: 0, windows: 0 });
});

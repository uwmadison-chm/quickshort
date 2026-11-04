// Scheduled Lambda: copy hit events from the redirect function's CloudWatch
// log group into S3 as one JSON-lines file per hour. Runs on a schedule (see
// template.yaml). The AWS SDK v3 is provided by the Lambda Node.js runtime,
// so it is only a devDependency here.
//
// Env:
//   LOG_GROUP  CloudWatch log group of the redirect function
//   BUCKET     destination bucket
//   PREFIX     key prefix (default "hits/")
//   START      ISO time to start from on first run (default: 24 hours ago)

import { CloudWatchLogsClient, FilterLogEventsCommand } from '@aws-sdk/client-cloudwatch-logs';
import { GetObjectCommand, PutObjectCommand, S3Client, NoSuchKey } from '@aws-sdk/client-s3';
import { objectKey, pendingWindows, toJsonl, type Window } from './windows.ts';

const logs = new CloudWatchLogsClient({});
const s3 = new S3Client({});

const LOG_GROUP = requireEnv('LOG_GROUP');
const BUCKET = requireEnv('BUCKET');
const PREFIX = process.env.PREFIX ?? 'hits/';
const WATERMARK_KEY = `${PREFIX}_watermark.json`;

export async function handler(): Promise<{ exported: number; windows: number }> {
  let watermark = await readWatermark();
  const windows = pendingWindows(watermark, Date.now());
  let exported = 0;
  for (const w of windows) {
    const body = toJsonl(await Array.fromAsync(fetchMessages(w)));
    if (body) {
      await s3.send(
        new PutObjectCommand({ Bucket: BUCKET, Key: objectKey(PREFIX, w), Body: body, ContentType: 'application/x-ndjson' }),
      );
      exported += body.split('\n').length - 1;
    }
    watermark = w.end;
    await writeWatermark(watermark);
  }
  console.log(JSON.stringify({ exported, windows: windows.length, watermark: new Date(watermark).toISOString() }));
  return { exported, windows: windows.length };
}

async function* fetchMessages(w: Window): AsyncGenerator<string> {
  let nextToken: string | undefined;
  do {
    const page = await logs.send(
      new FilterLogEventsCommand({
        logGroupName: LOG_GROUP,
        startTime: w.start,
        endTime: w.end - 1, // endTime is inclusive
        filterPattern: '{ $.quickshort = "hit" }',
        nextToken,
      }),
    );
    for (const e of page.events ?? []) if (e.message) yield e.message;
    nextToken = page.nextToken;
  } while (nextToken);
}

async function readWatermark(): Promise<number> {
  try {
    const res = await s3.send(new GetObjectCommand({ Bucket: BUCKET, Key: WATERMARK_KEY }));
    const { watermark } = JSON.parse(await res.Body!.transformToString());
    return Date.parse(watermark);
  } catch (e) {
    if (!(e instanceof NoSuchKey)) throw e;
    return process.env.START ? Date.parse(process.env.START) : Date.now() - 24 * 60 * 60 * 1000;
  }
}

async function writeWatermark(ms: number): Promise<void> {
  await s3.send(
    new PutObjectCommand({
      Bucket: BUCKET,
      Key: WATERMARK_KEY,
      Body: JSON.stringify({ watermark: new Date(ms).toISOString() }) + '\n',
      ContentType: 'application/json',
    }),
  );
}

function requireEnv(name: string): string {
  const v = process.env[name];
  if (!v) throw new Error(`${name} is required`);
  return v;
}

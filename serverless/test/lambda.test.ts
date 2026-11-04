import assert from 'node:assert/strict';
import { test } from 'node:test';
import { toRequest } from '../src/entry/lambda.ts';

test('toRequest rebuilds the URL, method and headers from a payload 2.0 event', () => {
  const req = toRequest({
    rawPath: '/Foo-Bar',
    rawQueryString: 'a=1&b=two%20words',
    headers: { host: 'go.example.edu', referer: 'https://ref.example/', 'x-forwarded-proto': 'https' },
    requestContext: { http: { method: 'GET' } },
  });
  assert.equal(req.url, 'https://go.example.edu/Foo-Bar?a=1&b=two%20words');
  assert.equal(req.method, 'GET');
  assert.equal(req.headers.get('referer'), 'https://ref.example/');
});

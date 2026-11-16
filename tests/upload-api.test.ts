import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { createApiApp, resetRateLimiter, type VerifyAuthTokenFn } from '../server.ts';

const VALID_TINY_PNG_BASE64 =
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aF2cAAAAASUVORK5CYII=';

// Minimal valid 12+ byte WebP RIFF header
const VALID_TINY_WEBP_BASE64 = Buffer.from([
  0x52, 0x49, 0x46, 0x46, 0x1a, 0x00, 0x00, 0x00, 0x57, 0x45, 0x42, 0x50, 0x56, 0x50, 0x38, 0x20,
]).toString('base64');

const mockVerifyToken: VerifyAuthTokenFn = async (token) => {
  if (token === 'valid-verified-token') {
    return { uid: 'citizen_123', email: 'citizen@example.com', emailVerified: true };
  }
  if (token === 'unverified-token') {
    return { uid: 'citizen_unverified', email: 'unverified@example.com', emailVerified: false };
  }
  return null;
};

async function startUploadTestServer() {
  resetRateLimiter();
  const tempUploadsDir = await fs.mkdtemp(path.join(os.tmpdir(), 'raasta-uploads-test-'));
  const app = createApiApp(undefined, {
    uploadsDir: tempUploadsDir,
    verifyAuthToken: mockVerifyToken,
  });
  const server = http.createServer(app);
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const address = server.address();
  if (!address || typeof address === 'string') {
    throw new Error('Failed to bind ephemeral test port');
  }
  return {
    baseUrl: `http://127.0.0.1:${address.port}`,
    tempUploadsDir,
    close: async () => {
      await new Promise<void>((resolve, reject) =>
        server.close((e) => (e ? reject(e) : resolve())),
      );
      await fs.rm(tempUploadsDir, { recursive: true, force: true });
    },
  };
}

test('POST /api/upload-image enforces authentication and email verification', async () => {
  const { baseUrl, close } = await startUploadTestServer();
  try {
    const noAuthRes = await fetch(`${baseUrl}/api/upload-image`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        folder: 'reports',
        reportId: 'rep_12345',
        imageBase64: VALID_TINY_PNG_BASE64,
        mimeType: 'image/png',
      }),
    });
    assert.equal(noAuthRes.status, 401);

    const badTokenRes = await fetch(`${baseUrl}/api/upload-image`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: 'Bearer invalid-token',
      },
      body: JSON.stringify({
        folder: 'reports',
        reportId: 'rep_12345',
        imageBase64: VALID_TINY_PNG_BASE64,
        mimeType: 'image/png',
      }),
    });
    assert.equal(badTokenRes.status, 401);

    const unverifiedRes = await fetch(`${baseUrl}/api/upload-image`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: 'Bearer unverified-token',
      },
      body: JSON.stringify({
        folder: 'reports',
        reportId: 'rep_12345',
        imageBase64: VALID_TINY_PNG_BASE64,
        mimeType: 'image/png',
      }),
    });
    assert.equal(unverifiedRes.status, 403);
  } finally {
    await close();
  }
});

test('POST /api/upload-image rejects path traversal, invalid folders, and spoofed image bytes', async () => {
  const { baseUrl, close } = await startUploadTestServer();
  try {
    const badFolder = await fetch(`${baseUrl}/api/upload-image`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: 'Bearer valid-verified-token',
      },
      body: JSON.stringify({
        folder: 'etc',
        reportId: 'rep_12345',
        imageBase64: VALID_TINY_PNG_BASE64,
        mimeType: 'image/png',
      }),
    });
    assert.equal(badFolder.status, 400);

    const badReportId = await fetch(`${baseUrl}/api/upload-image`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: 'Bearer valid-verified-token',
      },
      body: JSON.stringify({
        folder: 'reports',
        reportId: '../escape',
        imageBase64: VALID_TINY_PNG_BASE64,
        mimeType: 'image/png',
      }),
    });
    assert.equal(badReportId.status, 400);

    const spoofedHtml = Buffer.from('<script>alert(1)</script>').toString('base64');
    const spoofedRes = await fetch(`${baseUrl}/api/upload-image`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: 'Bearer valid-verified-token',
      },
      body: JSON.stringify({
        folder: 'reports',
        reportId: 'rep_12345',
        imageBase64: spoofedHtml,
        mimeType: 'image/jpeg',
      }),
    });
    assert.equal(spoofedRes.status, 400);
  } finally {
    await close();
  }
});

test('POST /api/upload-image stores valid PNG/WebP images and serves them via GET /api/uploads', async () => {
  const { baseUrl, close } = await startUploadTestServer();
  try {
    const uploadRes = await fetch(`${baseUrl}/api/upload-image`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: 'Bearer valid-verified-token',
      },
      body: JSON.stringify({
        folder: 'reports',
        reportId: 'rep_1700000_ab12',
        imageBase64: VALID_TINY_PNG_BASE64,
        mimeType: 'image/png',
      }),
    });
    assert.equal(uploadRes.status, 201);
    const body = (await uploadRes.json()) as { url: string; provider: string };
    assert.match(body.url, /^\/api\/uploads\/reports\/rep_1700000_ab12_\d+_[a-f0-9]+\.png$/);
    assert.equal(body.provider, 'server-fallback');
    assert.ok(body.url.length >= 10 && body.url.length <= 2000);

    const getRes = await fetch(`${baseUrl}${body.url}`);
    assert.equal(getRes.status, 200);
    assert.equal(getRes.headers.get('content-type'), 'image/png');
    assert.equal(getRes.headers.get('x-content-type-options'), 'nosniff');
    const fetchedBuf = Buffer.from(await getRes.arrayBuffer());
    assert.deepEqual(fetchedBuf, Buffer.from(VALID_TINY_PNG_BASE64, 'base64'));

    const webpRes = await fetch(`${baseUrl}/api/upload-image`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: 'Bearer valid-verified-token',
      },
      body: JSON.stringify({
        folder: 'resolutions',
        reportId: 'rep_1700000_ab12',
        imageBase64: VALID_TINY_WEBP_BASE64,
        mimeType: 'image/webp',
      }),
    });
    assert.equal(webpRes.status, 201);
    const webpBody = (await webpRes.json()) as { url: string };
    assert.match(webpBody.url, /^\/api\/uploads\/resolutions\/.+\.webp$/);

    const traversalRes = await fetch(`${baseUrl}/api/uploads/reports/..%2Fsecret.png`);
    assert.equal(traversalRes.status, 404);
  } finally {
    await close();
  }
});

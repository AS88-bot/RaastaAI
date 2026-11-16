import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import http from 'node:http';
import path from 'node:path';
import test from 'node:test';
import { createApiApp, resetRateLimiter, SAFE_VERCEL_REQUEST_BYTES } from '../server.ts';

const VALID_TINY_PNG_BASE64 =
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aF2cAAAAASUVORK5CYII=';

async function startTestServer() {
  resetRateLimiter();
  const app = createApiApp();
  const server = http.createServer(app);
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const address = server.address();
  if (!address || typeof address === 'string') {
    throw new Error('Failed to bind ephemeral test port');
  }
  return {
    baseUrl: `http://127.0.0.1:${address.port}`,
    close: () =>
      new Promise<void>((resolve, reject) => server.close((err) => (err ? reject(err) : resolve()))),
  };
}

test('importing Vercel handler api/[...path].ts does not call listen() and handles /api routes including nested /api/uploads', async () => {
  const originalListen = http.Server.prototype.listen;
  let listenCalledOnImport = false;
  http.Server.prototype.listen = function (this: http.Server, ...args: unknown[]) {
    listenCalledOnImport = true;
    return originalListen.apply(this, args as Parameters<typeof originalListen>);
  } as typeof http.Server.prototype.listen;

  let vercelHandler: http.RequestListener;
  try {
    const mod = await import('../api/[...path].ts');
    vercelHandler = mod.default as unknown as http.RequestListener;
    assert.equal(typeof vercelHandler, 'function');
    assert.equal(listenCalledOnImport, false);
  } finally {
    http.Server.prototype.listen = originalListen;
  }

  const prevSecret = process.env.GEMINI_API_KEY;
  process.env.GEMINI_API_KEY = 'AIzaTestSecretShouldNeverLeakToBrowser';
  const server = http.createServer(vercelHandler);
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const address = server.address();
  if (!address || typeof address === 'string') {
    throw new Error('Failed to bind ephemeral test port');
  }
  const baseUrl = `http://127.0.0.1:${address.port}`;

  try {
    const healthRes = await fetch(`${baseUrl}/api/health`);
    assert.equal(healthRes.status, 200);
    const healthBody = (await healthRes.json()) as { ok: boolean; geminiConfigured: boolean };
    assert.equal(healthBody.ok, true);
    assert.equal(healthBody.geminiConfigured, true);

    const cfgRes = await fetch(`${baseUrl}/api/public-config`);
    assert.equal(cfgRes.status, 200);
    const cfgText = await cfgRes.text();
    assert.ok(!cfgText.includes('AIzaTestSecretShouldNeverLeakToBrowser'));
    const cfgBody = JSON.parse(cfgText) as { geminiConfigured: boolean; mapsConfigured: boolean };
    assert.equal(cfgBody.geminiConfigured, true);
    assert.equal(typeof cfgBody.mapsConfigured, 'boolean');

    // Nested /api/uploads route is handled by the catch-all Express app
    const nestedRes = await fetch(`${baseUrl}/api/uploads/reports/nonexistent_1234.jpg`);
    assert.equal(nestedRes.status, 404);
    const nestedJson = (await nestedRes.json()) as { error: string };
    assert.equal(nestedJson.error, 'Image not found.');
  } finally {
    if (prevSecret === undefined) {
      delete process.env.GEMINI_API_KEY;
    } else {
      process.env.GEMINI_API_KEY = prevSecret;
    }
    await new Promise<void>((resolve, reject) =>
      server.close((err) => (err ? reject(err) : resolve())),
    );
  }
});

test('POST /api/analyze-report enforces the 4 MB Vercel request budget cleanly', async () => {
  const { baseUrl, close } = await startTestServer();
  try {
    // 4.1 MB oversized body exceeds Express 4 MB limit
    const oversizedPayload = JSON.stringify({
      imageBase64: 'A'.repeat(SAFE_VERCEL_REQUEST_BYTES + 100_000),
      imageMimeType: 'image/png',
      language: 'en',
    });
    const res = await fetch(`${baseUrl}/api/analyze-report`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: oversizedPayload,
    });
    assert.equal(res.status, 413);
    const body = (await res.json()) as { error: string };
    assert.match(body.error, /4 MB/i);

    // Combined image + audio under 4 MB Express parser but exceeding per-media / combined budget
    const oversizedCombined = JSON.stringify({
      imageBase64: 'A'.repeat(3_500_000),
      imageMimeType: 'image/jpeg',
      audioBase64: 'A'.repeat(1_400_000),
      audioMimeType: 'audio/webm',
      language: 'en',
    });
    const resCombined = await fetch(`${baseUrl}/api/analyze-report`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: oversizedCombined,
    });
    assert.ok(resCombined.status === 413 || resCombined.status === 400);
  } finally {
    await close();
  }
});

test('POST /api/upload-image disables local disk fallback in production runtimes', async () => {
  const prevVercel = process.env.VERCEL;
  process.env.VERCEL = '1';
  const { baseUrl, close } = await startTestServer();
  try {
    const res = await fetch(`${baseUrl}/api/upload-image`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: 'Bearer any-token',
      },
      body: JSON.stringify({
        folder: 'reports',
        reportId: 'rep_prod_check',
        imageBase64: VALID_TINY_PNG_BASE64,
        mimeType: 'image/png',
      }),
    });
    assert.equal(res.status, 503);
    const body = (await res.json()) as { error: string };
    assert.match(body.error, /Firebase Storage/i);
  } finally {
    if (prevVercel === undefined) {
      delete process.env.VERCEL;
    } else {
      process.env.VERCEL = prevVercel;
    }
    await close();
  }
});

test('vercel.json configures Vite preset, dist output, SPA rewrites for all app routes, and excludes /api/*', async () => {
  const vercelRaw = await fs.readFile(path.resolve(process.cwd(), 'vercel.json'), 'utf8');
  const vercelConfig = JSON.parse(vercelRaw) as {
    framework: string;
    buildCommand: string;
    outputDirectory: string;
    rewrites: Array<{ source: string; destination: string }>;
  };

  assert.equal(vercelConfig.framework, 'vite');
  assert.equal(vercelConfig.buildCommand, 'npm run build');
  assert.equal(vercelConfig.outputDirectory, 'dist');
  assert.ok(vercelConfig.rewrites.length >= 1);

  const spaRewrite = vercelConfig.rewrites.find((r) => r.destination === '/index.html');
  assert.ok(spaRewrite, 'Missing SPA rewrite to /index.html');

  // Convert Vercel source pattern "/((?!api(?:/|$)).*)" to JS RegExp
  assert.equal(spaRewrite.source, '/((?!api(?:/|$)).*)');
  const regex = new RegExp(`^${spaRewrite.source}$`);

  const spaRoutes = ['/', '/dashboard', '/report', '/map', '/feed', '/insights', '/admin', '/reports/rep_123'];
  for (const route of spaRoutes) {
    assert.ok(regex.test(route), `Expected SPA route ${route} to rewrite to /index.html`);
  }

  const apiRoutes = [
    '/api/health',
    '/api/public-config',
    '/api/analyze-report',
    '/api/weekly-summary',
    '/api/upload-image',
    '/api/uploads/reports/photo.jpg',
    '/api/uploads/resolutions/photo.webp',
  ];
  for (const apiRoute of apiRoutes) {
    assert.equal(regex.test(apiRoute), false, `API route ${apiRoute} must NOT rewrite to /index.html`);
  }

  // Verify SPA routes exist in src/App.tsx
  const appSource = await fs.readFile(path.resolve(process.cwd(), 'src/App.tsx'), 'utf8');
  for (const route of ['/dashboard', '/report', '/map', '/feed', '/insights', '/admin']) {
    assert.ok(appSource.includes(`'${route}'`), `Missing route ${route} in src/App.tsx`);
  }
});

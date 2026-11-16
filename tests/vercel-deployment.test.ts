import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import http from 'node:http';
import path from 'node:path';
import test from 'node:test';
import {
  createApiApp,
  getCloudUploadProvider,
  resetRateLimiter,
  SAFE_VERCEL_REQUEST_BYTES,
} from '../server.ts';

const VALID_TINY_PNG_BASE64 =
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aF2cAAAAASUVORK5CYII=';

async function startTestServer(options?: Parameters<typeof createApiApp>[1]) {
  resetRateLimiter();
  const app = createApiApp(undefined, options);
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
    const indexMod = await import('../api/index.ts');
    const catchAllMod = await import('../api/[...path].ts');
    vercelHandler = indexMod.default as unknown as http.RequestListener;
    assert.equal(typeof vercelHandler, 'function');
    assert.equal(catchAllMod.default, indexMod.default);
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

test('POST /api/upload-image disables local disk fallback on Vercel unless cloud storage is configured, and never leaks secrets', async () => {
  const prevVercel = process.env.VERCEL;
  const prevBlob = process.env.BLOB_READ_WRITE_TOKEN;
  const prevCloudName = process.env.CLOUDINARY_CLOUD_NAME;
  const prevCloudKey = process.env.CLOUDINARY_API_KEY;
  const prevCloudSecret = process.env.CLOUDINARY_API_SECRET;

  delete process.env.BLOB_READ_WRITE_TOKEN;
  delete process.env.CLOUDINARY_CLOUD_NAME;
  delete process.env.CLOUDINARY_API_KEY;
  delete process.env.CLOUDINARY_API_SECRET;
  process.env.VERCEL = '1';

  const vercelUnconfigured = await startTestServer();
  try {
    const cfgRes = await fetch(`${vercelUnconfigured.baseUrl}/api/public-config`);
    assert.equal(cfgRes.status, 200);
    const cfg = (await cfgRes.json()) as {
      localUploadFallbackEnabled: boolean;
      cloudUploadFallbackEnabled: boolean;
      cloudUploadProvider: string | null;
    };
    assert.equal(cfg.localUploadFallbackEnabled, false);
    assert.equal(cfg.cloudUploadFallbackEnabled, false);
    assert.equal(cfg.cloudUploadProvider, null);

    const res = await fetch(`${vercelUnconfigured.baseUrl}/api/upload-image`, {
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
    assert.match(body.error, /Vercel Blob/i);
  } finally {
    await vercelUnconfigured.close();
  }

  // Verify cloud upload on Vercel (no local disk write)
  let cloudCalls = 0;
  const vercelCloud = await startTestServer({
    verifyAuthToken: async (token) =>
      token === 'valid-citizen'
        ? { uid: 'citizen_vercel_1', email: 'citizen@example.com', emailVerified: true }
        : null,
    uploadToCloud: async ({ folder, uid, filename, mimeType }) => {
      cloudCalls += 1;
      assert.equal(folder, 'reports');
      assert.equal(uid, 'citizen_vercel_1');
      assert.equal(mimeType, 'image/png');
      assert.match(filename, /^rep_blob_1_\d+_[a-f0-9]+\.png$/);
      return {
        url: `https://example.public.blob.vercel-storage.com/raasta/${folder}/${uid}/${filename}`,
        provider: 'vercel-blob',
      };
    },
  });

  try {
    const cfgRes = await fetch(`${vercelCloud.baseUrl}/api/public-config`);
    assert.equal(cfgRes.status, 200);
    const cfg = (await cfgRes.json()) as {
      localUploadFallbackEnabled: boolean;
      cloudUploadFallbackEnabled: boolean;
      cloudUploadProvider: string | null;
    };
    assert.equal(cfg.localUploadFallbackEnabled, false);
    assert.equal(cfg.cloudUploadFallbackEnabled, true);
    assert.equal(cfg.cloudUploadProvider, 'vercel-blob');

    const uploadRes = await fetch(`${vercelCloud.baseUrl}/api/upload-image`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: 'Bearer valid-citizen',
      },
      body: JSON.stringify({
        folder: 'reports',
        reportId: 'rep_blob_1',
        imageBase64: VALID_TINY_PNG_BASE64,
        mimeType: 'image/png',
      }),
    });
    assert.equal(uploadRes.status, 201);
    const uploadJson = (await uploadRes.json()) as { url: string; provider: string };
    assert.equal(cloudCalls, 1);
    assert.equal(uploadJson.provider, 'vercel-blob');
    assert.match(uploadJson.url, /^https:\/\/.*blob\.vercel-storage\.com\//);
  } finally {
    await vercelCloud.close();
  }

  // Verify provider env detection & zero secret leakage
  process.env.BLOB_READ_WRITE_TOKEN = 'vercel_blob_rw_SECRET_TOKEN_VALUE';
  assert.equal(getCloudUploadProvider(), 'vercel-blob');
  const blobEnvServer = await startTestServer();
  try {
    const cfgText = await (await fetch(`${blobEnvServer.baseUrl}/api/public-config`)).text();
    assert.ok(!cfgText.includes('vercel_blob_rw_SECRET_TOKEN_VALUE'));
    const cfg = JSON.parse(cfgText) as {
      cloudUploadFallbackEnabled: boolean;
      cloudUploadProvider: string | null;
    };
    assert.equal(cfg.cloudUploadFallbackEnabled, true);
    assert.equal(cfg.cloudUploadProvider, 'vercel-blob');
  } finally {
    await blobEnvServer.close();
    delete process.env.BLOB_READ_WRITE_TOKEN;
  }

  process.env.CLOUDINARY_CLOUD_NAME = 'demo-cloud';
  process.env.CLOUDINARY_API_KEY = '1234567890';
  process.env.CLOUDINARY_API_SECRET = 'CLOUDINARY_TOP_SECRET_VALUE';
  assert.equal(getCloudUploadProvider(), 'cloudinary');
  const cloudEnvServer = await startTestServer();
  try {
    const cfgText = await (await fetch(`${cloudEnvServer.baseUrl}/api/public-config`)).text();
    assert.ok(!cfgText.includes('CLOUDINARY_TOP_SECRET_VALUE'));
    assert.ok(!cfgText.includes('1234567890'));
    const cfg = JSON.parse(cfgText) as {
      cloudUploadFallbackEnabled: boolean;
      cloudUploadProvider: string | null;
    };
    assert.equal(cfg.cloudUploadFallbackEnabled, true);
    assert.equal(cfg.cloudUploadProvider, 'cloudinary');
  } finally {
    await cloudEnvServer.close();
  }

  // Shared App / non-Vercel mode preserves localUploadFallbackEnabled: true
  delete process.env.VERCEL;
  delete process.env.CLOUDINARY_CLOUD_NAME;
  delete process.env.CLOUDINARY_API_KEY;
  delete process.env.CLOUDINARY_API_SECRET;
  const sharedServer = await startTestServer();
  try {
    const cfgRes = await fetch(`${sharedServer.baseUrl}/api/public-config`);
    assert.equal(cfgRes.status, 200);
    const cfg = (await cfgRes.json()) as { localUploadFallbackEnabled: boolean };
    assert.equal(cfg.localUploadFallbackEnabled, true);
  } finally {
    if (prevVercel !== undefined) process.env.VERCEL = prevVercel;
    else delete process.env.VERCEL;
    if (prevBlob !== undefined) process.env.BLOB_READ_WRITE_TOKEN = prevBlob;
    else delete process.env.BLOB_READ_WRITE_TOKEN;
    if (prevCloudName !== undefined) process.env.CLOUDINARY_CLOUD_NAME = prevCloudName;
    else delete process.env.CLOUDINARY_CLOUD_NAME;
    if (prevCloudKey !== undefined) process.env.CLOUDINARY_API_KEY = prevCloudKey;
    else delete process.env.CLOUDINARY_API_KEY;
    if (prevCloudSecret !== undefined) process.env.CLOUDINARY_API_SECRET = prevCloudSecret;
    else delete process.env.CLOUDINARY_API_SECRET;
    await sharedServer.close();
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
  assert.ok(vercelConfig.rewrites.length >= 2);

  const apiRewriteIdx = vercelConfig.rewrites.findIndex(
    (r) => r.source === '/api/(.*)' && r.destination === '/api',
  );
  const spaRewriteIdx = vercelConfig.rewrites.findIndex((r) => r.destination === '/index.html');
  assert.ok(apiRewriteIdx >= 0, 'Missing explicit /api/(.*) -> /api rewrite for Vercel Vite builds');
  assert.ok(spaRewriteIdx > apiRewriteIdx, 'SPA rewrite must come after /api/(.*) rewrite');

  const spaRewrite = vercelConfig.rewrites[spaRewriteIdx];
  const apiRegex = new RegExp(`^${vercelConfig.rewrites[apiRewriteIdx].source}$`);

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
    assert.ok(apiRegex.test(apiRoute), `API route ${apiRoute} must match /api/(.*) rewrite`);
    assert.equal(regex.test(apiRoute), false, `API route ${apiRoute} must NOT rewrite to /index.html`);
  }

  // Verify SPA routes exist in src/App.tsx
  const appSource = await fs.readFile(path.resolve(process.cwd(), 'src/App.tsx'), 'utf8');
  for (const route of ['/dashboard', '/report', '/map', '/feed', '/insights', '/admin']) {
    assert.ok(appSource.includes(`'${route}'`), `Missing route ${route} in src/App.tsx`);
  }
});

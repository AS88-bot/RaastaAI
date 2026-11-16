import assert from 'node:assert/strict';
import http from 'node:http';
import test from 'node:test';
import type { GoogleGenAI } from '@google/genai';
import { createApiApp, mapGeminiError, resetRateLimiter } from '../server.ts';

const VALID_TINY_PNG_BASE64 =
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aF2cAAAAASUVORK5CYII=';

async function startTestServer(mockAi?: Partial<GoogleGenAI>) {
  resetRateLimiter();
  const app = createApiApp(mockAi as GoogleGenAI | undefined);
  const server = http.createServer(app);
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const address = server.address();
  if (!address || typeof address === 'string') {
    throw new Error('Failed to bind ephemeral port');
  }
  const baseUrl = `http://127.0.0.1:${address.port}`;
  return {
    baseUrl,
    close: () => new Promise<void>((resolve, reject) => server.close((e) => (e ? reject(e) : resolve()))),
  };
}

test('mapGeminiError maps missing key, 400, 403, 429, 404, 503, 504, and invalid JSON accurately', () => {
  assert.equal(mapGeminiError(new Error('GEMINI_API_KEY_MISSING')).status, 503);
  assert.equal(mapGeminiError(new Error('INVALID_ARGUMENT (400)')).status, 400);
  assert.equal(mapGeminiError(new Error('PERMISSION_DENIED: invalid key')).status, 403);
  assert.equal(mapGeminiError(new Error('RESOURCE_EXHAUSTED (429)')).status, 429);
  assert.equal(mapGeminiError(new Error('NOT_FOUND (404)')).status, 502);
  assert.equal(mapGeminiError(new Error('UNAVAILABLE (503)')).status, 503);
  assert.equal(mapGeminiError(new Error('DEADLINE_EXCEEDED')).status, 504);
  assert.equal(mapGeminiError(new Error('GEMINI_INVALID_JSON')).status, 502);
  assert.equal(mapGeminiError(new Error('unexpected failure')).status, 500);
});

test('POST /api/analyze-report rejects invalid MIME types, short base64, and unsupported language', async () => {
  const { baseUrl, close } = await startTestServer();
  try {
    // 1. Invalid image MIME type
    const badMime = await fetch(`${baseUrl}/api/analyze-report`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        imageBase64: VALID_TINY_PNG_BASE64,
        imageMimeType: 'image/gif',
        language: 'en',
      }),
    });
    assert.equal(badMime.status, 400);

    // 2. Non-base64 corrupted string
    const badB64 = await fetch(`${baseUrl}/api/analyze-report`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        imageBase64: 'not-valid-base64!@#$%^&*()_+=not-valid-base64',
        imageMimeType: 'image/png',
        language: 'en',
      }),
    });
    assert.equal(badB64.status, 400);

    // 3. Unsupported language
    const badLang = await fetch(`${baseUrl}/api/analyze-report`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        imageBase64: VALID_TINY_PNG_BASE64,
        imageMimeType: 'image/png',
        language: 'fr',
      }),
    });
    assert.equal(badLang.status, 400);
  } finally {
    await close();
  }
});

test('POST /api/analyze-report returns 503 when GEMINI_API_KEY is absent', async () => {
  const prevKey = process.env.GEMINI_API_KEY;
  delete process.env.GEMINI_API_KEY;
  const { baseUrl, close } = await startTestServer();
  try {
    const res = await fetch(`${baseUrl}/api/analyze-report`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        imageBase64: VALID_TINY_PNG_BASE64,
        imageMimeType: 'image/png',
        language: 'te',
      }),
    });
    assert.equal(res.status, 503);
    const body = (await res.json()) as { error: string };
    assert.match(body.error, /GEMINI_API_KEY/i);
  } finally {
    if (prevKey !== undefined) process.env.GEMINI_API_KEY = prevKey;
    await close();
  }
});

test('POST /api/analyze-report returns 502 on malformed JSON or Zod schema violation from model', async () => {
  const malformedAi = {
    models: {
      generateContent: async () => ({ text: 'not valid json {{{' }),
    },
  } as unknown as Partial<GoogleGenAI>;

  const server1 = await startTestServer(malformedAi);
  try {
    const res = await fetch(`${server1.baseUrl}/api/analyze-report`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        imageBase64: VALID_TINY_PNG_BASE64,
        imageMimeType: 'image/png',
        language: 'en',
      }),
    });
    assert.equal(res.status, 502);
  } finally {
    await server1.close();
  }

  const badSchemaAi = {
    models: {
      generateContent: async () => ({
        text: JSON.stringify({
          suggestedCategory: 'invalid_category',
          conciseTitle: 'Test',
          conciseDescription: 'A valid length description string here.',
          visibleEvidence: ['crack'],
          suggestedPriority: 'High',
          priorityReasoning: 'Near school gate',
          confidence: 4.5, // invalid > 1
          needsClarification: false,
          clarificationQuestion: '',
          possibleDuplicateIndicators: 'None',
          generatedComplaint: 'Formal civic complaint draft text.',
        }),
      }),
    },
  } as unknown as Partial<GoogleGenAI>;

  const server2 = await startTestServer(badSchemaAi);
  try {
    const res = await fetch(`${server2.baseUrl}/api/analyze-report`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        imageBase64: VALID_TINY_PNG_BASE64,
        imageMimeType: 'image/png',
        language: 'en',
      }),
    });
    assert.equal(res.status, 502);
  } finally {
    await server2.close();
  }
});

test('POST /api/analyze-report handles multimodal image + audio MIME normalization and valid JSON output', async () => {
  let capturedPartsCount = 0;
  const validAi = {
    models: {
      generateContent: async (params: { contents: { parts: unknown[] } }) => {
        capturedPartsCount = params.contents.parts.length;
        return {
          text: JSON.stringify({
            suggestedCategory: 'pothole',
            conciseTitle: 'Deep pothole near Madhapur metro pillar',
            conciseDescription: 'A water-filled asphalt depression spans the left lane.',
            visibleEvidence: ['Broken asphalt edges', 'Standing rainwater inside cavity'],
            suggestedPriority: 'High',
            priorityReasoning: 'Advisory: poses risk to two-wheelers during peak commute.',
            confidence: 0.88,
            needsClarification: false,
            clarificationQuestion: '',
            possibleDuplicateIndicators: 'No close duplicate detected among recent reports.',
            generatedComplaint: 'గౌరవనీయులైన మున్సిపల్ అధికారులకు, మాదాపూర్ ప్రధాన రహదారిపై గుంతను సరిచేయవలసిందిగా కోరుతున్నాము.',
          }),
        };
      },
    },
  } as unknown as Partial<GoogleGenAI>;

  const { baseUrl, close } = await startTestServer(validAi);
  try {
    const res = await fetch(`${baseUrl}/api/analyze-report`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        imageBase64: VALID_TINY_PNG_BASE64,
        imageMimeType: 'image/png',
        audioBase64: VALID_TINY_PNG_BASE64,
        audioMimeType: 'audio/webm;codecs=opus',
        area: 'Madhapur Main Road',
        city: 'Hyderabad',
        language: 'te',
      }),
    });
    assert.equal(res.status, 200);
    assert.equal(capturedPartsCount, 3); // image + audio + prompt text
    const body = (await res.json()) as { suggestedCategory: string; analyzedAt: string };
    assert.equal(body.suggestedCategory, 'pothole');
    assert.ok(body.analyzedAt);
  } finally {
    await close();
  }
});

test('POST /api/weekly-summary rejects 0 reports and enforces rate limiting after 12 requests', async () => {
  const validSummaryAi = {
    models: {
      generateContent: async () => ({
        text: JSON.stringify({
          headline: 'Hyderabad Weekly Civic Summary',
          executiveSummary: 'Citizen reports focused on road surface potholes and drainage.',
          keyPatterns: ['Potholes account for majority of open submissions'],
          recommendedAttentionAreas: ['Madhapur Main Road'],
          dataDisclaimer: 'Generated strictly from live Firestore citizen submissions.',
        }),
      }),
    },
  } as unknown as Partial<GoogleGenAI>;

  const { baseUrl, close } = await startTestServer(validSummaryAi);
  try {
    // Empty reports check
    const emptyRes = await fetch(`${baseUrl}/api/weekly-summary`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        city: 'Hyderabad',
        totalReports: 0,
        resolvedCount: 0,
        openCount: 0,
        categoryBreakdown: [],
        topAreas: [],
        recentReports: [],
      }),
    });
    assert.equal(emptyRes.status, 400);

    // 11 valid calls (1st 400 call already counted 1 hit in rate limiter)
    for (let i = 0; i < 11; i++) {
      const okRes = await fetch(`${baseUrl}/api/weekly-summary`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          city: 'Hyderabad',
          totalReports: 2,
          resolvedCount: 1,
          openCount: 1,
          categoryBreakdown: [{ category: 'Pothole', count: 2 }],
          topAreas: [{ area: 'Madhapur, Hyderabad', count: 2 }],
          recentReports: [],
        }),
      });
      assert.equal(okRes.status, 200);
    }

    // 13th request in same 60s window must return 429
    const limitedRes = await fetch(`${baseUrl}/api/weekly-summary`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        city: 'Hyderabad',
        totalReports: 2,
        resolvedCount: 1,
        openCount: 1,
        categoryBreakdown: [{ category: 'Pothole', count: 2 }],
        topAreas: [{ area: 'Madhapur, Hyderabad', count: 2 }],
        recentReports: [],
      }),
    });
    assert.equal(limitedRes.status, 429);
  } finally {
    await close();
  }
});

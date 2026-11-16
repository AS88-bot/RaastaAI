import express, { type Express } from 'express';
import crypto from 'crypto';
import fs from 'fs';
import fsp from 'fs/promises';
import path from 'path';
import { fileURLToPath, pathToFileURL } from 'url';
import dotenv from 'dotenv';
import { GoogleGenAI, ThinkingLevel, Type } from '@google/genai';
import { z } from 'zod';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const PORT = Number(process.env.PORT || 3000);
const MODEL_NAME = 'gemini-4-hydrogen';
const MAX_MEDIA_BYTES = 5 * 1024 * 1024;
const DEFAULT_UPLOADS_DIR = path.resolve(__dirname, 'uploads');

function loadFirebaseApiKey(): string {
  try {
    const configPath = path.resolve(__dirname, 'firebase-applet-config.json');
    if (fs.existsSync(configPath)) {
      const raw = JSON.parse(fs.readFileSync(configPath, 'utf8')) as { apiKey?: string };
      return raw.apiKey || '';
    }
  } catch {
    // ignore malformed config
  }
  return '';
}

const FIREBASE_WEB_API_KEY = loadFirebaseApiKey();

export interface VerifiedFirebaseUser {
  uid: string;
  email: string;
  emailVerified: boolean;
}

export type VerifyAuthTokenFn = (idToken: string) => Promise<VerifiedFirebaseUser | null>;

export async function verifyFirebaseIdTokenViaRest(
  idToken: string,
): Promise<VerifiedFirebaseUser | null> {
  if (!idToken || !FIREBASE_WEB_API_KEY) {
    return null;
  }
  try {
    const response = await fetch(
      `https://identitytoolkit.googleapis.com/v1/accounts:lookup?key=${encodeURIComponent(FIREBASE_WEB_API_KEY)}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ idToken }),
      },
    );
    if (!response.ok) {
      return null;
    }
    const data = (await response.json()) as {
      users?: Array<{ localId?: string; email?: string; emailVerified?: boolean }>;
    };
    const user = data.users?.[0];
    if (!user?.localId) {
      return null;
    }
    return {
      uid: user.localId,
      email: user.email || '',
      emailVerified: Boolean(user.emailVerified),
    };
  } catch {
    return null;
  }
}

export function hasValidImageMagicBytes(
  buf: Buffer,
  mimeType: (typeof ALLOWED_IMAGE_MIME_TYPES)[number],
): boolean {
  if (buf.length < 12) return false;
  if (mimeType === 'image/jpeg') {
    return buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff;
  }
  if (mimeType === 'image/png') {
    return buf[0] === 0x89 && buf[1] === 0x50 && buf[2] === 0x4e && buf[3] === 0x47;
  }
  if (mimeType === 'image/webp') {
    return buf.subarray(0, 4).toString('ascii') === 'RIFF' && buf.subarray(8, 12).toString('ascii') === 'WEBP';
  }
  return false;
}

export const UploadImageInputSchema = z.object({
  folder: z.enum(['reports', 'resolutions']),
  reportId: z
    .string()
    .regex(/^[a-zA-Z0-9_-]{4,128}$/, 'Invalid report identifier.'),
  imageBase64: z
    .string()
    .min(16, 'Image payload is empty.')
    .max(8_500_000, 'Encoded image exceeds maximum allowed payload.')
    .refine((val) => isValidBase64ByteLength(val, MAX_MEDIA_BYTES), {
      message: 'Image must be valid base64 data under 5 MB.',
    }),
  mimeType: z.enum(['image/jpeg', 'image/png', 'image/webp']),
});

export const ALLOWED_IMAGE_MIME_TYPES = ['image/jpeg', 'image/png', 'image/webp'] as const;
export const ALLOWED_AUDIO_MIME_TYPES = [
  'audio/webm',
  'audio/mp4',
  'audio/mpeg',
  'audio/ogg',
  'audio/wav',
  'audio/x-m4a',
] as const;

// In-memory sliding-window rate limiter for AI endpoints
const rateWindowMs = 60_000;
const maxRequestsPerWindow = 12;
const requestHits = new Map<string, number[]>();

export function isRateLimited(ip: string, now = Date.now()): boolean {
  if (requestHits.size > 500) {
    for (const [key, hits] of requestHits.entries()) {
      if (hits.every((ts) => now - ts >= rateWindowMs)) {
        requestHits.delete(key);
      }
    }
  }
  const timestamps = (requestHits.get(ip) || []).filter((ts) => now - ts < rateWindowMs);
  if (timestamps.length >= maxRequestsPerWindow) {
    requestHits.set(ip, timestamps);
    return true;
  }
  timestamps.push(now);
  requestHits.set(ip, timestamps);
  return false;
}

export function resetRateLimiter(): void {
  requestHits.clear();
}

export function normalizeMimeType(mime: string): string {
  return mime.split(';')[0].trim().toLowerCase();
}

export function isValidBase64ByteLength(b64: string, maxBytes: number): boolean {
  if (!/^[A-Za-z0-9+/=\s]+$/.test(b64)) {
    return false;
  }
  const clean = b64.replace(/\s+/g, '');
  const approxBytes = Math.floor((clean.length * 3) / 4);
  return approxBytes > 0 && approxBytes <= maxBytes;
}

export const AnalyzeReportInputSchema = z.object({
  imageBase64: z
    .string()
    .min(32, 'Photograph data is too short or empty.')
    .max(8_500_000, 'Encoded photograph exceeds maximum allowed payload.')
    .refine((val) => isValidBase64ByteLength(val, MAX_MEDIA_BYTES), {
      message: 'Photograph must be valid base64 data under 5 MB.',
    }),
  imageMimeType: z.enum(ALLOWED_IMAGE_MIME_TYPES),
  audioBase64: z
    .string()
    .max(7_000_000)
    .refine((val) => isValidBase64ByteLength(val, MAX_MEDIA_BYTES), {
      message: 'Audio recording must be valid base64 data under 5 MB.',
    })
    .optional(),
  audioMimeType: z
    .string()
    .transform((val) => normalizeMimeType(val))
    .pipe(z.enum(ALLOWED_AUDIO_MIME_TYPES))
    .optional(),
  description: z.string().max(1500).default(''),
  area: z.string().max(140).default(''),
  landmark: z.string().max(140).default(''),
  city: z.string().max(60).default('Hyderabad'),
  selectedCategory: z
    .enum(['pothole', 'garbage', 'water_leakage', 'damaged_footpath', 'broken_streetlight', 'other'])
    .optional(),
  language: z.enum(['en', 'te', 'hi', 'ur']).default('en'),
  existingReportsSummary: z
    .array(
      z.object({
        id: z.string().max(128),
        category: z.string().max(40),
        title: z.string().max(140),
        area: z.string().max(140),
        status: z.string().max(40),
      }),
    )
    .max(25)
    .default([]),
});

export const AnalyzeReportOutputSchema = z.object({
  suggestedCategory: z.enum([
    'pothole',
    'garbage',
    'water_leakage',
    'damaged_footpath',
    'broken_streetlight',
    'other',
  ]),
  conciseTitle: z.string().min(4).max(140),
  conciseDescription: z.string().min(10).max(1000),
  visibleEvidence: z.array(z.string().max(200)).max(8),
  suggestedPriority: z.enum(['Low', 'Medium', 'High', 'Urgent']),
  priorityReasoning: z.string().min(5).max(800),
  confidence: z.number().min(0).max(1),
  needsClarification: z.boolean(),
  clarificationQuestion: z.string().max(400),
  possibleDuplicateIndicators: z.string().max(500),
  generatedComplaint: z.string().min(10).max(3200),
});

export const WeeklySummaryInputSchema = z.object({
  city: z.string().max(60).default('Hyderabad'),
  totalReports: z.number().int().min(0),
  resolvedCount: z.number().int().min(0),
  openCount: z.number().int().min(0),
  categoryBreakdown: z.array(
    z.object({
      category: z.string().max(50),
      count: z.number().int().min(0),
    }),
  ),
  topAreas: z.array(
    z.object({
      area: z.string().max(140),
      count: z.number().int().min(0),
    }),
  ),
  recentReports: z
    .array(
      z.object({
        category: z.string().max(50),
        title: z.string().max(140),
        area: z.string().max(140),
        status: z.string().max(40),
        verificationCount: z.number().int().min(0),
      }),
    )
    .max(30),
});

export const WeeklySummaryOutputSchema = z.object({
  headline: z.string().min(5).max(160),
  executiveSummary: z.string().min(20).max(1500),
  keyPatterns: z.array(z.string().max(240)).max(5),
  recommendedAttentionAreas: z.array(z.string().max(200)).max(5),
  dataDisclaimer: z.string().min(10).max(400),
});

export function mapGeminiError(err: unknown): { status: number; message: string } {
  const msg = err instanceof Error ? err.message : String(err);
  if (msg === 'GEMINI_API_KEY_MISSING') {
    return {
      status: 503,
      message:
        'Gemini API key is not configured on the server. Add GEMINI_API_KEY in Settings > Secrets.',
    };
  }
  if (msg === 'GEMINI_INVALID_JSON') {
    return {
      status: 502,
      message:
        'AI response could not be parsed as valid structured JSON. Please retry or edit manually.',
    };
  }
  if (msg.includes('PERMISSION_DENIED') || msg.includes('API_KEY_INVALID') || msg.includes('403')) {
    return {
      status: 403,
      message: 'Gemini API key was rejected. Please verify GEMINI_API_KEY in Settings > Secrets.',
    };
  }
  if (msg.includes('RESOURCE_EXHAUSTED') || msg.includes('429')) {
    return {
      status: 429,
      message: 'Gemini API quota reached temporarily. Please wait a moment and retry.',
    };
  }
  if (msg.includes('NOT_FOUND') || msg.includes('404')) {
    return {
      status: 502,
      message: 'Requested Gemini model is unavailable. Please verify model configuration.',
    };
  }
  if (msg.includes('INVALID_ARGUMENT') || msg.includes('400')) {
    return {
      status: 400,
      message: 'Submitted media or text could not be processed by Gemini. Try a smaller JPEG/PNG image.',
    };
  }
  if (msg.includes('DEADLINE_EXCEEDED') || msg.includes('TIMEOUT') || msg.includes('ETIMEDOUT')) {
    return {
      status: 504,
      message: 'Gemini analysis timed out. Please retry in a moment.',
    };
  }
  if (msg.includes('UNAVAILABLE') || msg.includes('503')) {
    return {
      status: 503,
      message: 'Gemini service is temporarily unavailable. Please retry shortly.',
    };
  }
  return {
    status: 500,
    message: 'Failed to complete AI analysis. You can still review and edit your report manually.',
  };
}

function getGeminiClient(): GoogleGenAI {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey || apiKey === 'MY_GEMINI_API_KEY') {
    throw new Error('GEMINI_API_KEY_MISSING');
  }
  return new GoogleGenAI({
    apiKey,
    httpOptions: {
      headers: {
        'User-Agent': 'aistudio-build',
      },
    },
  });
}

async function generateWithRetry<T>(fn: () => Promise<T>, maxAttempts = 2): Promise<T> {
  let lastError: unknown;
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      return await fn();
    } catch (err) {
      lastError = err;
      const msg = err instanceof Error ? err.message : String(err);
      const isNonRetryable =
        msg === 'GEMINI_API_KEY_MISSING' ||
        msg.includes('PERMISSION_DENIED') ||
        msg.includes('API_KEY_INVALID') ||
        msg.includes('400') ||
        msg.includes('403') ||
        msg.includes('404') ||
        msg.includes('429');
      if (isNonRetryable || attempt === maxAttempts) {
        throw err;
      }
      await new Promise((r) => setTimeout(r, 400 * attempt));
    }
  }
  throw lastError;
}

export function createApiApp(
  customAiClient?: GoogleGenAI,
  options?: {
    uploadsDir?: string;
    verifyAuthToken?: VerifyAuthTokenFn;
  },
): Express {
  const app = express();
  const uploadsDir = options?.uploadsDir ? path.resolve(options.uploadsDir) : DEFAULT_UPLOADS_DIR;
  const verifyAuthToken = options?.verifyAuthToken ?? verifyFirebaseIdTokenViaRest;

  app.set('trust proxy', true);
  app.use((_req, res, next) => {
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
    next();
  });
  app.use(express.json({ limit: '16mb' }));

  app.get('/api/health', (_req, res) => {
    res.json({
      ok: true,
      geminiConfigured: Boolean(
        process.env.GEMINI_API_KEY && process.env.GEMINI_API_KEY !== 'MY_GEMINI_API_KEY',
      ),
      mapsConfigured: Boolean(
        process.env.VITE_GOOGLE_MAPS_API_KEY || process.env.GOOGLE_MAPS_API_KEY,
      ),
    });
  });

  app.get('/api/public-config', (_req, res) => {
    const mapsApiKey =
      process.env.VITE_GOOGLE_MAPS_API_KEY || process.env.GOOGLE_MAPS_API_KEY || '';
    res.json({
      mapsApiKey,
      mapsConfigured: Boolean(mapsApiKey),
      geminiConfigured: Boolean(
        process.env.GEMINI_API_KEY && process.env.GEMINI_API_KEY !== 'MY_GEMINI_API_KEY',
      ),
    });
  });

  app.post('/api/upload-image', async (req, res) => {
    const clientIp = req.ip || 'unknown';
    if (isRateLimited(clientIp)) {
      res.status(429).json({ error: 'Too many upload requests. Please wait a minute and retry.' });
      return;
    }

    const authHeader = req.headers.authorization || '';
    const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7).trim() : '';
    if (!token) {
      res.status(401).json({ error: 'Authentication token required to upload photographs.' });
      return;
    }

    const verifiedUser = await verifyAuthToken(token);
    if (!verifiedUser) {
      res.status(401).json({ error: 'Invalid or expired authentication session.' });
      return;
    }
    if (!verifiedUser.emailVerified) {
      res.status(403).json({ error: 'Verified email account required to upload photographs.' });
      return;
    }

    const parsed = UploadImageInputSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({
        error: 'Invalid image upload payload.',
        details: parsed.error.flatten().fieldErrors,
      });
      return;
    }

    const { folder, reportId, imageBase64, mimeType } = parsed.data;
    const cleanBase64 = imageBase64.replace(/\s+/g, '');
    const buffer = Buffer.from(cleanBase64, 'base64');

    if (buffer.length === 0 || buffer.length > MAX_MEDIA_BYTES) {
      res.status(400).json({ error: 'Image size must be between 1 byte and 5 MB.' });
      return;
    }

    if (!hasValidImageMagicBytes(buffer, mimeType)) {
      res.status(400).json({
        error: 'Uploaded image data does not match the declared JPEG, PNG, or WebP format.',
      });
      return;
    }

    const ext = mimeType === 'image/png' ? 'png' : mimeType === 'image/webp' ? 'webp' : 'jpg';
    const randomSuffix = crypto.randomBytes(4).toString('hex');
    const safeFilename = `${reportId}_${Date.now()}_${randomSuffix}.${ext}`;
    const targetFolderDir = path.resolve(uploadsDir, folder);
    const targetFilePath = path.resolve(targetFolderDir, safeFilename);

    if (!targetFilePath.startsWith(targetFolderDir + path.sep)) {
      res.status(400).json({ error: 'Invalid upload destination path.' });
      return;
    }

    try {
      await fsp.mkdir(targetFolderDir, { recursive: true });
      await fsp.writeFile(targetFilePath, buffer);
      res.status(201).json({
        url: `/api/uploads/${folder}/${safeFilename}`,
        provider: 'server-fallback',
      });
    } catch (err) {
      console.error('Server fallback image write failed:', err);
      res.status(500).json({ error: 'Failed to store image on server.' });
    }
  });

  app.get('/api/uploads/:folder/:filename', async (req, res) => {
    const folder = req.params.folder;
    const filename = req.params.filename;
    if (folder !== 'reports' && folder !== 'resolutions') {
      res.status(404).json({ error: 'Image not found.' });
      return;
    }
    if (!/^[a-zA-Z0-9_-]{4,160}\.(jpg|png|webp)$/.test(filename)) {
      res.status(404).json({ error: 'Image not found.' });
      return;
    }

    const folderDir = path.resolve(uploadsDir, folder);
    const filePath = path.resolve(folderDir, filename);
    if (!filePath.startsWith(folderDir + path.sep)) {
      res.status(404).json({ error: 'Image not found.' });
      return;
    }

    try {
      const stat = await fsp.stat(filePath);
      if (!stat.isFile()) {
        res.status(404).json({ error: 'Image not found.' });
        return;
      }
      const ext = path.extname(filename).toLowerCase();
      const contentType =
        ext === '.png' ? 'image/png' : ext === '.webp' ? 'image/webp' : 'image/jpeg';
      res.setHeader('Content-Type', contentType);
      res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
      res.sendFile(filePath);
    } catch {
      res.status(404).json({ error: 'Image not found.' });
    }
  });

  app.post('/api/analyze-report', async (req, res) => {
    const clientIp = req.ip || 'unknown';
    if (isRateLimited(clientIp)) {
      res
        .status(429)
        .json({ error: 'Too many analysis requests. Please wait a minute before trying again.' });
      return;
    }

    const parsed = AnalyzeReportInputSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({
        error: 'Invalid report analysis payload.',
        details: parsed.error.flatten().fieldErrors,
      });
      return;
    }

    const input = parsed.data;
    const languageNames: Record<string, string> = {
      en: 'English',
      te: 'Telugu (తెలుగు script)',
      hi: 'Hindi (हिन्दी Devanagari script)',
      ur: 'Urdu (اردو Nastaliq/Arabic script)',
    };

    try {
      const ai = customAiClient ?? getGeminiClient();

      const parts: Array<{ inlineData?: { mimeType: string; data: string }; text?: string }> = [
        {
          inlineData: {
            mimeType: input.imageMimeType,
            data: input.imageBase64.replace(/\s+/g, ''),
          },
        },
      ];

      if (input.audioBase64 && input.audioMimeType) {
        parts.push({
          inlineData: {
            mimeType: input.audioMimeType,
            data: input.audioBase64.replace(/\s+/g, ''),
          },
        });
      }

      const duplicateContext =
        input.existingReportsSummary.length > 0
          ? JSON.stringify(input.existingReportsSummary)
          : 'None provided';

      const promptText = [
        'Analyze this civic infrastructure report from an Indian city (default context: Hyderabad).',
        `User-selected category (if any): ${input.selectedCategory || 'Not specified'}`,
        `Citizen typed description: ${input.description || 'None provided (check audio or image)'}`,
        `Provided street/area: ${input.area || 'Not provided'}`,
        `Provided landmark: ${input.landmark || 'Not provided'}`,
        `City: ${input.city}`,
        `Target complaint output language: ${languageNames[input.language]}`,
        `Recent public reports in database for duplicate comparison only: ${duplicateContext}`,
        '',
        'Strict Rules:',
        '1. Describe ONLY what is actually visible in the photograph and stated in user text/audio.',
        '2. If the image is blurry, dark, obstructed, or ambiguous as a civic issue, set needsClarification=true, provide a helpful clarificationQuestion, and set lower confidence (e.g. <= 0.55).',
        '3. Provide suggestedPriority as an advisory suggestion with transparent reasoning, NOT an authoritative safety certification.',
        '4. Compare against the recent reports list ONLY for possibleDuplicateIndicators. If none match closely by area and issue type, state "No close duplicate detected among recent reports."',
        '5. Write generatedComplaint as a polite, formal civic grievance draft in the requested target language. DO NOT invent municipal department names unless generic ("To the Municipal Civic Infrastructure Team"), DO NOT invent ticket/complaint IDs, DO NOT invent coordinates or street names not given, and DO NOT claim the complaint has already been officially filed.',
      ].join('\n');

      parts.push({ text: promptText });

      const response = await generateWithRetry(() =>
        ai.models.generateContent({
          model: MODEL_NAME,
          contents: { parts },
          config: {
            thinkingConfig: { thinkingLevel: ThinkingLevel.LOW },
            systemInstruction:
              'You are RaastaAI civic triage assistant. You inspect citizen-submitted road and neighborhood photographs and optional voice notes, return strict structured JSON, stay strictly truthful about uncertainty, and never fabricate locations, authorities, or ticket IDs.',
            responseMimeType: 'application/json',
            responseSchema: {
              type: Type.OBJECT,
              properties: {
                suggestedCategory: {
                  type: Type.STRING,
                  enum: [
                    'pothole',
                    'garbage',
                    'water_leakage',
                    'damaged_footpath',
                    'broken_streetlight',
                    'other',
                  ],
                  description:
                    'One of: pothole, garbage, water_leakage, damaged_footpath, broken_streetlight, other',
                },
                conciseTitle: {
                  type: Type.STRING,
                  description: 'Short plain-text issue headline (max 100 chars)',
                },
                conciseDescription: {
                  type: Type.STRING,
                  description:
                    'Factual 2-3 sentence summary combining visible evidence and user details',
                },
                visibleEvidence: {
                  type: Type.ARRAY,
                  items: { type: Type.STRING },
                  description: 'List of concrete visual cues observed in the photograph',
                },
                suggestedPriority: {
                  type: Type.STRING,
                  enum: ['Low', 'Medium', 'High', 'Urgent'],
                  description: 'One of: Low, Medium, High, Urgent',
                },
                priorityReasoning: {
                  type: Type.STRING,
                  description: 'Transparent advisory reasoning explaining the suggested priority',
                },
                confidence: {
                  type: Type.NUMBER,
                  description: 'Confidence score between 0.0 and 1.0',
                },
                needsClarification: {
                  type: Type.BOOLEAN,
                  description:
                    'True if photo or context is ambiguous and needs citizen clarification',
                },
                clarificationQuestion: {
                  type: Type.STRING,
                  description:
                    'Question for the citizen when needsClarification is true, else empty string',
                },
                possibleDuplicateIndicators: {
                  type: Type.STRING,
                  description:
                    'Note on potential duplicate match with recent reports, or clear statement if none',
                },
                generatedComplaint: {
                  type: Type.STRING,
                  description:
                    'Formal civic complaint draft in the chosen language without fabricated IDs',
                },
              },
              required: [
                'suggestedCategory',
                'conciseTitle',
                'conciseDescription',
                'visibleEvidence',
                'suggestedPriority',
                'priorityReasoning',
                'confidence',
                'needsClarification',
                'clarificationQuestion',
                'possibleDuplicateIndicators',
                'generatedComplaint',
              ],
            },
          },
        }),
      );

      const rawText = (response.text ?? '').trim();
      let rawJson: unknown;
      try {
        rawJson = JSON.parse(rawText);
      } catch {
        throw new Error('GEMINI_INVALID_JSON');
      }

      const validated = AnalyzeReportOutputSchema.safeParse(rawJson);
      if (!validated.success) {
        res.status(502).json({
          error: 'AI returned an unexpected structure. Please retry or compose manually.',
          details: validated.error.flatten(),
        });
        return;
      }

      res.json({
        ...validated.data,
        analyzedAt: new Date().toISOString(),
      });
    } catch (err) {
      console.error('Gemini analyze-report error:', err);
      const mapped = mapGeminiError(err);
      res.status(mapped.status).json({ error: mapped.message });
    }
  });

  app.post('/api/weekly-summary', async (req, res) => {
    const clientIp = req.ip || 'unknown';
    if (isRateLimited(clientIp)) {
      res
        .status(429)
        .json({ error: 'Rate limit exceeded. Please wait before regenerating the summary.' });
      return;
    }

    const parsed = WeeklySummaryInputSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({
        error: 'Invalid analytics summary payload.',
        details: parsed.error.flatten().fieldErrors,
      });
      return;
    }

    const stats = parsed.data;
    if (stats.totalReports === 0) {
      res
        .status(400)
        .json({ error: 'At least one stored report is required to generate a summary.' });
      return;
    }

    try {
      const ai = customAiClient ?? getGeminiClient();
      const response = await generateWithRetry(() =>
        ai.models.generateContent({
          model: MODEL_NAME,
          contents: [
            'Generate a concise, grounded civic intelligence summary based STRICTLY on these real database counts and reports.',
            'Do not invent extra statistics, wards, or government claims not present in this JSON:',
            JSON.stringify(stats),
          ].join('\n\n'),
          config: {
            thinkingConfig: { thinkingLevel: ThinkingLevel.LOW },
            systemInstruction:
              'You are a civic data analyst summarizing real citizen reports. Use only the numbers and areas provided. Clearly frame insights as observational patterns from citizen submissions.',
            responseMimeType: 'application/json',
            responseSchema: {
              type: Type.OBJECT,
              properties: {
                headline: { type: Type.STRING },
                executiveSummary: { type: Type.STRING },
                keyPatterns: {
                  type: Type.ARRAY,
                  items: { type: Type.STRING },
                },
                recommendedAttentionAreas: {
                  type: Type.ARRAY,
                  items: { type: Type.STRING },
                },
                dataDisclaimer: { type: Type.STRING },
              },
              required: [
                'headline',
                'executiveSummary',
                'keyPatterns',
                'recommendedAttentionAreas',
                'dataDisclaimer',
              ],
            },
          },
        }),
      );

      const rawText = (response.text ?? '').trim();
      let rawJson: unknown;
      try {
        rawJson = JSON.parse(rawText);
      } catch {
        throw new Error('GEMINI_INVALID_JSON');
      }

      const validated = WeeklySummaryOutputSchema.safeParse(rawJson);
      if (!validated.success) {
        res.status(502).json({
          error: 'AI returned an invalid summary structure.',
          details: validated.error.flatten(),
        });
        return;
      }

      res.json({
        ...validated.data,
        generatedAt: new Date().toISOString(),
      });
    } catch (err) {
      console.error('Gemini weekly-summary error:', err);
      const mapped = mapGeminiError(err);
      res.status(mapped.status).json({ error: mapped.message });
    }
  });

  app.use(
    (
      err: Error & { status?: number; type?: string },
      _req: express.Request,
      res: express.Response,
      next: express.NextFunction,
    ) => {
      if (res.headersSent) {
        next(err);
        return;
      }
      if (err?.type === 'entity.too.large') {
        res.status(413).json({ error: 'Uploaded payload exceeds the 16 MB request limit.' });
        return;
      }
      if (err?.type === 'entity.parse.failed') {
        res.status(400).json({ error: 'Malformed JSON request payload.' });
        return;
      }
      console.error('Unhandled API error:', err);
      res.status(err?.status || 500).json({ error: 'Unexpected server error.' });
    },
  );

  return app;
}

async function startServer() {
  const app = createApiApp();

  if (process.env.NODE_ENV !== 'production') {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.resolve(__dirname, 'dist');
    app.use(express.static(distPath));
    app.get('*', (_req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  const httpServer = app.listen(PORT, '0.0.0.0', () => {
    console.log(`RaastaAI server listening on http://localhost:${PORT}`);
  });
  // Keep alive longer than Cloud Run / GCP LB idle timeout (60s) to prevent ERR_CONNECTION_CLOSED
  httpServer.keepAliveTimeout = 65_000;
  httpServer.headersTimeout = 66_000;
  httpServer.requestTimeout = 120_000;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  startServer().catch((err) => {
    console.error('Failed to start RaastaAI server:', err);
    process.exit(1);
  });
}

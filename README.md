# RaastaAI — Civic Issue Reporting & Community Intelligence

**Better Streets Begin With One Report.**

RaastaAI is a full-stack civic infrastructure reporting and community intelligence platform built for Hyderabad and Indian cities. Citizens can capture road and neighborhood issues with photographs, optional voice notes, and location context, receive structured multimodal AI triage via Google Gemini in English, Telugu, Hindi, or Urdu, review and edit drafts before submission, and track issues transparently from submission to verified resolution.

---

## Core Capabilities

- **Multimodal Civic Reporting (`/report`)**
  - Upload or capture issue photos (client-side resized & compressed up to 5 MB), record optional browser voice clips, add street/landmark details and optional GPS coordinates, and choose from 6 civic categories (`pothole`, `garbage`, `water_leakage`, `damaged_footpath`, `broken_streetlight`, `other`).
- **Grounded Gemini Multimodal Analysis (`POST /api/analyze-report`)**
  - Inspects uploaded image + optional voice recording via `@google/genai` (`gemini-4-hydrogen`) and validates strict JSON output with Zod.
  - Produces category suggestions, visible evidence bullets, advisory severity reasoning, uncertainty/clarification flags when photos are ambiguous, potential duplicate indicators against recent database reports, and formal complaint drafts in **English**, **Telugu (`తెలుగు`)**, **Hindi (`हिन्दी`)**, and **Urdu (`اردو`)**.
  - Citizens review and edit every field before submitting—AI predictions are never presented as official facts or auto-submitted.
- **Interactive Community Map (`/map`) & Public Feed (`/feed`)**
  - Interactive Google Maps view (`@vis.gl/react-google-maps`) with category/status filters and issue pins, paired with a structured list and coordinate fallback when Maps is unconfigured or throttled.
  - Public feed with one-verification-per-user protection (`verifications/{reportId}_{userId}` backed by atomic Firestore batch writes and security rules).
- **Report Detail & Timeline (`/reports/:id`)**
  - Displays uploaded photos, location details, transparent AI triage reasoning, status timeline, community verification count, and before/after resolution imagery.
- **Citizen Dashboard (`/dashboard`) & Protected Admin Console (`/admin`)**
  - Citizens track personal reports and metrics; verified administrators manage official status transitions (`Submitted` → `Under Review` → `In Progress` → `Resolved`), post resolution notes, upload after-repair photographs, audit activity logs, and manage admin allowlists.
- **Live Community Insights (`/insights`) & AI Weekly Summary (`POST /api/weekly-summary`)**
  - Real-time category breakdowns, status distributions, recurring area hotspots, and resolution rates computed from Firestore data, plus on-demand Gemini summaries strictly grounded in stored counts.

---

## Architecture & Tech Stack

| Layer | Technology |
| --- | --- |
| **Frontend** | React 19, TypeScript, Vite, Tailwind CSS v4, Lucide React |
| **Server & AI API** | Node.js (v22+) + Express (`server.ts`), `@google/genai` (`gemini-4-hydrogen`), Zod validation, sliding-window rate limiter |
| **Database & Auth** | Firebase Authentication (Google Sign-In & optional Email/Password), Cloud Firestore (`firestore.rules` + `firebase-blueprint.json`) |
| **Media Storage** | Firebase Storage (`storage.rules`) with automatic fast-fail failover to authenticated Express upload endpoints (`/api/upload-image`, `/api/uploads/:folder/:filename`) |
| **Mapping** | `@vis.gl/react-google-maps` (`AdvancedMarker`, `Pin`, `InfoWindow`) + automatic list fallback |

---

## Application Routes & API Endpoints

### Frontend Routes
- `/` — Landing page with mission overview, workflow, and live Firestore impact stats
- `/auth` — Sign in / Sign up, email verification status, and account settings
- `/dashboard` — Citizen report overview and quick submission CTA
- `/report` — Guided issue capture, Gemini multimodal triage, multilingual complaint editor
- `/map` — Interactive community map and list fallback with category & status filters
- `/feed` — Public report stream with unique community verification
- `/reports/:id` — Full report timeline, AI breakdown, and before/after resolution view
- `/insights` — Live analytics from Firestore + grounded Gemini weekly intelligence summary
- `/admin` — Role-protected moderation queue, status updates, and admin allowlist management

### Server API (`server.ts`)
- `GET /api/health` — Server readiness and Gemini/Maps configuration flags
- `GET /api/public-config` — Public browser configuration (Maps API key and feature flags)
- `POST /api/analyze-report` — Rate-limited multimodal image + audio analysis returning strict Zod-validated JSON
- `POST /api/weekly-summary` — Rate-limited grounded summary over real Firestore aggregate counts
- `POST /api/upload-image` — Authenticated (`Bearer` Firebase ID token + verified email) fallback upload endpoint validating magic bytes (`JPEG`/`PNG`/`WebP`), 5 MB size cap, and path sanitization
- `GET /api/uploads/:folder/:filename` — Safe static serving (`nosniff`, strict path allowlist) for fallback images

---

## Security & Data Integrity

- **Firestore Security Rules (`firestore.rules`)**: Default-deny catch-all, strict field allowlisting (`hasAll`/`hasOnly`), ID format validation (`isValidId`), server timestamp enforcement (`request.time`), PII isolation on `users/{userId}`, atomic verification writes (`existsAfter`), and verified-admin-only official status updates. Audited with `@firebase/eslint-plugin-security-rules` and verified against adversarial payloads in `security_spec.md` & `tests/firestore.rules.test.ts`.
- **Storage Security Rules (`storage.rules`)**: Verified-user UID-scoped paths (`/reports/{userId}/{fileName}`, `/resolutions/{userId}/{fileName}`), 5 MB file size limit, and `image/(jpeg|png|webp)` content-type restriction.
- **Server-Side AI Key Isolation**: `GEMINI_API_KEY` is accessed strictly inside `server.ts` and never bundled into client assets.

---

## Setup & Local Development

### 1. Prerequisites
- Node.js 22+
- A Firebase project configured in `firebase-applet-config.json`
- A Google Gemini API key

### 2. Install & Configure Environment
```bash
npm install
cp .env.example .env
```

Set variables in `.env` (or AI Studio Secrets / hosting environment variables):
- `GEMINI_API_KEY` — Required on server for Gemini multimodal analysis & weekly summaries
- `VITE_GOOGLE_MAPS_API_KEY` (or `GOOGLE_MAPS_API_KEY`) — Optional browser key for interactive Google Maps on `/map`
- `APP_URL` — Base URL (e.g., `http://localhost:3000`)

### 3. Firebase Configuration
1. **Authentication**: Google Sign-In is supported out of the box. To also allow Email/Password accounts, enable **Email/Password** in **Firebase Console → Authentication → Sign-in method**.
2. **Firestore**: Deploy `firestore.rules` to your database (`firebase deploy --only firestore:rules`).
3. **Storage (Required in Production)**:
   - Enable **Storage** in Firebase Console and publish `storage.rules` (`firebase deploy --only storage`).
   - Direct client-side Firebase Storage uploads (up to 5 MB) are used for report and resolution photographs.
   - In **production**, the local filesystem fallback (`/api/upload-image`) is intentionally disabled so ephemeral `/api/uploads/...` URLs are never stored in Firestore. In **local development**, if Firebase Storage is not yet enabled, `src/lib/reportsService.ts` fails fast after 3.5s and falls back to `/api/upload-image`.
4. **Admin Access**: Official moderation requires a verified email listed in `admins/{uid}` or the bootstrapped administrator account configured in `firestore.rules` and `src/lib/firebase.ts`.

### 4. Run Locally
```bash
npm run dev
```
Open `http://localhost:3000`.

---

## Deploying to Vercel

RaastaAI uses a single-project **Vite + Vercel Serverless Function** setup configured in `vercel.json` and `api/[...path].ts`:
- **Frontend**: Built as static assets into `dist/` using the `vite` framework preset, with an SPA fallback rewrite to `/index.html` for `/dashboard`, `/report`, `/map`, `/feed`, `/insights`, `/admin`, and `/reports/:id`.
- **Backend API**: All `/api/*` routes (including nested `/api/uploads/:folder/:filename`) are excluded from the SPA rewrite and handled by the catch-all serverless function `api/[...path].ts`, which exports `createApiApp()` from `server.ts` without starting a listening socket or Vite middleware.

### Step 1: Import Project & Build Settings
1. Push your repository to GitHub and import it in **Vercel → Add New Project**.
2. Keep the settings defined in `vercel.json`:
   - **Framework Preset**: `Vite`
   - **Build Command**: `npm run build`
   - **Output Directory**: `dist`

### Step 2: Configure Vercel Environment Variables
Add these under **Project Settings → Environment Variables**:
- `GEMINI_API_KEY` *(Required, server-side only)* — Your Google Gemini API key. **Never** prefix with `VITE_` or expose in browser bundles.
- `VITE_GOOGLE_MAPS_API_KEY` or `GOOGLE_MAPS_API_KEY` *(Optional)* — Browser key for interactive Google Maps on `/map`. Restrict this key by HTTP referrer (`https://<your-project>.vercel.app/*`) and to the Maps JavaScript API in Google Cloud Console.
- `APP_URL` *(Optional)* — Your deployed Vercel URL (`https://<your-project>.vercel.app`).

### Step 3: Required Firebase Setup for Production
1. **Enable Firebase Storage & Deploy `storage.rules`**:
   - In **Firebase Console → Build → Storage**, initialize your Storage bucket (`gen-lang-client-0709466181.firebasestorage.app`) and publish `storage.rules`.
   - Production image uploads fail with an actionable configuration error if Storage is disabled or rules deny access; local disk uploads are never used in production.
2. **Authorize Your Vercel Domain in Firebase Auth**:
   - Open **Firebase Console → Authentication → Settings → Authorized domains** and add your Vercel domain (e.g., `<your-project>.vercel.app` and any custom domain) so Google Sign-In popups succeed.
3. **Deploy `firestore.rules`**:
   - Ensure `firestore.rules` is deployed to your Firestore database (`ai-studio-890988cc-db2b-45f2-b546-38a4e4229fbd`).

### Known Vercel Limits & Payload Budgets
- **4.5 MB Serverless Request Body Limit**: Vercel Node.js Functions enforce a hard 4.5 MB limit on incoming request bodies.
- **4 MB Analysis Budget (`POST /api/analyze-report`)**:
  - Client-side `ReportIssuePage` compresses analysis images adaptively, caps voice recordings to **45 seconds / 950 KB**, and verifies the final JSON payload size using `TextEncoder` stays under **4 MB** before calling `/api/analyze-report`.
  - Express enforces a matching **4 MB** JSON body parser limit and Zod payload validation on `server.ts`.
  - Direct image uploads to Firebase Storage remain separate from Gemini analysis payloads and support up to **5 MB**.

---

## Testing, Linting & Build

```bash
# TypeScript typecheck
npm run lint

# Security rules ESLint audit
npx eslint firestore.rules

# Run structural rules, Gemini API, upload fallback, and Vercel deployment tests
npx tsx --test tests/*.test.ts

# Production frontend build
npm run build

# Start local production server (serves dist/ + /api/* on port 3000)
npm start
```

---

## License
Apache-2.0


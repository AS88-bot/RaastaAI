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
3. **Storage (recommended for persistent production media)**:
   - Enable **Storage** in Firebase Console and publish `storage.rules` (`firebase deploy --only storage`).
   - If Storage is not yet enabled, `src/lib/reportsService.ts` fails fast after 3.5s and automatically falls back to `/api/upload-image` on the Express server (note: local disk uploads in `uploads/` are ephemeral across container restarts).
4. **Admin Access**: Official moderation requires a verified email listed in `admins/{uid}` or the bootstrapped administrator account configured in `firestore.rules` and `src/lib/firebase.ts`.

### 4. Run Locally
```bash
npm run dev
```
Open `http://localhost:3000`.

---

## Testing, Linting & Build

```bash
# TypeScript typecheck
npm run lint

# Security rules ESLint audit
npx eslint firestore.rules

# Run structural rules, Gemini API, and upload fallback tests
npx tsx --test tests/*.test.ts

# Production frontend build
npm run build

# Start production server (serves dist/ + /api/* on port 3000)
npm start
```

---

## License
Apache-2.0

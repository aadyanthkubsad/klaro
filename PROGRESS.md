# Klaro Learn - Project Progress & Roadmap

**Last updated:** 2026-05-30
**Repository:** https://github.com/aadyanthkubsad/klaro
**Version:** 1.1.0 (server)

---

## 1. Project Overview

**Klaro Learn** (internally "Insight Learning Hub") is an AI-powered adaptive learning platform for Class 10 CBSE students. It transforms syllabus content into multi-modal learning experiences — Visual, Auditory, Read/Write, and Kinesthetic (VARK) — using Google Gemini AI. The platform includes revision kits, quizzes, flashcards, mistake tracking, analytics, and a freemium billing model.

### Tech Stack

| Layer | Technology |
|-------|-----------|
| Frontend | React 19 + TypeScript, Vite 6, Tailwind CSS 4, Framer Motion |
| Backend | Express.js (TypeScript), running via `tsx` in dev |
| AI | Google Gemini API (`@google/genai`) — server-side only |
| TTS | Sarvam AI (Indian-language narration), browser SpeechSynthesis fallback |
| Database | JSON file persistence (`data/klaro-db.json`) — MVP, no external DB |
| Icons | Lucide React |
| PDF | jsPDF + html2canvas |
| Deployment | Docker (multi-stage Dockerfile), docker-compose ready |

---

## 2. Completed Features

### 2.1 Core Learning Flow

- **Landing Page** — Onboarding screen introducing the app
- **Dashboard** — Central hub showing streak, XP, level, library items, and quick-generate topic input
- **Revision Kit Generation** — AI generates a comprehensive kit per topic containing: summary, key points, vocabulary, concept maps, quiz questions, flashcards, audio scripts, and read/write materials
- **Learning Style Selector** — After generating a kit, student chooses Visual / Read-Write / Aural mode
- **Chapter Library** — Full CBSE Class 10 syllabus metadata (Science, Maths, Social Science, English, Hindi) with per-chapter mode selection

### 2.2 Learning Modes (VARK)

- **Visual Hub** — Mind maps, concept maps, graphic descriptions, and visual summaries from revision kits
- **Aural Hub** — Audio summaries with AI narration (Sarvam TTS) or browser speech synthesis; lecture notes display; podcast-style playback
- **Read/Write Hub** — Study notes in multiple styles (Cornell, Outline, Comparison, Recall, Concept Map, Knowledge Cards); written exam answer practice with AI evaluation and marks feedback
- **Practice Quiz** — MCQ quizzes generated from revision kits with scoring, explanations, topic tags, and cognitive-level tracking (Bloom's taxonomy)

### 2.3 Assessment & Review

- **AI Quiz View** — Standalone AI-generated quiz (from weak topics, focused review, or YouTube recall)
- **Quiz Scoring** — Auto-grading with per-question explanations and topic tagging
- **Test Review View** — Review wrong answers from a specific quiz attempt with full answer detail
- **Mistakes Notebook** — Aggregated list of all wrong answers across modes, filterable by topic
- **Focused Review** — AI generates a targeted quiz from weak topics and past mistakes
- **Written Answer Evaluation** — Students type or upload handwritten answers; AI grades against CBSE marking scheme with keyword analysis, model answers, and exam tips

### 2.4 Analytics & Progress

- **Analytics View** — Three tabs: Test Analysis, Weak Topics, Score Analysis; AI-generated weak-topic reports saved to library
- **Progress View** — XP tracking, level progression, learning activity chart, streak tracking, subject breakdown
- **Mastery Tracking** — Per-topic mastery scores (Not Started → Weak → Improving → Strong → Mastered) with Ebbinghaus forgetting-curve risk assessment
- **Activity Logging** — Every meaningful action (kit gen, quiz, mistake review, flashcards, PDF download) is logged with XP rewards

### 2.5 Study Tools

- **Flashcards** — AI-generated or kit-derived flashcard decks with front/back, topic tags, difficulty levels
- **Daily Tasks (Todo)** — Auto-generated revision tasks based on quiz performance, weak topics, and spaced repetition
- **Monthly Planner** — Calendar-based revision scheduler with forgetting-curve events, exam dates, and task integration (Pro plan)
- **YouTube Study** — Paste a video transcript or topic; generates a recall kit with summary, key points, flashcards, and quiz
- **Camera Scan** — Paste text from textbooks/notes; generates revision kits from raw content
- **Doubt Solver (Klaro AI)** — AI chat for personalized learning questions about personality, weaknesses, and study strategy
- **PDF Export** — Download study materials as formatted PDF documents

### 2.6 Content & Syllabus

- **CBSE Class 10 Syllabus** — Full chapter metadata for Science (NCERT), Maths (Standard & Basic), Social Science (History, Geography, Political Science, Economics), English (First Flight, Footprints Without Feet), Hindi (Kshitij, Kritika, Sparsh, Sanchayan)
- **Syllabus Chunking** — Chapter content split into retrievable chunks for RAG-style prompt enrichment
- **Hindi Language Support** — Kits generated in Devanagari for Hindi chapters; language toggle on chapter mode selector
- **Previous Year Papers** — CBSE previous year paper links with marking schemes and practice generation

### 2.7 Billing & Plans

- **Three-tier plan structure:**
  - **Free** — 3 kits/day, 3 quizzes/day, basic flashcards, mistakes notebook, 10 library saves
  - **Plus (Rs.249/mo)** — 20 kits/day, PDF downloads, weak-topic retests, previous year papers, 5 YouTube recalls/month
  - **Exam Pro (Rs.499/mo)** — 50 kits/day, monthly planner, written answer feedback, mastery tracking, advanced analytics, 30 YouTube recalls/month
- **Usage Counters** — Daily and monthly counters with automatic reset (localStorage)
- **Paywall Modal** — Configurable per-feature paywall with tier badge, benefits list, CTA, and DEV unlock button
- **DEV_FORCE_PRO flag** — Enables all Pro features for development/testing without payment

### 2.8 Server Infrastructure

- **Express API** — 20+ endpoints covering kit generation, quiz generation, flashcards, study notes, audio, answer evaluation, YouTube recall, library CRUD, and health checks
- **Rate Limiting** — Per-endpoint, per-plan rate limits (in-memory)
- **Request Queue** — Controlled concurrency for AI requests with configurable limits
- **Response Cache** — In-memory cache with TTL for expensive AI responses
- **Input Validation** — Zod-style validation middleware for all AI endpoints with size limits
- **Request Logging** — Structured logging with request IDs, durations, and plan tracking
- **JSON Database** — File-based persistence for users, kits, library items, stats, and quiz history
- **Sarvam TTS Service** — Server-side audio generation with chapter-aware weightage, WAV output, and automatic cleanup
- **Health Check** — `/api/health` endpoint with uptime, version, database stats, queue stats, and API key status
- **Docker Support** — Multi-stage Dockerfile, docker-compose, health checks, non-root user

### 2.9 UX & Navigation

- **Sidebar Navigation** — 10 navigation items: Home, Tasks, Library, Analytics, Progress, Practice, Mistakes, Klaro AI, Upgrade Plan, Settings
- **Global Back Button** — History-stack navigation across all views
- **Toast Notifications** — Non-blocking success/warning/error/info toasts replacing alert() calls
- **Loading States** — Spinner with animated text during data fetching
- **Responsive Layout** — Sidebar hidden on mobile, full-width content area
- **Error Boundary** — React error boundary for graceful crash recovery

---

## 3. Pending Work

### 3.1 Critical — Must Have Before Launch

| Item | Status | Details |
|------|--------|---------|
| **Payment Integration** | Not started | No real payment gateway. Plans are toggled via DEV button/localStorage. Need Razorpay/Stripe integration for actual billing. Referenced in `OffersView.tsx`, `SettingsView.tsx`, `App.tsx`. |
| **User Authentication** | Not started | No login/signup. Users are identified by IP address on the server. Need proper auth (email/password, Google OAuth) for persistent accounts and cross-device access. |
| **Real Database** | Partially done | Using JSON file (`data/klaro-db.json`) for persistence. Works for single-user, but not production-ready. Need PostgreSQL or MongoDB for multi-user support. |
| **Syllabus Verification** | Needs review | Chapter lists need verification against latest official CBSE curriculum PDF. Noted in `class10Syllabus.ts`. |

### 3.2 High Priority — Feature Gaps

| Item | Status | Details |
|------|--------|---------|
| **Admin Syllabus Manager** | Stub only | `AdminSyllabusManager.tsx` shows "Coming Soon". No admin panel for managing syllabus content. |
| **Interactive 3D Models** | Not started | `VisualHub.tsx:518` has "Coming Soon" section for premium 3D science models (heart, atom, photosynthesis). |
| **Animated Explainers** | Not started | Listed as a Pro benefit in `App.tsx:444` but not implemented. |
| **Mock Test Mode** | Not started | Listed as a Pro plan feature in billing limits but no dedicated mock test view exists. |
| **Mobile Responsive Sidebar** | Partial | Sidebar is hidden on mobile (`hidden md:flex`) but no mobile navigation (hamburger menu or bottom nav) exists. |

### 3.3 Infrastructure — Scaling

| Item | Status | Details |
|------|--------|---------|
| **Redis for Cache** | TODO | `server/cache.ts:11` — In-memory Map. Needs Redis for multi-instance deployments. |
| **Redis for Queue** | TODO | `server/queue.ts:9` — In-memory queue. Needs Redis + BullMQ for multi-instance. |
| **Redis for Rate Limiter** | TODO | `server/rateLimiter.ts:15` — In-memory rate limiting. Needs Redis for multi-instance. |
| **Production Logging** | Partial | Structured logger exists but 66 `console.log/warn/error` calls remain across 15 source files. Need cleanup and routing through the logger. |
| **Environment Configuration** | Partial | `.env.example` exists with key variables. Production deployment config (CORS, HTTPS, domain) not documented. |

### 3.4 Nice to Have — Polish

| Item | Status | Details |
|------|--------|---------|
| **Class 11/12 Support** | Data model ready | `ChapterItem` supports Class 11/12 with stream (Science/Commerce) but no syllabus data exists yet. |
| **Multi-board Support** | Data model ready | `ChapterItem.board` is typed as `'CBSE'` only. Data model can be extended for ICSE, state boards. |
| **User Profile** | Not started | Sidebar shows generic "Learner" with no profile customization. |
| **Dark Mode** | Not started | Tailwind CSS is configured but no dark mode theme or toggle exists. |
| **Offline Support** | Not started | No service worker or PWA configuration. Would help students with intermittent connectivity. |
| **Export/Share** | Partial | PDF export works. No sharing to WhatsApp, email, or link-based sharing. |
| **RoadmapView** | File exists | `RoadmapView.tsx` exists but is not wired into navigation or routing. |
| **StudyNotesPanel** | File exists | `StudyNotesPanel.tsx` exists as a component but is not surfaced as a standalone view. |
| **Test Suites** | Not started | No unit tests, integration tests, or E2E tests exist. |
| **CI/CD Pipeline** | Not started | No GitHub Actions or other CI/CD configuration. |
| **Analytics/Telemetry** | Not started | No product analytics (e.g., Mixpanel, PostHog) for tracking user behavior. |

---

## 4. Architecture

```
D:\insight-learning-hub-v3\
|
|-- server.ts                      # Express backend (20+ API endpoints, Gemini AI calls)
|-- server/
|   |-- cache.ts                   # In-memory response cache
|   |-- database.ts                # JSON file persistence layer
|   |-- logger.ts                  # Structured logging with request IDs
|   |-- queue.ts                   # AI request concurrency queue
|   |-- rateLimiter.ts             # Per-endpoint, per-plan rate limiting
|   |-- validate.ts                # Input validation middleware
|   |-- data/
|   |   |-- chapterWeightage.ts    # Audio generation chapter configs
|   |-- services/
|       |-- sarvamService.ts       # Sarvam AI TTS integration
|
|-- src/
|   |-- App.tsx                    # Root component, routing, state management
|   |-- main.tsx                   # React entry point
|   |-- index.css                  # Global styles (Tailwind)
|   |-- types/index.ts             # All TypeScript interfaces and types
|   |-- components/
|   |   |-- common/
|   |   |   |-- AIGuide.tsx        # AI assistant guide component
|   |   |   |-- EnglishGlossPanel.tsx  # English glossary panel
|   |   |   |-- ErrorBoundary.tsx  # React error boundary
|   |   |   |-- TopBar.tsx         # Top navigation bar
|   |   |-- layout/
|   |   |   |-- Sidebar.tsx        # Main sidebar navigation
|   |   |-- views/                 # 28 view components (see Section 2)
|   |-- data/
|   |   |-- class10Syllabus.ts     # CBSE Class 10 chapter metadata
|   |   |-- syllabusChunks.ts      # Chapter content for RAG retrieval
|   |   |-- syllabusRetrieval.ts   # Chunk retrieval logic
|   |   |-- syllabusVersions.ts    # Syllabus versioning
|   |-- lib/
|   |   |-- pdfExport.ts           # PDF generation utilities
|   |   |-- tts.ts                 # Browser speech synthesis wrapper
|   |-- services/
|       |-- aiService.ts           # Frontend API client (fetch wrappers)
|       |-- billingService.ts      # Plan management, usage counters, paywalls
|       |-- learningService.ts     # Learning loop state (quiz history, mastery, tasks)
|       |-- libraryService.ts      # Library item utilities
|       |-- activityService.ts     # Activity logging for XP and streaks
|
|-- public/
|   |-- generated-audio/           # Sarvam TTS output WAV files
|
|-- Dockerfile                     # Multi-stage production build
|-- docker-compose.yml             # Container orchestration
|-- vite.config.ts                 # Vite + React + Tailwind config
|-- tsconfig.json                  # TypeScript configuration
|-- package.json                   # Dependencies and scripts
```

---

## 5. API Endpoints

| Method | Path | Description | Rate Limited |
|--------|------|-------------|-------------|
| GET | `/api/health` | Server health, uptime, API key status | No |
| GET | `/api/debug-key` | API key status (no key contents) | No |
| GET | `/api/usage` | Rate limit usage stats for current user | No |
| GET | `/api/dashboard-data` | Library + user stats | No |
| GET | `/api/get-kit/:id` | Retrieve a saved revision kit | No |
| GET | `/api/check-paper-link` | Verify CBSE paper URL availability | No |
| POST | `/api/save-to-library` | Save kit/item to user library | No |
| POST | `/api/update-stats` | Update user stats (mistakes, scores) | No |
| POST | `/api/delete-library-item` | Remove item from library | No |
| POST | `/api/cleanup-library` | Remove duplicate library items | No |
| POST | `/api/generate-kit` | Generate comprehensive revision kit | Yes |
| POST | `/api/generate-study-notes` | Generate styled study notes | Yes |
| POST | `/api/generate-flashcards` | Generate flashcard deck | Yes |
| POST | `/api/generate-quiz` | Generate standalone quiz | Yes |
| POST | `/api/generate-audio` | Generate Sarvam TTS audio | Yes |
| POST | `/api/evaluate-exam-answer` | Evaluate typed exam answer | Yes |
| POST | `/api/evaluate-answer` | Evaluate answer (general) | Yes |
| POST | `/api/extract-handwritten-answer` | OCR handwritten answer image | No |
| POST | `/api/youtube-recall` | Generate YouTube recall kit | Yes |
| POST | `/api/ai/generate-summary` | Generate text summary | Yes |
| POST | `/api/ai/generate-weak-topic-analysis` | Analyze weak topics | Yes |
| POST | `/api/ai/generate-focused-review` | Generate focused review quiz | Yes |

---

## 6. How to Run

### Prerequisites
- Node.js 22+
- Gemini API key ([get one here](https://aistudio.google.com/apikey))
- (Optional) Sarvam API key for AI narration ([get one here](https://dashboard.sarvam.ai))

### Development
```bash
npm install
# Create .env with GEMINI_API_KEY=your_key
npm run dev
# Open http://localhost:3000
```

### Docker
```bash
docker compose up --build
# Or: docker build -t klaro . && docker run -p 3000:3000 --env-file .env klaro
```

### Build for Production
```bash
npm run build    # Vite frontend + esbuild backend → dist/
npm start        # Serves from dist/
```

---

## 7. Key Design Decisions

1. **Server-side AI only** — The Gemini API key never reaches the frontend. All AI calls go through Express endpoints. The frontend `aiService.ts` is a thin fetch wrapper.

2. **JSON file database** — Chose simplicity over scalability for MVP. SQLite was originally planned (`database.ts` header references it) but JSON was chosen to avoid native compilation in Docker.

3. **localStorage for client state** — Billing plan, usage counters, quiz history, mastery map, and daily tasks are persisted client-side. This means data doesn't survive browser/device changes — a gap that proper auth + server-side storage would fix.

4. **DEV_FORCE_PRO** — Set to `true` in `billingService.ts`. Forces all users into Pro plan for testing the full feature set without payment integration. Must be set to `false` before production.

5. **Freemium gating** — Every premium feature checks plan limits via `billingService.ts` gate functions. Paywalls are rendered as modals with configurable copy, CTA, and benefits.

6. **VARK methodology** — Content is split into Visual, Aural, Read/Write modes based on educational research on learning styles. Each mode renders different sections of the same revision kit.

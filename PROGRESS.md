# Klaro Learn — Project Progress & Roadmap

**Last updated:** 2026-06-06
**Repository:** https://github.com/aadyanthkubsad/klaro
**Version:** 1.1.0 (server)

---

## 1. Project Overview

**Klaro Learn** (internally "Insight Learning Hub") is an AI-powered adaptive learning platform for CBSE students (Classes 10, 11, 12). It transforms syllabus content into multi-modal learning experiences — Visual, Auditory, Read/Write, and Practice — using Google Gemini AI. The platform includes revision kits, dense exam-ready study notes, quizzes with Bloom's taxonomy tagging, flashcards, mistake tracking, BKT mastery modeling, Ebbinghaus forgetting curves, and a freemium billing model.

### Tech Stack

| Layer | Technology |
|-------|-----------|
| Frontend | React 18 + TypeScript, Vite 6, Tailwind CSS 4, Framer Motion |
| Backend | Express.js (TypeScript), running via `tsx` in dev |
| AI | Google Gemini API (`@google/genai`) — 4-model fallback chain (2.5-flash → 2.0-flash → 2.5-flash-lite → 2.0-flash-lite) |
| TTS | Sarvam AI (Indian-accent Hindi/English narration), browser SpeechSynthesis fallback |
| Database | SQLite (better-sqlite3, WAL mode) — 15 tables, auto-migrated from legacy JSON |
| Auth | JWT (bcrypt password hashing, 7-day tokens) |
| Payments | Razorpay (INR pricing: Free/Plus ₹249/Exam Pro ₹499) |
| Icons | Lucide React |
| PDF | jsPDF + html2canvas |
| Deployment | Docker (multi-stage Dockerfile), docker-compose ready |

---

## 2. Development Progress — Sessions 1-8

### Session 1: Foundation & Setup (May 31, 2026)

- Initial project scaffolding (React + Vite + Express + TypeScript)
- Created PROGRESS.md and PROGRESS.docx documentation
- Audio learning mode overhaul: fixed cache key, added Clear Narrator (5th voice), rewrote all voice prompts, added graded pause markers
- Daily tasks (TodoView) full redesign: summary cards, tab system, chapter-grouped tasks, Smart Suggestions, Revision Memory stats
- Code review: found 2 critical + 7 important + 4 minor issues, all actionable items fixed
- Fixed AuralHub accordion bug (shared state), moved Key Vocabulary to carousel

### Session 2: Backend & Infrastructure (June 1, 2026)

- **SQLite database** (better-sqlite3, WAL mode): 6 tables — users, stats, library_items, kits, payments, sessions. Auto-migrates from JSON.
- **JWT authentication**: register, login, /api/auth/me endpoints + AuthContext + AuthView UI
- **Razorpay payment integration**: order creation + HMAC verification, Plus ₹249/mo | ₹1,799/yr, Pro ₹499/mo | ₹3,499/yr
- **CBSE syllabus verification**: reference curriculum for Class 10, exact + fuzzy matching
- PDF 404 fixes: corrected 5/7 CBSE filename slugs, added pdfStatus/markingSchemeStatus fields
- Analytics chapter scoping fix: remediation center shows current chapter, clears cache on switch

### Session 3: Auth, Payments & Sync (June 1, 2026)

- **Auth flow wiring**: Landing → AuthView → Dashboard, guest bypass, returning-user auto-login, sidebar sign-out
- **Razorpay checkout**: OffersView upgrade button creates server order, opens modal, verifies payment, updates plan
- **Real plan gating**: DEV_FORCE_PRO=false, removed all dev UI (badge, unlock button, settings toggle)
- **localStorage→SQLite sync**: 9 new DB tables, 18 CRUD functions, /api/sync/pull + /api/sync/push, debounced push + pull-on-login
- Console.log cleanup + .env.example updated with JWT_SECRET, RAZORPAY keys
- Bug fixes: removed mock profile data, Mistakes Notebook carousel redesign, JEE tag filter for Class 10

### Session 4: Accounts, Theming & Class 11/12 (June 2, 2026)

- **Account system** (Settings → Account): guest mode banner, inline auth, editable profile (name, email, class, stream, track)
- **Global theme system**: ThemeContext.tsx — dark mode, 6 brand colors, 4 fonts, persisted to localStorage
- **Class 11/12 stream support**: Science/Commerce streams, `stream` field flows through entire pipeline
- **Landing page rewrite**: 10 sections (Hero, Problem, Solution, Modes, Learning Loop, Analytics, Exam Prep, Pricing, Parents, CTA)
- Owner detection: 3-method approach (email → JWT decode → self-heal), owner emails auto-get Exam Pro
- Free plan limits raised: 3→7 kits/day, 7 quizzes/day

### Session 5: Accessibility & CBSE Content Quality (June 3, 2026)

- **Dark mode WCAG AA**: ~120 CSS rules converting all Tailwind pastel classes to dark-mode-safe variants
- **CBSE exam-focused prompts**: "SENIOR teacher with 15+ years" persona, 9-point content requirements, NCERT-only validation
- **Formula Reference tables**: `formulaTable` in kit generation + rendering in VisualHub and ReadWriteHub
- **Key Vocabulary carousel**: VocabCarousel component with flip-card animation, prev/next navigation, grid toggle
- **Study workspace recommendations**: `getRecommendedStyle(subject)` maps subjects to optimal note styles (Smart/Cornell/Concept Map)
- Flowchart visibility improvements

### Session 6: Gamification & Mastery (June 3-4, 2026)

- **XP/streak sidebar**: reads from activityService, level formula (floor(xp/200)+1), expandable panel with 30-day heatmap
- **BKT mastery model**: Bayesian Knowledge Tracing with Corbett & Anderson params, per-topic P(Learned) tracking
- **Ebbinghaus forgetting curve**: exponential decay P(L,t) = P(Lₙ) × e^(-t/S), stability S grows on success (×1.5), shrinks on failure (÷2)
- **VARK breakdown fix**: library items saved with correct mode type, ProgressView calculation uses activity log
- **VARK backfill migration**: infers mode from title prefixes or kit data density for legacy items
- **Bloom's taxonomy tagging**: recall/understand/apply/analyze on all quiz questions, flows to cognitive radar chart
- **CBSE chapter configs**: Physics (11), Chemistry (9), Biology (9), Mathematics (12) — all Class 11
- **Topper's notebook prompt**: replaced teacher persona with exam-topper style across all note types + kit generation
- **Note-type analytics**: /api/analytics/note-types endpoint, 'note-view' activity type
- Last-studied timestamp fix via touchLibraryItem()

### Session 7: Dense Notes & Content Quality (June 4, 2026)

- **Dense slide format (v2)**: SmartSlide type with structured sections (definitions, tables, comparison panels, compact grid, formulae, step method, solved example, common mistake, exam tip)
- **Note type consolidation**: 7 → 3 (Smart/Cornell/Concept Map). Removed Outline, Table, Recall, Atomic
- **Overview slide elimination**: Server prompt Rule 0 bans "Overview"/"Introduction" as first slide; frontend filter defense
- **Markdown stripping**: stripMarkdown() removes **, *, #, ` from all slide content
- **CBSE 2025-26 competency questions**: 50% competency-based, 5-mark multi-part [2+2+1], subject-aware patterns
- **Key Vocabulary relayout**: separate card in right column, formula table in left column with subject-aware headers
- **Research documentation**: topper's notebook patterns, CBSE marking scheme research

### Session 8: Reliability & QA Audit (June 5-6, 2026)

- **Generation timeout fix**: 45s per-attempt timeout in callGemini(), model chain reorder, dedicated TIMEOUT error class, queue 180s, frontend AbortController 170s, auto-retry for transient errors
- **v1/v2 note migration banner**: amber "Updated format available" banner for old SMART notes, one-click Upgrade
- **Auto-continue for truncated responses**: server validates ≥4 slides, sends continuation prompt if fewer
- **Mobile responsive fixes**: dense slide grids (comparison panels, compact grid, formulae, step method, tables), formula table 3rd column hidden on mobile
- **Full QA audit**: 30 features audited, 21 bugs found, 19 fixed, 2 deferred
  - P0: buildSlides crash (sec.content as array instead of string) — fixed with asString() coercer
  - P1: 7 null-safety crashes in RevisionEngineView, 2 in LibraryView, 1 in FlashcardsView — all fixed
  - P1: AI timeout, error classification, truncation, frontend abort, auto-retry — all fixed
  - P2 deferred: localStorage plan bypass (server enforces real caps), dark mode on v1/v2 banner
- **Tested 5 chapters**: Sets (5 slides), Laws of Motion (7), Basic Concepts of Chemistry (8), Financial Statements (8), The Living World (7)
- **Documentation**: QA Audit Report + Project Progress DOCX in `docs/`

---

## 3. Completed Features

### 3.1 Core Learning Flow

- **Landing Page** — 10-section marketing page with pricing, benefits, and CTA
- **Auth System** — JWT register/login/session with guest bypass and auto-login
- **Dashboard** — Central hub with streak, XP, library preview, exam mode toggle (CBSE/JEE/SAT/NEET)
- **Revision Kit Generation** — AI generates comprehensive kit (summary, key points, vocab, concept maps, quiz, flashcards, audio, formula table)
- **Chapter Library** — Full CBSE Class 10/11/12 syllabus with Science/Commerce streams, per-chapter mode selection
- **Syllabus RAG** — Chapter content chunked for grounded prompt generation

### 3.2 Learning Modes

- **Visual Hub** — Mind maps, concept maps, flowcharts, formula tables, 3D models (Pro)
- **Read/Write Hub** — Study notes (Smart/Cornell/Concept Map), exam questions (CBSE 2025-26 competency), formula reference, vocab carousel, written answer practice
- **Aural Hub** — Sarvam AI narration (5 voice styles), lecture notes, vocabulary, keyword challenge
- **Practice Quiz** — MCQ with difficulty, Bloom's taxonomy tagging (recall/understand/apply/analyze), score tracking
- **Study Notes Panel** — 3 note styles, dense slide format (v2) with tables/formulae/comparisons, v1→v2 migration banner

### 3.3 Assessment & Review

- **AI Quiz View** — Standalone AI-generated quiz from weak topics, focused review, or YouTube recall
- **Quiz Scoring** — Auto-grading with per-question explanations, topic tags, cognitive level
- **Test Review View** — Review wrong answers with full answer detail
- **Mistakes Notebook** — Aggregated wrong answers, chapter carousel, focused review generation
- **Written Answer Evaluation** — AI grades typed answers against CBSE marking scheme with keyword analysis and model answers

### 3.4 Mastery & Analytics

- **BKT Mastery Model** — Bayesian Knowledge Tracing per topic (Corbett & Anderson 1994 params)
- **Ebbinghaus Forgetting Curve** — Exponential decay with stability tracking, revision scheduling at 70% retention point
- **Analytics Dashboard** — Test analysis, weak topics, score analysis, cognitive breakdown radar chart
- **Progress View** — XP tracking, level progression, learning activity chart, subject breakdown, VARK distribution
- **Activity Logging** — Every action logged with XP rewards, drives streak and analytics

### 3.5 Study Tools

- **Flashcards** — AI-generated with flip animation, topic tags, difficulty
- **Daily Tasks / Todo** — Auto-generated revision tasks based on weak topics and spaced repetition
- **Monthly Planner** — Calendar-based revision scheduler with forgetting-curve events and exam dates (Pro)
- **YouTube Recall** — Generate recall kit from any YouTube study video
- **Camera Scan** — Generate revision kits from pasted text/notes
- **Doubt Solver (Klaro AI)** — AI chat for study strategy and concept questions
- **PDF Export** — Download study materials as formatted PDF

### 3.6 Gamification

- **XP System** — Points per activity type (kit: 20, quiz: 30, flashcards: 15, etc.)
- **Levels** — Beginner → Learner → Scholar → Achiever → Expert → Master → Grandmaster (200 XP each)
- **Streak Tracking** — Current/longest streak, 30-day activity calendar heatmap
- **Expandable sidebar panel** — Level progress, XP breakdown, streak details

### 3.7 Billing & Plans

| Feature | Free | Plus (₹249/mo) | Exam Pro (₹499/mo) |
|---------|------|----------------|---------------------|
| Daily kits | 7 | 20 | 50 |
| Daily quizzes | 7 | 30 | 100 |
| Note styles | Smart only | + Cornell | + Concept Map |
| PDF export | ✗ | ✓ | ✓ |
| Audio narration | ✗ | ✓ | ✓ |
| YouTube Recall | ✗ | 5/month | 30/month |
| Written answers | ✗ | 15/day | 50/day |
| Monthly planner | ✗ | ✗ | ✓ |
| Mastery tracking | ✗ | ✗ | ✓ |
| Advanced analytics | ✗ | ✗ | ✓ |

- **Razorpay integration** — INR pricing, order creation + HMAC verification
- **Usage counters** — Daily/monthly with automatic reset
- **Owner bypass** — Specific emails auto-get Exam Pro
- **Server-side rate limiting** — Per-IP, per-bucket, per-plan enforcement

### 3.8 Infrastructure

- **37+ API endpoints** — Kit generation, quiz, flashcards, notes, audio, answer evaluation, YouTube recall, auth, payments, sync, analytics
- **AI pipeline** — 4-model fallback chain with 45s per-attempt timeout, truncated JSON repair, auto-continue for short responses
- **Request queue** — 5 concurrent, 180s timeout, request tracking with IDs
- **Response cache** — In-memory LRU with 1-hour TTL
- **Rate limiting** — Per-endpoint, per-plan, per-IP limits
- **SQLite database** — WAL mode, 15 tables, JSON migration, parameterized queries
- **Client-server sync** — Push/pull with debouncing, auth-gated
- **Docker** — Multi-stage Dockerfile, docker-compose, health checks
- **Structured logging** — Request IDs, durations, plan tracking

### 3.9 UX & Theming

- **Dark mode** — WCAG AA compliant, ~120 CSS rules for contrast
- **Theme customization** — 6 brand colors, 4 fonts (Inter, Poppins, etc.)
- **Sidebar navigation** — 10 items, expandable streak/XP panel
- **Global back button** — History-stack navigation
- **Toast notifications** — Non-blocking success/warning/error/info
- **Mobile responsive** — Sidebar hidden on mobile, responsive grids, table scroll

---

## 4. Pending Work

### 4.1 Critical — Before Launch

| Item | Status | Details |
|------|--------|---------|
| **Real Razorpay keys** | Config only | Test keys work; need production key switch and end-to-end payment testing |
| **Email verification** | Not started | Password reset, email confirmation flows |
| **Mobile navigation** | Not started | Sidebar hidden on mobile, no hamburger menu or bottom nav |
| **Production deployment** | Not started | CORS, HTTPS, domain config, environment variables |

### 4.2 High Priority — Feature Gaps

| Item | Status | Details |
|------|--------|---------|
| **Admin Syllabus Manager** | Stub only | `AdminSyllabusManager.tsx` shows "Coming Soon" |
| **Interactive 3D Models** | Not started | Premium 3D science models (heart, atom) — Pro feature listed but not built |
| **Mock Test Mode** | Not started | Listed as Pro feature in billing limits |
| **Offline/PWA** | Not started | Service worker for intermittent connectivity |

### 4.3 Infrastructure — Scaling

| Item | Status | Details |
|------|--------|---------|
| **Redis** | TODO | Cache, queue, and rate limiter all use in-memory stores. Need Redis for multi-instance |
| **Test suites** | Not started | No unit, integration, or E2E tests |
| **CI/CD** | Not started | No GitHub Actions or CI pipeline |
| **Analytics/telemetry** | Not started | No product analytics (Mixpanel, PostHog) |

### 4.4 Known Issues (Deferred from QA Audit)

1. **localStorage plan bypass (P2)** — Users can set `klaro:plan` to 'pro' in DevTools. Server rate-limiter enforces real caps, so AI generation limits hold. Acceptable for MVP.
2. **Dark mode on v1→v2 upgrade banner (P2)** — Hardcoded amber-50 colors. Should use CSS variables or dark: variants.

---

## 5. Architecture

```
D:\insight-learning-hub-v3\
│
├── server.ts                      # Express backend (37+ API endpoints, Gemini AI)
├── server/
│   ├── auth.ts                    # JWT authentication (register/login/me)
│   ├── payments.ts                # Razorpay order creation + verification
│   ├── database.ts                # SQLite persistence (15 tables, WAL mode)
│   ├── cache.ts                   # In-memory response cache with TTL
│   ├── queue.ts                   # AI request concurrency queue (5 concurrent, 180s timeout)
│   ├── rateLimiter.ts             # Per-endpoint, per-plan rate limiting
│   ├── validate.ts                # Input validation middleware
│   ├── logger.ts                  # Structured logging with request IDs
│   ├── syllabusVerifier.ts        # CBSE syllabus verification
│   ├── data/
│   │   └── chapterWeightage.ts    # Audio generation chapter configs
│   └── services/
│       └── sarvamService.ts       # Sarvam AI TTS integration
│
├── src/
│   ├── App.tsx                    # Root component, routing, state management
│   ├── main.tsx                   # React entry point
│   ├── index.css                  # Global styles (Tailwind + dark mode WCAG rules)
│   ├── types/index.ts             # All TypeScript interfaces and types
│   ├── contexts/
│   │   ├── AuthContext.tsx         # JWT session management
│   │   └── ThemeContext.tsx        # Dark mode, colors, fonts
│   ├── components/
│   │   ├── layout/
│   │   │   └── Sidebar.tsx        # Navigation + XP/streak panel
│   │   └── views/                 # 29 view components
│   ├── data/
│   │   ├── syllabus.ts            # CBSE Class 10/11/12 chapter metadata
│   │   ├── cbseChapterContext.ts   # Chapter weightage + question patterns
│   │   ├── syllabusChunks.ts      # Chapter content for RAG retrieval
│   │   ├── syllabusRetrieval.ts   # Chunk retrieval logic
│   │   ├── previousYearPapers.ts  # CBSE paper links
│   │   └── syllabusVersions.ts    # Syllabus versioning
│   ├── lib/
│   │   ├── pdfExport.ts           # PDF generation utilities
│   │   └── tts.ts                 # Browser speech synthesis wrapper
│   └── services/
│       ├── aiService.ts           # Frontend API client (fetch wrappers)
│       ├── billingService.ts      # Plan management, usage counters, paywalls
│       ├── learningService.ts     # Learning loop (quiz history, BKT mastery, tasks)
│       ├── activityService.ts     # XP, streak, activity logging
│       ├── libraryService.ts      # Library item utilities
│       └── syncService.ts         # Client-server data sync
│
├── docs/
│   ├── Klaro-QA-Audit-Report.docx    # Full QA audit report
│   └── Klaro-Project-Progress.docx   # Project progress documentation
│
├── data/
│   └── klaro.db                   # SQLite database file
│
├── Dockerfile                     # Multi-stage production build
├── docker-compose.yml             # Container orchestration
├── vite.config.ts                 # Vite + React + Tailwind config
├── tsconfig.json                  # TypeScript configuration
└── package.json                   # Dependencies and scripts
```

---

## 6. API Endpoints

| Method | Path | Description | Auth | Rate Limited |
|--------|------|-------------|------|-------------|
| POST | `/api/auth/register` | Create new account | No | No |
| POST | `/api/auth/login` | Sign in | No | No |
| GET | `/api/auth/me` | Validate JWT session | Yes | No |
| POST | `/api/payments/create-order` | Create Razorpay order | Yes | No |
| POST | `/api/payments/verify` | Verify payment | Yes | No |
| GET | `/api/sync/pull` | Pull server data to client | Yes | No |
| POST | `/api/sync/push` | Push client data to server | Yes | No |
| GET | `/api/health` | Server health + uptime | No | No |
| GET | `/api/usage` | Rate limit usage stats | No | No |
| GET | `/api/dashboard-data` | Library + user stats | No | No |
| GET | `/api/get-kit/:id` | Retrieve saved kit | No | No |
| GET | `/api/check-paper-link` | Verify CBSE paper URL | No | No |
| GET | `/api/analytics/note-types` | Note style usage analytics | No | No |
| POST | `/api/save-to-library` | Save item to library | No | No |
| POST | `/api/update-stats` | Update user stats | No | No |
| POST | `/api/delete-library-item` | Remove from library | No | No |
| POST | `/api/cleanup-library` | Remove duplicates | No | No |
| POST | `/api/verify-syllabus` | Verify chapter list | No | No |
| GET | `/api/verify-chapter` | Verify single chapter | No | No |
| POST | `/api/generate-kit` | Generate revision kit | No | Yes |
| POST | `/api/generate-study-notes` | Generate study notes | No | Yes |
| POST | `/api/generate-flashcards` | Generate flashcard deck | No | Yes |
| POST | `/api/generate-quiz` | Generate standalone quiz | No | Yes |
| POST | `/api/generate-audio` | Generate TTS audio | No | Yes |
| POST | `/api/evaluate-exam-answer` | Evaluate typed answer | No | Yes |
| POST | `/api/evaluate-answer` | Evaluate answer (general) | No | Yes |
| POST | `/api/youtube-recall` | Generate YouTube recall kit | No | Yes |
| POST | `/api/ai/generate-summary` | Generate text summary | No | Yes |
| POST | `/api/ai/generate-weak-topic-analysis` | Analyze weak topics | No | Yes |
| POST | `/api/ai/generate-focused-review` | Generate focused review | No | Yes |

---

## 7. How to Run

### Prerequisites
- Node.js 22+
- Gemini API key ([get one here](https://aistudio.google.com/apikey))
- (Optional) Sarvam API key for AI narration ([get one here](https://dashboard.sarvam.ai))
- (Optional) Razorpay keys for payment testing

### Development
```bash
npm install
# Create .env with: GEMINI_API_KEY=your_key
# Optional: SARVAM_API_KEY, JWT_SECRET, RAZORPAY_KEY_ID, RAZORPAY_KEY_SECRET
npm run dev
# Open http://localhost:3000
```

### Docker
```bash
docker compose up --build
```

### Build for Production
```bash
npm run build    # Vite frontend + esbuild backend → dist/
npm start        # Serves from dist/
```

---

## 8. Key Design Decisions

1. **Server-side AI only** — The Gemini API key never reaches the frontend. All AI calls go through Express endpoints. `aiService.ts` is a thin fetch wrapper.

2. **4-model fallback chain** — `gemini-2.5-flash` → `gemini-2.0-flash` → `gemini-2.5-flash-lite` → `gemini-2.0-flash-lite`. Each attempt has a 45s timeout. Lite models are last resort since they struggle with large prompts.

3. **SQLite over JSON** — Migrated from `klaro-db.json` to SQLite (better-sqlite3) in Session 2 for proper relational queries, transactions, and WAL mode concurrency.

4. **BKT + Ebbinghaus hybrid** — Mastery estimation combines Bayesian Knowledge Tracing (per-question learning probability update) with Ebbinghaus forgetting curves (exponential decay based on stability). Revision scheduling targets the 70% retention point.

5. **Dense slide format** — SMART notes use structured JSON (definitions, tables, comparison panels, formulae, solved examples) instead of free-text. This enables consistent rendering and mobile-responsive layouts.

6. **Owner billing override** — Specific email addresses automatically get Exam Pro plan. This avoids payment friction during development while keeping the billing system real for all other users.

7. **Freemium gating** — Every premium feature checks plan limits via gate functions. Server rate-limiter enforces real caps per IP/bucket regardless of what the client claims.

8. **CBSE 2025-26 alignment** — All content generation prompts enforce NCERT-only content, competency-based exam patterns (50%), and Bloom's taxonomy question tagging. Chapter configs include mark weightage and high-yield topics.

---

## 9. QA Audit Summary (Session 8)

Full audit across 30 features. **21 bugs found, 19 fixed, 2 deferred**.

| Category | Found | Fixed | Status |
|----------|-------|-------|--------|
| Null-safety crashes (RevisionEngine, Library, Flashcards, StudyNotes) | 11 | 11 | ✅ |
| AI timeout/retry (callGemini, queue, frontend abort) | 5 | 5 | ✅ |
| Mobile responsive (dense slides, formula table) | 3 | 3 | ✅ |
| Deferred (plan bypass, dark mode banner) | 2 | 0 | ⏳ |

Full details in `docs/Klaro-QA-Audit-Report.docx`.

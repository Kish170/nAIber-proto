# Web Frontend — Phase 1 Product Requirements

## Purpose

This document defines the Phase 1 requirements for the nAIber web frontend. The web app serves two distinct user types — caregivers and elderly users — with separate layouts, interaction patterns, and design scales. It is the companion interface to the voice-first product, not the primary interaction surface for elderly users.

Phase 1 scope is limited to the journey flows, pages, and components enumerated in this document. Future phases will add session analytics depth, caregiver notification management, and additional cognitive reporting.

---

## Stack

| Concern | Choice | Rationale |
|---|---|---|
| Framework | Next.js App Router | Separate layout shells per user type, middleware-based auth routing, server components for dashboard data fetching |
| Language | TypeScript | End-to-end type safety via tRPC |
| Styling | Tailwind CSS + shadcn/ui | Radix primitives handle accessibility for the elderly interface; single token set with elderly mode overrides |
| Charts | Recharts | Composable, handles time-series, React-native |
| Server state | React Query | Dashboard data, session history, trend data, caching |
| Client state | Zustand | Onboarding step tracking, active user switcher, modal state |
| Auth | NextAuth.js | Credentials provider for caregivers, custom magic link provider for elderly users |
| API | tRPC | Type-safe API client from a single `AppRouter` type import |

---

## Schema Additions Required

Before frontend implementation, the following additions to the Prisma schema are required.

### New models

```prisma
model CaregiverAccount {
  id            String    @id @default(uuid())
  email         String    @unique
  name          String
  phone         String?
  passwordHash  String?
  authProvider  String    @default("email")
  relationship  Relationship
  createdAt     DateTime  @default(now())
  updatedAt     DateTime  @updatedAt
  lastLoginAt   DateTime?
  managedUsers  CaregiverUserLink[]
  @@map("caregiver_accounts")
}

model CaregiverUserLink {
  id          String           @id @default(uuid())
  caregiverId String
  userId      String
  isPrimary   Boolean          @default(false)
  status      LinkStatus       @default(ACTIVE)
  createdAt   DateTime         @default(now())
  caregiver   CaregiverAccount @relation(fields: [caregiverId], references: [id])
  user        User             @relation(fields: [userId], references: [id])
  @@unique([caregiverId, userId])
  @@map("caregiver_user_links")
}

enum LinkStatus {
  PENDING
  ACTIVE
  REMOVED
}
```

### Additions to `User`

```prisma
email             String?          @unique
hasWebAccess      Boolean          @default(false)
activationStatus  ActivationStatus @default(PENDING)
webAccessToken    String?

enum ActivationStatus {
  PENDING
  ACTIVE
  OPTED_OUT
}
```

---

## Page Inventory

| Page | User Type | Route |
|---|---|---|
| Landing / marketing | Public | `/` |
| Caregiver signup | Caregiver | `/signup` |
| Email verification | Caregiver | `/verify` |
| Caregiver login | Caregiver | `/login` |
| Elderly user onboarding (7 steps) | Caregiver | `/onboarding/[step]` |
| Caregiver dashboard — overview | Caregiver | `/dashboard` |
| Caregiver dashboard — session detail | Caregiver | `/sessions/[sessionId]` |
| Caregiver dashboard — observations | Caregiver | `/observations` |
| Caregiver dashboard — profile | Caregiver | `/profile` |
| Caregiver settings | Caregiver | `/settings` |
| Invite second caregiver | Caregiver | `/profile` (inline flow) |
| Elderly user activation (magic link) | Elderly user | `/activate` |
| Elderly user onboarding (2 steps) | Elderly user | `/welcome/[step]` |
| Elderly user dashboard | Elderly user | `/home` |
| Elderly user profile | Elderly user | `/profile` |
| 404 / error states | Both | `not-found.tsx` |

---

## Routing and Middleware

Route groups enforce the layout split:

- `(public)` — no auth required, no layout shell
- `(caregiver)` — requires caregiver session, renders `CaregiverShell` layout
- `(elderly)` — requires elderly session, renders `ElderlyShell` layout with `data-mode="elderly"` on the root element

`middleware.ts` handles three cases on every request:
1. Unauthenticated user hitting a protected route → redirect to login
2. Caregiver hitting an elderly route or vice versa → redirect to correct root
3. Authenticated caregiver with no managed users → redirect to onboarding

---

## Caregiver Journey

### Signup and Authentication

- **Entry:** Landing page with a single CTA — "Get started"
- **Step 1 — Account creation:** Full name, email, password or magic link option, phone number, terms and privacy agreement
- **After submission:** Email verification required before proceeding
- **Step 2 — Post-verification:** Empty dashboard with gated navigation. Prominent prompt: "To get started, add the person you're caring for." No other nav is accessible until at least one elderly user is registered.

### Onboarding an Elderly User (7-step flow)

Multi-step form with one topic per screen. Progress indicator shown throughout. All steps completable by the caregiver alone. Each screen carries the note: "Fill in what you know — you can update anything later."

**Step 1 — Basic profile**
- Full name, date of birth, gender, phone number (the number nAIber will call), primary language, email (optional — only needed if elderly user wants web access)

**Step 2 — Communication preferences**
- Preferred call time window: morning (8am–12pm), afternoon (12pm–5pm), evening (5pm–8pm)
- Call frequency: daily, weekly
- Interests (free text with suggested tags): "What does [name] enjoy talking about?"
- Dislikes: "Is there anything [name] prefers to avoid in conversation?"

**Step 3 — Health context**
- Active health conditions (searchable, multiple) → `UserHealthCondition`
- Current medications (name, dosage, frequency, multiple) → `UserMedication`

**Step 4 — Cognitive onboarding**
Presented with the preamble: "These questions help us understand [name]'s baseline so we can track changes accurately over time."
- Education level (maps to `EducationLevel` enum)
- Self-reported memory concerns from caregiver's perspective: yes / no / unsure
- Enable cognitive wellness checks: yes / no toggle
- Open text: "How would you describe [name]'s typical communication style?"

**Step 5 — IQCODE-style structured observations**
Preamble: "The next few questions are about changes you may have noticed in [name]. Answer based on what you've observed compared to a few years ago."
- 7 structured questions: Never / Sometimes / Often / Very Often or No change / Slight change / Noticeable change / Big change
- 2 open text fields
- Reference point: "When did you first start noticing any changes, if at all?"
- Auto-creates the `TrustedContact` record and first `TrustedContactSubmission` from the caregiver's account data

**Step 6 — Emergency contact**
- Name, phone, email (optional), relationship
- Notification preference: notify on missed calls yes / no
- Maps to `EmergencyContact`

**Step 7 — Elderly user activation**
Two parts:

*Part A — Web access decision (caregiver)*
- "Would [name] like access to their own simplified nAIber dashboard?"
- Yes → email field shown if not entered, web access queued
- No → phone-only mode, proceed to Part B

*Part B — Activation confirmation*
- Summary of what nAIber will do, shown to caregiver
- Checkbox: "I have discussed nAIber with [name] and they understand what to expect"
- System queues an activation call or SMS to the elderly user's phone

**Completion state:** Caregiver lands on the elderly user's profile page. Status badge shows "Awaiting [name]'s confirmation." All profile data visible and editable. Cognitive wellness check shown as "Scheduled after activation."

### Dashboard — Ongoing Usage

**Layout:** Left sidebar (240px), main content area, user switcher at top of sidebar.

**User switcher:** Avatar + name cards for all managed users. Active user highlighted. "+ Add another person" at the bottom. Multi-user home screen shows one overview card per user with stability status, last check-in date, and active flags.

**Main dashboard (per elderly user):**

*Overview section*
- User name and photo placeholder
- Activation status badge
- Baseline validity state: "Building baseline (1 of 3 sessions complete)"
- Last check-in: date and outcome
- Next scheduled check-in
- Active flags

*Stability section (shown after baseline is valid)*
- Composite stability index: large number, color-coded status
- Trend graph: Recharts line chart, one line per domain, toggleable
- Informant concern index: separate line, visually distinct
- Agreement/divergence indicator between the two

*Session history*
- List of completed sessions with date, stability index, flags
- Click through to session detail

*Session detail view*
- Domain scores per task
- Notable signals: latency, fluency word count, perseveration flags
- Wellbeing check responses
- Distress flag if triggered
- Content set used (word list, digit set)
- Test version

*Observations section*
- Current IQCODE submission summary
- Last submitted date
- "Update observations" button → triggers new submission flow
- Submission history

*Notifications*
- Chronological list: drift detected, session flagged, missed calls, activation events

### Adding a Second Caregiver

From the elderly user's profile, "Manage caregivers" section shows current caregivers and an "Invite another caregiver" button.

Invite flow:
1. Enter email of second caregiver
2. Select their relationship to the elderly user
3. Optional message
4. System sends invite email with link
5. Second caregiver: if account exists → logged in, elderly user added to their managed users; if no account → caregiver signup first, then link connects automatically
6. `CaregiverUserLink` created with `status: PENDING` until accepted, then `ACTIVE`

---

## Elderly User Journey

### Authentication

Magic link only — no password. Login screen: single email or phone field + "Send me a link" button. Large text, high contrast, one action per screen.

### Activation Flow

After onboarding completes, the elderly user receives:

- **Phone-only:** Automated call — "Hi [name], this is nAIber. [Caregiver name] has set up regular check-in calls for you. Your first call will be on [date]. To confirm you're happy with this, please press 1. To opt out, press 2."
- **Web access enabled:** SMS or email magic link — "[Caregiver name] has set up nAIber for you. Click here to confirm and set up your access."

`activationStatus` transitions:
- Press 1 / link clicked → `ACTIVE`
- Press 2 → `OPTED_OUT`, caregiver notified
- No response in 48 hours → one follow-up, then caregiver notified to follow up manually

### Onboarding (2 steps — their portion)

**Step 1 — Confirmation**
- Name shown prominently
- Plain language: "nAIber will call you regularly for a friendly chat and occasional short exercises. [Caregiver name] will be able to see how you're doing over time."
- Single button: "That sounds good"
- Small link: "I'd like to opt out"

**Step 2 — Personal preferences (optional)**
- "Tell us a bit about yourself so we can have better conversations"
- Interests: pre-filled by caregiver, editable
- Dislikes: pre-filled, editable
- Preferred name: "What would you like us to call you?"

No health forms. No clinical questions. Simple and warm.

### Dashboard — Ongoing

**Home screen**
- "Hello [preferred name]" — large, warm greeting (Lora display font)
- Last check-in: LLM-generated confirmation, always positive framing — "Your last chat was on Tuesday. Everything looks consistent."
- Next scheduled call: "Your next call is on Friday morning"
- Consistency indicator: "You've had 8 check-ins this month" — participation only, no scores

**Profile page**
- Name, phone number
- Preferred call time
- Interests and dislikes — editable
- Preferred name — editable

That is the full scope for Phase 1. No session scores, no graphs, no clinical data visible to elderly users.

---

## Design System

### Design Principles

**Brand personality:** Companion. Warm, quietly present — nothing clinical, nothing data-forward, nothing that makes the elderly user feel monitored.

**Elderly mode:** Applied via `data-mode="elderly"` on the root `<html>` element. One component tree, one token set. CSS handles scale and density — no conditional rendering in components.

### Colour

The full palette is defined in `globals.css`. Key semantic mappings:

| Token | Light value | Purpose |
|---|---|---|
| `--background` | `#ffffff` | Page background |
| `--primary` | `#030213` | CTAs, active states |
| `--color-teal` | `#5B8C8A` | Brand accent |
| `--color-ivory` | `#FAF7F2` | Warm surface background |
| `--color-stable` | `#5B8B6E` | Stable status |
| `--color-monitor` | `#C4924A` | Monitor status |
| `--color-notable` | `#B86B45` | Notable change |
| `--color-significant` | `#9E4A4A` | Significant change |

No pure white surfaces, no pure black text, no high-saturation alert colors anywhere.

### Typography

- **Display / Headings:** Lora (humanist serif)
- **Body / UI:** DM Sans (geometric, highly legible)

Standard caregiver scale: 12px–36px. Elderly scale: 14px–46px. Both scales defined in `globals.css` and `elderly.css` respectively.

### Spatial System

8px base grid. Elderly mode uses approximately 1.5× the standard spacing scale. Touch targets: 48px minimum in elderly mode, 36px in caregiver mode.

### Motion

- Page transitions: 200ms fade
- Component entry: 150ms ease-out opacity
- No looping animations anywhere in the elderly interface
- All animations (except page transitions) disabled in elderly mode via `elderly.css`

### What Elderly Mode Changes

| Property | Standard | Elderly |
|---|---|---|
| Body font size | 16px | 20px |
| Touch targets | 36px min | 48px min |
| Card padding | 24px | 32px |
| Spacing scale | Standard | ~1.5× |
| Animations | Present | Disabled (except page transition) |
| Navigation | Left sidebar | Bottom tab bar (max 4 items) |
| Status communication | Color + text | Color + icon + text |
| Tooltips | Allowed | None — all info visible by default |
| Hover-only states | Allowed | None — all accessible on tap |

---

## File Structure

```
apps/web/src/
├── app/
│   ├── (public)/         # Landing, login, signup
│   ├── (caregiver)/      # Caregiver shell layout + all caregiver pages
│   │   └── onboarding/[step]/
│   ├── (elderly)/        # Elderly shell layout + home, profile, activate
│   └── api/auth/         # NextAuth route handler
├── components/
│   ├── ui/               # shadcn components
│   ├── common/           # Logo, PageHeader, LoadingSpinner, ErrorBoundary, EmptyState
│   ├── caregiver/
│   │   ├── layout/       # CaregiverShell, Sidebar, UserSwitcher, NotificationPanel
│   │   ├── dashboard/    # StabilityIndexCard, TrendGraph, RecentSessionsList, etc.
│   │   ├── sessions/     # SessionCard, SessionDetailView, DomainScoreGrid, etc.
│   │   ├── observations/ # ObservationForm, SubmissionHistory, InformantScoreSummary
│   │   └── onboarding/   # OnboardingProgress, steps/
│   └── elderly/
│       ├── layout/       # ElderlyShell, ElderlyNav
│       ├── home/         # WelcomeCard, LastCheckInCard, NextCallCard, ConsistencyBadge
│       └── activate/     # ActivationConfirm, PreferencesStep
├── hooks/
│   ├── useSession.ts
│   ├── useActiveUser.ts
│   ├── useCognitiveData.ts
│   └── useOnboarding.ts
├── stores/
│   ├── activeUser.store.ts    # Zustand — selected elderly user
│   ├── onboarding.store.ts    # Zustand — onboarding form state, sessionStorage persisted
│   └── ui.store.ts            # Zustand — sidebar, modals, notification panel
├── lib/
│   ├── trpc.ts
│   ├── auth.ts
│   └── utils.ts               # cn() and helpers
├── styles/
│   ├── globals.css            # CSS variables, Tailwind base, Figma design tokens
│   └── elderly.css            # Elderly mode scale and density overrides
└── middleware.ts
```

---

## State Management

### Zustand stores

```ts
// activeUser.store.ts
// Which elderly user is currently selected in the caregiver switcher
interface ActiveUserStore {
  activeUserId: string | null
  setActiveUser: (id: string) => void
}

// onboarding.store.ts
// Accumulated form data across all 7 onboarding steps.
// Persisted to sessionStorage — survives browser refresh.
interface OnboardingStore {
  currentStep: number
  formData: Partial<OnboardingFormData>
  setStep: (step: number) => void
  updateFormData: (data: Partial<OnboardingFormData>) => void
  reset: () => void
}

// ui.store.ts — transient UI state only, nothing that survives navigation
interface UIStore {
  sidebarOpen: boolean
  notificationPanelOpen: boolean
  activeModal: string | null
  setSidebarOpen: (open: boolean) => void
  openModal: (id: string) => void
  closeModal: () => void
}
```

### React Query

All server state. Query keys follow a consistent hierarchy so invalidating a parent cascades to all children:

```ts
['caregiver', caregiverId]
['caregiver', caregiverId, 'users']
['user', userId]
['user', userId, 'cognitive', 'baseline']
['user', userId, 'cognitive', 'sessions']
['user', userId, 'cognitive', 'sessions', sessionId]
['user', userId, 'cognitive', 'trends']
['user', userId, 'observations']
```

Invalidating `['user', userId]` cascades to invalidate all data for that user — used after onboarding completes or after a new session is recorded.

---

## API Layer (apps/api)

tRPC routers:

```
apps/api/src/routers/
├── auth.router.ts
├── caregiver.router.ts
├── user.router.ts           # elderly user profile
├── cognitive.router.ts
├── session.router.ts        # test results, history
├── observations.router.ts   # trusted contact submissions
└── index.ts                 # appRouter — merges all routers
```

Procedure types:
- `publicProcedure` — unauthenticated: magic link generation, auth endpoints
- `caregiverProcedure` — requires `CaregiverAccount` session
- `elderlyProcedure` — requires elderly `User` session

The most critical export is the `AppRouter` type from `apps/api`. The frontend tRPC client imports this type for full end-to-end type safety without importing server code.

---

## Language and Copy Tone

### For elderly users
- First name always, never formal address
- Short sentences, one idea at a time
- Positive framing — what happened, not what didn't
- No clinical language anywhere
- Confirmatory not instructional — "You're all set" not "Complete the following steps"

### For caregivers
- Professional but warm — data-forward without being cold
- Plain language for clinical concepts — stability index explained on first encounter
- Action-oriented — every flag has a suggested next step
- Never alarmist — status changes are information, not emergencies

---

## What This Avoids

- Pure white backgrounds — ivory only
- Pure black text — `--color-warm-900` only
- High-saturation colors anywhere in the palette
- Sharp corners on primary surfaces
- Dense data tables in the elderly interface
- Tooltips or hover-dependent interactions in elderly mode
- Generic SaaS purple/blue/gradient combinations
- Icons without text labels
- Color-only status communication

---

## Known Gaps

- **Onboarding validation rules** for each step field (required vs optional, format constraints) are not specified here — to be defined during implementation
- **LLM-generated copy** for the elderly home screen ("Your last chat was...") needs a defined generation prompt and fallback for no-session state
- **Activation call script** is described in intent but not as a formal prompt — coordinate with `server/src/prompts/` before implementation
- **Second caregiver invite** email template is not designed
- **`TrendGraph` content set version markers** on the time axis require a defined data shape from the session schema

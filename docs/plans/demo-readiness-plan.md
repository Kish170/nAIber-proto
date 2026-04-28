# Demo Readiness — Gap List & Plan

**Status:** Approved for kickoff 2026-04-28. Decisions in section 6 are locked.
**Date:** 2026-04-28
**Scope:** Web application + data surface + live-call deployment. Two demo paths:
- **Path 1 (primary):** synthetic user demo — caregiver logs in, navigates dashboard, sees realistic call/health/cognitive history, and triggers a live call to the synthetic elderly user that exercises the persona graphs end-to-end.
- **Path 2 (secondary):** new-user demo — onboard a fresh elderly profile through the web app and complete a live call with that newly-created user.

**Hard constraints:** do not touch call logic, prompts, or persona implementations. Flag any file that would conflict with the health-redesign (Agent A) or cognitive-redesign (Agent B) branches rather than modifying it.

---

## Branch Coordination Map

Before any work starts, here's what's safe and what conflicts:

| Path / file | Owned by | Demo-readiness can touch? |
|---|---|---|
| `prisma/schema.prisma` | Agent A (HealthCallOpening + enums), Agent B (cognitive enums + drift records likely) | **Coordinate.** Demo work needs `IadlAssessment`, `CognitiveSelfReport`, `IndirectSignal`, `TrustedContact.isPrimary` already-added in Phase 0 — those fields exist. New schema additions for demo (e.g. drift detection record) should land in A or B, not here. |
| `apps/llm-server/src/personas/health/**` | Agent A | **No-touch.** |
| `apps/llm-server/src/personas/cognitive/**` | Agent B | **No-touch.** |
| `apps/llm-server/src/personas/general/**` | — | **Safe.** Both A and B leave general persona alone per ADR-005. |
| `apps/llm-server/src/personas/general/post-call/GeneralPostCallGraph.ts` | — | **Safe.** Needs the CallLog fix (gap GS-1 below). |
| `apps/server/src/prompts/HealthPrompt.ts` | Agent A | **No-touch.** |
| `apps/server/src/prompts/CognitivePrompt.ts` (or equivalent) | Agent B | **No-touch.** |
| `apps/server/src/prompts/GeneralPrompt.ts` | — | **No-touch per scope.** Don't change call prompts in this pass. |
| `apps/web/**` | — | **Safe.** Neither A nor B touches the web app. |
| `apps/api/**` | — | **Safe.** tRPC backend; not in A/B scope. |
| `prisma/seed.ts` + `test/synthetic-data/seed.ts` | — | **Safe.** |
| `apps/*/Dockerfile`, `docker-compose.yml`, deploy config | — | **Safe.** |

**Implication for Phase 1 worktree merge order:** the demo readiness branch can land independently. The post-call CallLog fix (GS-1) is the only persistence-layer change and lives in the general post-call file, which neither A nor B touches.

---

## 1. Post-Call Persistence — Gap List

| ID | Gap | Severity | Demo impact | Owner |
|---|---|---|---|---|
| **GS-1** | General persona post-call **does not create a `CallLog` row.** Summaries write, embeddings write, but no CallLog. Dashboard `/sessions` view filters by CallLog — general calls are invisible. | 🔴 Critical | Dashboard call-history view will show 0 general calls even when they happened. Synthetic data masks this in current seed because seed writes CallLog directly. | Demo branch |
| **GS-2** | Cognitive drift detection runs but **never persists.** `CognitivePostCallGraph.checkDrift()` computes drift, logs it, has TODO; no DB row. | 🟡 High | Dashboard alerts/flagging section can't surface drift. Phase 3 (drift loop) is blocked. | **Agent B** (do not fix here) |
| **GS-3** | Health baseline update wraps in try/catch + `console.error()` and returns `{}`. Silent on failure. | 🟡 Medium | Stale baselines without alert; not directly demo-blocking but caregiver dashboard could show wrong "compared to baseline" deltas. | **Agent A** (post-pipeline) |
| **GS-4** | `CognitiveTestResult.callLogId` is nullable and never linked. Cognitive sessions orphaned from CallLog metadata. | 🟡 Medium | Click-through from `/sessions/[sessionId]` to cognitive detail works (audited as ✅) but uses indirect lookup. Hidden brittleness, not demo-blocking. | **Agent B** |
| **GS-5** | KG (Neo4j) population errors in general post-call get swallowed (lines 497, 564). | 🟢 Low | KG features degrade silently; demo will likely show populated KG since seeds populate it directly. | Defer |

**Demo branch action: GS-1 only.** Fix general post-call to create a CallLog row before summary persistence. ~30 LOC change in one file. Other items defer to A/B/v1.next.

---

## 2. Synthetic Seed — Gap List

Two seeds exist today; neither alone is sufficient:

| Seed | Path | Strengths | Gaps |
|---|---|---|---|
| Simple | `prisma/seed.ts` | Postgres-complete: 1 caregiver, 1 elderly, 6 calls, conditions, meds, health check log, 1 cognitive result, IQCODE submission. Idempotent (deletes first). | **Random embeddings** (placeholder vectors). **No Qdrant.** **No Neo4j.** Only 1 cognitive result (no trend). 1 health check log. **No Auth `Account` row** → can't log in. **No Phase 0 fields** (IadlAssessment, CognitiveSelfReport, IndirectSignal, TrustedContact.isPrimary). |
| Comprehensive | `test/synthetic-data/seed.ts` | 3 elderly users, 14 narratively-coherent conversations each. **Real OpenAI embeddings.** Full Qdrant + Neo4j population (User → Conversation → Summary → Highlight → Topic → Person, 7 edge types). | **No health checks.** **No cognitive results.** **No trusted contacts.** **No Auth Account row.** Doesn't populate Phase 0 fields. |

### Gap list (sorted by demo blocker → nice-to-have)

| ID | Gap | Severity |
|---|---|---|
| **SD-1** | **Neither seed creates a NextAuth `Account` row.** Caregiver cannot log in via the web app. Hard demo blocker for Path 1. | 🔴 Critical |
| **SD-2** | **No single seed produces a complete demo user** — comprehensive has KG + embeddings but no health/cognitive; simple has health/cognitive but no embeddings + dummy vectors. | 🔴 Critical |
| **SD-3** | **No cognitive trend.** Stability index chart needs ≥3 sessions per PRD before rendering. Simple seed has 1. | 🔴 Critical |
| **SD-4** | **Phase 0 fields not populated:** `IadlAssessment` (caregiver-reported IADL at onboarding), `CognitiveSelfReport`, `IndirectSignal` (the 5 v1 signals), `TrustedContact.isPrimary` (load-bearing for C2 IQCODE blending). | 🟡 High |
| **SD-5** | **Health check trend thin.** 1 health check log; no trend visible on health dashboard surface. | 🟡 High |
| **SD-6** | Comprehensive seed doesn't write `CallLog` rows (it predates the dashboard's CallLog dependency). General calls would be invisible per GS-1. | 🟡 High |
| **SD-7** | Comprehensive seed wipes Qdrant by hardcoded conversation-ID list — adding new seed users requires updating that list. | 🟢 Low |

**Demo branch action:** consolidate to one seed script that produces a single demo-ready Margaret with everything.

---

## 3. Web Dashboard — Gap List

Audit covered all surfaces against `docs/prds/web/front-end.md` (510-line spec).

### Surface inventory

| Surface | Route | Status | Notes |
|---|---|---|---|
| Login | `/login` | 🔴 **Google OAuth only** | Hard demo blocker. No credentials provider, no magic link, no dev bypass. |
| Caregiver home / overview | `/dashboard` | ✅ | Stability chart, call stats, multi-user switcher work. |
| Session history | `/sessions` | ✅ | Wired to `trpc.session.getCallLogs`. |
| Session detail | `/sessions/[sessionId]` | ✅ | Domain scores, wellbeing, meds, conditions, summary all render. Handles missing data gracefully. |
| Cognitive trends (composite) | Dashboard | 🟡 | Bar chart works after 3 sessions. **Missing:** domain-level breakdown lines, drift indicators, IQCODE concern index alongside stability. |
| Health surface | Dashboard + session detail | 🟡 | Baseline + last-check + 30-day wellbeing trend render. **Missing:** per-condition trends, symptom heatmap, medication adherence timeline, health flags. |
| Observations / IQCODE | `/observations` | 🟡 | Latest submission + history render. **"Update observations" button has no mutation.** |
| User profile | `/profile` | ✅ | Full profile + caregiver mgmt visible. "Invite second caregiver" button likely not wired. |
| Alerting / flagging | Dashboard | 🔴 | "Active flags" section is permanent empty state. No flag computation engine. |
| Topics / KG insights | Session detail | 🟡 | Tags shown if present. No dedicated topics page, no person-mention surface, no KG visualization. |
| Onboarding flow | `/onboarding/[step]` | ✅ | All 7 steps wired, persisted, submit creates profile. Demo-presentable. |
| Elderly activation | `/activate` | ⚫ | Route exists in PRD; no implementation. Not demo-critical. |

### Critical gaps for demo path 1 (synthetic user demo)

| ID | Gap | Severity |
|---|---|---|
| **WD-1** | Login is Google-OAuth-only. Synthetic Margaret can't sign in. | 🔴 Critical (blocker) |
| **WD-2** | Alerts/flagging section is empty by design (no engine). PRD specifies drift alerts, missed-call flags, abnormal-health flags. | 🟡 High |
| **WD-3** | No domain-level trend lines on dashboard home (only composite stability bar). PRD specifies per-domain. | 🟡 High |
| **WD-4** | IQCODE Informant Concern Index not displayed alongside stability index. PRD specifies side-by-side + agreement/divergence indicator. | 🟡 High |
| **WD-5** | Phase 0 surfaces (IadlAssessment, CognitiveSelfReport, IndirectSignal trends) not displayed anywhere. | 🟢 Medium |

### Critical gaps for demo path 2 (onboarding walkthrough)

| ID | Gap | Severity |
|---|---|---|
| **WO-1** | "Update observations" button on `/observations` has no mutation wired. | 🟡 Medium |
| **WO-2** | "Invite second caregiver" dialog likely not wired. | 🟡 Medium |
| **WO-3** | No inline validation states / field-level help on onboarding forms. Cosmetic. | 🟢 Low |
| **WO-4** | Activation flow incomplete (SMS/email magic link, "awaiting confirmation" badge). | 🟢 Low (optional polish) |

### Doc gap

`docs/prds/web/back-end.md` is empty (2-line TODO). Not a demo blocker, but worth noting — the API surface is undocumented.

---

## 4. Deployment / Accessibility — Gap List

| ID | Gap | Severity |
|---|---|---|
| **DP-1** | **`apps/web` has no Dockerfile.** Cannot deploy. | 🔴 Critical |
| **DP-2** | **`NEXT_PUBLIC_API_URL` hardcoded to `http://localhost:3002`** in web build. Won't reach API in deployed env. | 🔴 Critical |
| **DP-3** | `server` and `llm-server` Dockerfiles run `tsx watch` (dev mode) instead of compiled `dist`. Slow startup, larger image, worse production posture. **Required for live-call demo (Q5 confirmed).** | 🔴 Critical |
| **DP-4** | Twilio webhook URL discovery is via ngrok with auto-discovery (`USE_DYNAMIC_NGROK=true`). Not stable for a public demo. Need static `BASE_URL` / `TWILIO_URL` / `STREAM_URL`. **Required for live-call demo.** | 🔴 Critical |
| **DP-5** | ElevenLabs custom-LLM URL not registered with the deployed `llm-server`. Live calls would fall through to ElevenLabs default model with no persona graphs. **Required for live-call demo.** | 🔴 Critical |
| **DP-6** | `.env` is checked in with real credentials. Rotate before public deploy. | 🟡 Medium |
| **DP-7** | No observability — health endpoints exist, but no structured logging, no metrics, no alerts. | 🟢 Low (nice-to-have) |
| **DP-8** | Google OAuth credentials are dev-tier; consent screen not approved for prod. After ~100 logins Google revokes. | 🟢 Low (skip if not using OAuth for demo) |
| **DP-9** | `scheduler-server` is a scaffold — no `index.ts`. Not in `docker-compose.yml`. Not needed for demo. | ⚫ Skip |

### Platform — locked to Railway

All five services deploy to Railway: `web`, `api`, `mcp-server`, `server`, `llm-server`. Single dashboard, env-var sync, managed Postgres + Redis plugins. Public URLs on `*.up.railway.app`.

External services already on managed providers stay where they are: **Postgres (Supabase)**, **Qdrant Cloud**, **Neo4j Aura**, **OpenAI**, **ElevenLabs**, **Twilio**. Redis moves from local docker to a Railway plugin (or Upstash if Railway's offering doesn't fit).

---

## 5. Action Plan

Sequenced as four phases. Each phase fully validates locally before the next starts. Deployment is the **last** step — everything works locally first, then we cut over to Railway. Effort estimates are calendar hours assuming focused work.

### Phase A — Post-call persistence + demo auth (~3h)

Foundation work that has to land before seed data makes sense.

| # | Action | Effort | Files | Risk |
|---|---|---|---|---|
| A1 | **GS-1: General post-call writes CallLog.** Add `createCallLog` invocation in `GeneralPostCallGraph` before summary persistence. Backfill `callLogId` linkage on existing summary repo writes. | 1h | `apps/llm-server/src/personas/general/post-call/GeneralPostCallGraph.ts` | Low — additive write, repo method already exists |
| A2 | **WD-1 + SD-1: Credentials provider for demo auth.** Add NextAuth credentials provider that validates against a seeded `Account` row with hashed password. Gated by `DEMO_AUTH_ENABLED` env flag — when off, only Google OAuth works (prod posture). When on, login UI shows email + password fields alongside the Google button. | 2h | `apps/web/src/lib/auth.ts`, `apps/web/src/app/(public)/login/login-form.tsx`, env validation | Medium — touches auth; flag-gated to contain blast radius |

GS-2 / GS-3 / GS-4 (drift persistence, health baseline silent failure, cognitive→CallLog linkage) are owned by Agents A and B and are out of scope here.

### Phase B — Consolidated synthetic seed (~7h)

One seed script that writes every model in the Prisma schema for one fully-populated Margaret. Replaces both existing seeds for demo use.

| # | Action | Effort | Files |
|---|---|---|---|
| B1 | **SD-2 + SD-3 + SD-4 + SD-5 + SD-6: Single demo seed.** New `prisma/seed-demo.ts`: caregiver `User` + `Account` (auth-ready, hashed password) + `ElderlyProfile` Margaret + 14 conversations from comprehensive seed (Postgres + Qdrant real embeddings + Neo4j KG) + `CallLog` rows for each conversation + 4 health checks with full `WellbeingLog` / `MedicationLog` / `HealthConditionLog` + computed `HealthBaseline` + 5 cognitive results across the 28-day window with realistic stability trend + IQCODE submission + `TrustedContact` (isPrimary=true) + `IadlAssessment` (caregiver-reported at onboarding) + `CognitiveSelfReport` + back-filled `IndirectSignal` rows for the 5 v1 signals + 2 seeded `Notification` rows (recall-domain decline + missed call) for the alerts section. Idempotent (deletes first, in FK order). | 6h | New seed file; reuses existing repo methods |
| B2 | **Verify seed-script harness.** `npm run seed:demo` script in `package.json`; `tsx prisma/seed-demo.ts` invocation; required-env validation up front; clear error if any of the 9 env vars is missing. | 1h | `package.json`, env validator |

### Phase C — Dashboard surfacing (~8h)

Surface what's now in the DB but not yet rendered. Done locally before deployment so we're debugging UI, not infra.

| # | Action | Effort | Files |
|---|---|---|---|
| C1 | **WD-3: Per-domain cognitive trend lines** on dashboard home. New tRPC query `cognitive.getDomainTrends` returning per-domain history. Recharts multi-line chart underneath the composite stability bar. | 3h | `apps/api/src/routers/cognitive.router.ts`, `apps/web/src/app/(caregiver)/dashboard/page.tsx` |
| C2 | **WD-4: IQCODE Informant Concern Index display** alongside stability. Side-by-side card layout per PRD. Agreement/divergence indicator if both signals exist. | 2h | `apps/web/src/app/(caregiver)/dashboard/page.tsx`, `apps/api/src/routers/observations.router.ts` |
| C3 | **WD-2: Alerts section consumes seeded Notifications.** No new flag engine — render the 2 seeded `Notification` rows (recall-domain decline, missed call) using the existing notification component slotted into the "Active flags" section. | 1.5h | `apps/web/src/app/(caregiver)/dashboard/page.tsx` (replace empty state with notifications query) |
| C4 | **WO-1: Wire "Update observations" mutation.** Form + tRPC mutation; submission writes a new `TrustedContactSubmission` row, updates concern index. | 1.5h | `apps/web/src/app/(caregiver)/observations/page.tsx`, `apps/api/src/routers/observations.router.ts` |

### Phase D — Deployment + live-call wiring (~9.5h)

Live calls are required for both demo paths (re-confirmed 2026-04-28). All five services deploy to Railway: `web`, `api`, `mcp-server`, `server`, `llm-server`. Twilio + ElevenLabs URLs registered against the Railway hostname.

| # | Action | Effort | Files |
|---|---|---|---|
| D1 | **DP-1 + DP-2: Web Dockerfile + env-driven API URL.** Multi-stage build (deps → builder → runner). Replace hardcoded `http://localhost:3002` with build-time `NEXT_PUBLIC_API_URL`. | 1.5h | `apps/web/Dockerfile` (new), `apps/web/next.config.ts`, env validation |
| D2 | **DP-3: Compile `server` + `llm-server` for prod.** Switch Dockerfiles from `tsx watch` to `node dist`. Verify `tsc --build` runs cleanly. Adjust healthcheck timing if cold-start changes. | 2h | `apps/server/Dockerfile`, `apps/llm-server/Dockerfile` |
| D3 | **DP-4: Static Twilio webhook URL.** Remove ngrok dependency in deployed mode (`USE_DYNAMIC_NGROK=false`). Set `BASE_URL`, `TWILIO_URL`, `STREAM_URL` to Railway hostname. Pre-register URL in Twilio console once. | 1h | Railway env, Twilio console |
| D4 | **DP-5: Register `llm-server` as ElevenLabs custom-LLM endpoint.** Set `https://<llm-server>.up.railway.app/v1/chat/completions` in agent config. Verify with one test call. | 0.5h | ElevenLabs agent console |
| D5 | **DP-6: Rotate credentials.** `.env` is checked in with real keys. Generate fresh OpenAI / ElevenLabs / Twilio / Google OAuth / NextAuth secret. Update Railway env. | 1h | Railway env, provider consoles |
| D6 | **Verify new-user → first-call path.** Confirm onboarding completion can trigger a call (manually or via API endpoint, since `scheduler-server` is a scaffold). If not wired, add a "Call now" button on profile page that invokes the existing call-initiation API. | 2h | `apps/web/src/app/(caregiver)/profile/`, `apps/api/src/routers/call.router.ts` (verify endpoint exists) |
| D7 | **Railway deploy + smoke test.** Provision managed Postgres + Redis; deploy all 5 services; wire env vars; run both demo paths end-to-end (log in as Margaret's caregiver, trigger a live call, hang up, verify post-call data lands; then onboard a new profile, trigger first call). | 3.5h | Railway dashboard; per-service config |

### Out of scope / deferred

- **Custom domain.** Public URL is `*.up.railway.app` per Q4. No DNS / TLS setup.
- **DP-7 (observability):** post-demo work. Health endpoints exist; failures during the short demo window will be noticed manually.
- **GS-2 / GS-3 / GS-4:** owned by Agents A and B.
- **WD-5 (Phase 0 surfaces UI):** seed populates the rows; no new UI surface for IADL / CognitiveSelfReport / IndirectSignal in this pass. Those land when redesigned health/cognitive personas need them visible.
- **WO-2 (invite second caregiver):** dialog component exists, mutation likely missing; not demo-critical.
- **WO-4 (elderly activation):** SMS/email magic link not built; demo skips this — calls are triggered manually post-onboarding.
- **`scheduler-server`:** still a scaffold. Demo triggers calls via API/UI, not cron.
- **Agent A `HealthCallOpening` migration:** Agent A's branch isn't merged. Demo branch operates against current main schema. If A merges later, seed gets a one-row extension then.

### Total effort

Phase A (3h) + Phase B (7h) + Phase C (8h) + Phase D (9.5h) = **~27.5h focused work**. Plus contingency for first-deploy gremlins, plan ~32h end-to-end.

---

## 6. Resolved Decisions (2026-04-28)

| # | Question | Resolution |
|---|---|---|
| 1 | Demo auth posture | **Option A: credentials provider gated by `DEMO_AUTH_ENABLED`.** Real NextAuth flow (same Session, middleware, callbacks as prod) with a password field appended when the flag is on. Off in prod. Slightly more code than a `/dev-login` bypass but tests the actual login experience and reusable as a fixture-account mechanism for staging. |
| 2 | Static flags content | **Recall-domain decline + missed call.** Seeded as `Notification` rows; the existing notification component renders them in the dashboard's alerts section. No real flag engine in this pass. |
| 3 | Deploy platform | **Railway.** Existing account or new account — both viable. Single dashboard, managed Postgres/Redis, simplest env-var sync across services. |
| 4 | Custom domain | **Skip — `*.up.railway.app` is fine.** No DNS or TLS work. |
| 5 | Live-call demo path | **In scope for both demo paths.** Co-founder needs to experience an actual call. Path 1 = call to synthetic Margaret. Path 2 = onboard a new profile, trigger first call. Adds DP-3 / DP-4 / DP-5 / D6 to Tier 1 (now Phase D); ~+7h. |
| 6 | Schema coordination with Agent A | **No coordination needed.** Agent A's `HealthCallOpening` work isn't being merged to main yet. Demo branch operates against current main schema. Seed populates `HealthCallOpening` rows only after Agent A merges (one-line addition then). |

---

## 7. Sequencing

Four phases, executed in order. Each phase fully validates locally before the next begins. No phase parallelism — one debugging surface at a time.

```
Phase A: Post-call + auth     (~3h)   ┐
Phase B: Consolidated seed    (~7h)   │  All local
Phase C: Dashboard surfacing  (~8h)   │  No deploy yet
                                       ┘
Phase D: Deploy + live calls  (~9.5h) ── Cut over to Railway
```

**Day 1:** Phase A (A1 + A2). End of day: general calls write CallLog rows; demo credentials provider works locally.

**Day 2:** Phase B (B1 + B2). End of day: `npm run seed:demo` produces a fully-populated Margaret across Postgres + Qdrant + Neo4j; can log in as her caregiver and see populated dashboard.

**Day 3:** Phase C (C1 → C4). End of day: domain trend lines, IQCODE concern display, alerts section, and observations mutation all working locally against seeded data.

**Day 4:** Phase D (D1 → D7). End of day: both demo paths working against `*.up.railway.app` with live calls completing end-to-end.

**Merge to main:** demo branch can merge any time once Phase D smoke-tests pass. No conflict with Agent A or B — only `prisma/schema.prisma` is shared, and demo branch makes no schema changes. Agent A's `HealthCallOpening` migration folds into the seed when it merges later.

**Stop conditions:** if Phase A or Phase B reveals deeper persistence bugs than the audit caught, surface immediately rather than pushing through. The demo only works if the data is honest.

---

## References

- `apps/llm-server/src/personas/general/post-call/GeneralPostCallGraph.ts` — GS-1 fix site
- `prisma/seed.ts`, `test/synthetic-data/seed.ts` — seed consolidation source
- `apps/web/src/lib/auth.ts`, `apps/web/src/app/(public)/login/login-form.tsx` — auth changes
- `apps/web/src/app/(caregiver)/dashboard/page.tsx` — Tier 2 UI work
- `docs/prds/web/front-end.md` — surfaces spec (510 lines)
- `docs/prds/personas/health.md`, `docs/prds/personas/cognitive.md` — data shapes
- `docs/research/health-redesign-audit.md` — Agent A scope (avoid conflict)

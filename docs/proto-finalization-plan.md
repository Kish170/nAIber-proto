# nAIber Prototype Finalization Plan

**Date:** 2026-04-25
**Budget:** 5 days
**Goal:** Get the existing TS prototype to a state where it can (a) be demoed to investors/partners and (b) accept early-access signups for user feedback — before we throw the codebase away and rebuild.

---

## Decision frame

The codebase is being scrapped after this push. Every hour spent here should pay off in **investor signal** or **user feedback**, not in long-term code health. That means:

- Don't refactor. Don't add tests beyond what's needed for our own confidence to demo.
- Don't add infrastructure that won't outlive the rewrite (RAG pipelines, full multi-tenancy, abuse controls).
- Do invest in things that survive: **demo videos, screenshots, signup list, learnings doc for the rebuild**.

The 5 days are about **finishing the story**, not the system.

---

## What we found in the audit (summary)

### Personas

| Persona | State | Notes |
|---|---|---|
| General | Working | User decision: leave alone. Prompt tweaks are post-rebuild. |
| Health | **Demo-ready** | Full call → validation → post-call → baseline pipeline works. Symptom NER gap is acceptable; free-text still records. |
| Cognitive | Single-call works, no baseline | All 9 tasks defined and scored. **First session shows undefined stability index** because baseline needs 3+ sessions. Phase 2/3 (informant index, drift notifications, indirect analysis) all stubbed. |

### Web

- Stack is solid: Next.js 16 App Router, NextAuth 5, tRPC 11, Prisma, multi-role (caregiver/elderly/public).
- Existing pages: caregiver dashboard, sessions list, session detail (already shows cognitive domain scores), elderly home, 8-step onboarding.
- **Massive insight gap:** we capture rich data (`CognitiveTestResult.domainScores`, `WellbeingLog`, `HealthBaseline`, `ConversationSummary.keyHighlights`) and barely visualize it. "Active flags" panel is hardcoded empty. No charting library wired up — current charts are CSS bars.
- "Request a call now" flow does **not exist** — needs a tRPC mutation + button + queue dispatch.
- Auth + user/role model is complete.

### Latency & deploy

- Observed call latency: **3–15 seconds** before audio plays after a user turn. No filler/ack mechanism exists.
- Largest blocker: `LLMRoute` awaits the full `supervisorGraph.invoke()` — no token streaming back to ElevenLabs.
- Infra deps: Redis (sessions/queues), Neo4j (KG), Qdrant (vectors), Postgres. No CI/CD.
- Bull Board exposed at `/admin/queues` — needs auth before public deploy.
- `apps/scheduler-server` is **cleanly droppable** — referenced in Dockerfile but not in any running service.

---

## What we are NOT doing (and why)

### Hard cuts — definitely not in this 5-day push

| Cut | Why |
|---|---|
| Refactoring messy code | Codebase is being thrown away. |
| Tests, CI/CD | Manual verification + dress rehearsals only. |
| Multi-tenancy / full abuse controls / rate-limits | Early access = manually-vetted ≤ 20 pilot users + waitlist for the rest. |
| Scheduler-server | User decision; replaced by "request a call" button. Remove from compose + Dockerfile. |
| Self-serve public signup → automated calls | Replace with **waitlist form** for everyone except a curated pilot cohort. |
| Phase 2/3 cognitive features (caregiver-side IQCODE *workflow*, drift notifications, indirect analysis on general calls) | Hide UI rather than half-finish. Note: Margaret's seed *does* include an IQCODE submission, so a static read-only display of it is a stretch goal, not a hard cut. |
| Token-streaming filler (cleaner solution than fixed phrase) | Time-box Day 1 to the cheap fixed-phrase filler. Upgrade only if Day 1 finishes early. |
| Conversation analytics page (sentiment, topic evolution) | Topic tags + summary text are already shown. Sexy but expensive. |
| Real General-persona prompt rework | Just two surgical fixes (hardcoded closing phrase + console-log suppression — see Day 1). Full rework is post-rebuild. |

### Stretch goals — pick up only if a day finishes early

These are real differentiators you flagged as worth showing if the schedule allows. Treat them as **bonus demo capabilities**, not commitments. Pick from this list when an earlier day wraps with hours to spare; do not start one mid-day if it would push other work out.

| Stretch | Effort | What it unlocks |
|---|---|---|
| Symptom NER for Health (post-call: free-text → `physicalSymptoms` slot) | ~3–4 hrs | Dashboard symptom panel actually populates from natural speech. Use OpenAI structured output on the post-call transcript — no in-call latency added. |
| Cognitive research features still in the PRD (e.g. fluency normalization, demographic normalization tables) | ~4–8 hrs each | Closes specific PRD gaps. Pick the ones that show up most visibly in the cognitive UI. |
| Lightweight RAG addition to Health (retrieve relevant prior wellbeing context for the LLM at call start) | ~6–8 hrs | Personalized follow-ups: *"Last week your knee was sore — how is it now?"* See "RAG and the latency question" section below for why this can be done without adding turn-time latency. |
| Static IQCODE display in caregiver dashboard | ~2 hrs | Margaret's seed already has a submission + concern index 2.94. Just render it. |
| Streaming-token filler (replaces fixed-phrase filler) | ~2 hrs | Real partial-text playback while the LLM generates. Better UX than canned phrase. |
| Indirect cognitive feature extraction on general calls (Phase 2 stub) | ~6 hrs | Cognitive signals from open conversation, not just formal tests. Differentiator, but big surface area — only attempt with a full free day. |

**Stretch-goal rule:** if you reach for a stretch and it overruns, stop and document it in `REBUILD_NOTES.md`. Don't push it onto the next day.

---

## RAG and the latency question (stack decision)

You've decided to stay on TypeScript for the prototype. The latency you're feeling isn't really a Node single-thread problem — it's an **architecture** problem, and most of it is fixable in TS. Naming the bottlenecks explicitly because the rebuild decision should be informed by what *actually* hurts, not the framing the stack invites.

**Where the 3–15 seconds actually goes (per the audit):**

```
user turn received
   ├── (~20–50ms)   SupervisorGraph routing
   ├── (2–10s)      LLM call to OpenAI                     ← largest block
   └── (1–5s, only if tool_calls returned)
        └── retrieveMemories tool → MCP server → Qdrant + Neo4j RAG
```

The RAG retrieval is **sequential after the LLM decides to call the tool**. So a turn that needs memory lookup is `LLM_decide_to_call_tool (2–10s) + RAG (1–5s) + LLM_use_tool_result (2–10s)` = up to 25 seconds in the worst case, just for one user turn.

**Parallelization opportunities that fit on TS, no rewrite needed:**

1. **Prefetch likely context at call start, not mid-turn.** Health and Cognitive *already do this* via `previousCallContext` — the persona graphs inject prior state into the system prompt before the LLM ever runs. Migrating General to the same pattern (prefetch top-K relevant memories from the last call's topics during call setup, inject into the system prompt) eliminates the mid-turn RAG hop entirely for ~80% of cases. This is the single biggest win available without a stack change.
2. **Speculative parallel retrieve.** While the LLM is generating, fire the most-likely RAG queries in parallel. If the LLM ends up calling the tool, the result is already cached. If not, you wasted a Qdrant call (~$0.0001). `Promise.all` on Node handles this fine — single-threaded ≠ unable to wait on multiple network calls.
3. **Stream LLM tokens back to ElevenLabs instead of awaiting completion.** Today `LLMRoute` awaits the full `supervisorGraph.invoke()` before returning. Streaming partial tokens cuts time-to-first-audio dramatically. This is the streaming-token filler in the stretch list — it's the cleanest fix, but takes ~2 hrs.

**What this means for the rebuild decision:**

If you reach Day 5 and latency *still* feels bad after the filler hack + (if attempted) prefetched context, then yes — profile before assuming a language switch fixes it. The two things that genuinely benefit from a different stack here are: (a) parallel CPU work like local embeddings (Python or Go), and (b) low-latency streaming pipelines (Go/Rust). The compute-heavy parts of nAIber are *external* (OpenAI, ElevenLabs, Qdrant) — Node is fine for orchestrating that. **Switching the MCP server alone** (your fallback option) is reasonable if local embedding generation becomes a bottleneck post-rebuild, but the data so far doesn't justify it for the prototype.

Capture the actual measured latency on Day 1 (before/after filler hack) in `REBUILD_NOTES.md`. That's the only data that should drive the stack decision.

---

## Day-by-day plan

Each day = ~6–8 hours of focused work. Buffer is intentionally light because the codebase is "messy and untested" — expect surprise bugs. **If a day overruns, cut from that day rather than push downstream.**

### Day 1 — Demo safety, seed top-up, latency filler, General fixes

**Goal:** Margaret's profile reads as a real long-running user; live calls don't show "undefined" anywhere; perceived latency drops; General persona doesn't sound canned.

**Margaret seed top-up** (existing seed at `prisma/seed.ts` already has ElderlyProfile, 6 CallLogs, conversation summaries, caregiver link, IQCODE submission):

- [ ] Add 2 more `CognitiveTestResult` rows for Margaret with slightly varying domain scores so stability index has 3 sessions to compute meaningful trends.
- [ ] Add 3+ `WellbeingLog` rows (currently zero) — needed for Day 2 wellbeing trend chart to have anything to render.
- [ ] Compute and seed a `HealthBaseline` row for Margaret so the dashboard's health trend section isn't empty.
- [ ] Conditional-render any UI panels that depend on Phase 2/3 features (drift notifications, caregiver IQCODE workflow) — hide if empty rather than showing TODO state.

**General persona surgical fixes** (newly identified — both ~30 min, both demo-visible):

- [ ] Replace the hardcoded *"It's been wonderful talking with you today, [name]. Take care…"* example in `apps/server/src/prompts/GeneralPrompt.ts` (~line 179) with either (a) a list of 3–5 closing variants, or (b) instruction to generate a closing organically tied to the conversation. Investors will recognize the canned phrase if it's verbatim.
- [ ] Suppress or downgrade `console.log` spam in `apps/llm-server/src/personas/general/ConversationGraph.ts` and `GeneralPostCallGraph.ts` (~150+ logs). Wrap in `if (process.env.LOG_LEVEL === 'debug')` or remove. Demo terminal needs to be clean for screen-share.

**Latency filler hack:**

- [ ] In `apps/llm-server/src/routes/LLMRoute.ts` (or upstream in `apps/server` WSS handler), emit an immediate filler text frame to ElevenLabs the moment a user turn is received, *before* awaiting `supervisorGraph.invoke()`. Use a small variant pool (*"one moment", "let me think about that", "hmm…"*) chosen randomly so it doesn't feel mechanical. ~30 min for the fixed-phrase version.

**Smoke test:**

- [ ] One end-to-end call per persona (general, health, cognitive). Verify data flows to web session detail.

**Cut if behind:** the General console-log cleanup (suppress only the obviously-noisy ones). Streaming filler stays a Day-1-bonus only — fixed-phrase is acceptable.

### Day 2 — Insights dashboard: charts

**Goal:** Replace CSS bars with real visualizations so screenshots look credible.

- [ ] Add Recharts to `apps/web` (`npm i recharts`).
- [ ] Build 3 reusable trend components in `apps/web/src/components/charts/`:
  - `CognitiveStabilityTrend` — line chart, last 10 calls, stability index over time.
  - `WellbeingTrend` — area chart, 30 days, wellbeing + sleep dual-axis.
  - `MedicationAdherence` — horizontal bar chart, last 7 days, per-medication adherence rate.
- [ ] Wire charts into `/dashboard` (caregiver view). Use seeded data from Day 1.
- [ ] Add a `CognitiveDomainRadar` (radar chart, 6 domains) to **session detail** for cognitive sessions — replaces the 2-column grid.

**Cut if behind:** the radar chart. Three trend charts is the bar.

### Day 3 — Flags + polish

**Goal:** Make the dashboard *say something* about the elderly person, not just display numbers.

- [ ] Build a `FlagEngine` (server-side, in `apps/api` or `packages/shared-services`). Inputs: latest baseline + last N call results. Outputs: array of `{ severity: 'red' | 'yellow' | 'green', message, since }`. Rules:
  - Red: distress detected on most recent call; missed ≥3/3 medications today; stability index drop ≥0.3 in last 3 calls.
  - Yellow: wellbeing dropped ≥2 points vs baseline; missed 2/7 days of a daily med; new symptom not in baseline.
  - Green: streak of complete medication adherence; stable wellbeing.
- [ ] Surface flags on `/dashboard` "Active flags" section with severity badges.
- [ ] Polish session detail page: hide sections with no data, format JSON dumps as readable lists, ensure the page looks good for screenshots.
- [ ] Take a first round of screenshots for the investor deck.

### Day 4 — "Request a call" + early-access surface

**Goal:** Build the demo trigger and the public signup funnel.

- [ ] Add `session.requestCallNow` tRPC mutation in `apps/api/src/routers/session.router.ts`. Accepts `callType` and `targetElderlyId`; publishes a job to a new BullMQ queue `call:request:immediate`; returns request ID.
- [ ] Add a worker (in `apps/server` since it owns Twilio) that consumes the queue and initiates a Twilio outbound call.
- [ ] Add CTA button on caregiver dashboard: "Call [name] now" with a callType picker. Disable while a call is active.
- [ ] Add public landing page at `/` (or refresh existing public route): hero pitch, short demo video embed (record on Day 5), "Request early access" form (email + optional phone). Store in a `WaitlistSignup` table.
- [ ] Auth-gate Bull Board (basic-auth middleware, env-driven). Don't ship `/admin/queues` open to the internet.

**Cut if behind:** make the early-access form a Tally/Typeform embed instead of building the table + tRPC route. You're collecting emails, not running an application.

### Day 5 — Deploy + dress rehearsal

**Goal:** Land it on the internet and prove it works on a real phone.

- [ ] Provision managed Redis (Upstash, free tier).
- [ ] Provision managed Neo4j (Aura free, or Railway add-on).
- [ ] Deploy `apps/server`, `apps/llm-server`, `apps/web`, `apps/api` to Railway. Set production env vars (Twilio, ElevenLabs, OpenAI, DB URLs).
- [ ] Run `prisma migrate deploy` against production DB.
- [ ] Update Twilio webhook to point at the deployed `apps/server` URL.
- [ ] Drop `apps/scheduler-server` from the deploy + remove from `docker-compose.yml` and `apps/llm-server/Dockerfile`.
- [ ] **Dress rehearsals:** 3–4 real phone calls covering both personas. Fix anything that breaks.
- [ ] Record a backup demo video (in case live demo flakes during a pitch).
- [ ] Capture final screenshots for the investor deck.

**If anything is on fire:** the deploy can roll back to local + ngrok for the investor demo. Public early-access is the part that needs to be online.

---

## Risks we are explicitly accepting

These are not bugs — they are deliberate trade-offs. Know them so you can answer if asked.

- **Concurrency.** Single-threaded Node + heavy LLM calls means simultaneous calls will queue/stack. Cap pilot users at ~5 active concurrent.
- **No real test coverage.** Demo bugs may surprise us. Mitigation: dress rehearsals on Day 5.
- **Filler-message UX is robotic.** Fixed phrase, not adaptive. Acceptable for prototype; rebuild fixes properly.
- **Bull Board basic-auth is brittle.** Acceptable because it's behind a guessable URL with weak attacker payoff. Don't put any secrets in queue payloads.
- **"Request a call" path has minimal abuse prevention.** Trusting the manual vetting of pilot users to backstop this.
- **Cognitive scoring depends on plausibility of seeded baseline.** Don't seed wildly unrealistic numbers — investors might ask how the model performs over time.
- **No PII/data deletion path.** Capture in waitlist that data may be reset before launch.

---

## Things to consider that you didn't ask about

Flagging these because they're easy to miss and could embarrass us:

1. **TCPA / call consent (US).** Automated outbound voice calls without prior express consent are a regulatory landmine. For pilot use, get explicit opt-in at signup ("I consent to receive automated calls from nAIber at the number I provided"). Add to the early-access form on Day 4.
2. **Call recording disclosure.** If you record/transcribe calls (you do — ElevenLabs + transcripts in DB), the elderly user must be told at the start of each call. Verify this is in the system prompt for all 3 personas. (Quick check in `apps/server/src/prompts/`.)
3. **OpenAI cost guardrails.** Set a hard monthly limit on the OpenAI account before going public. One runaway loop or a malicious caller can burn your card. Twilio has similar exposure — set a usage cap.
4. **Observability.** Add Sentry to `apps/web` and `apps/server` (~20 min, free tier). When something breaks during the investor demo, you want logs.
5. **Rebuild handoff doc (`docs/REBUILD_NOTES.md`).** Highest ROI for the rebuild. Each time you fight a bug or hack a workaround during these 5 days, write a one-line note. By Day 5 you have a list of "things the rebuild should solve from day one" — concurrency model, post-call latency, structured prompt management, etc.
6. **Stack-decision capture.** TS is staying for the prototype (your call). The "RAG and the latency question" section above lays out where parallelization is possible without a rewrite. Treat the Day 1 latency hack as a measurement, not just a UX patch — record before/after numbers in `REBUILD_NOTES.md` so the rebuild stack decision is data-driven, not assumed.

---

## Resolved decisions (locked in)

- **Demo user:** Margaret Thompson (already in `prisma/seed.ts`). Day 1 just tops up her cognitive history + adds wellbeing logs + a health baseline.
- **Solo dev.** Plan stays sequential.
- **Investor deck:** none yet, someone else will build it later. Day 3/5 screenshot work focuses on "good raw assets" rather than slide-specific shots.
- **Region:** US-East across Twilio (number), Railway (deploy), ElevenLabs (voice). Pick one and stick to it on Day 5.
- **Stack:** TypeScript stays. RAG-latency parallelization opportunities are listed above; revisit only if Day 1 measurements show TS is the actual blocker.

## Still open (small)

- **Investor demo modality:** live phone call during a pitch, or pre-recorded video walkthrough? If live, the dress-rehearsal count on Day 5 needs to go up (5+ rehearsals minimum).
- **Pilot cohort source:** where do the ≤20 manually-vetted pilot users come from? Friends/family, your existing network, a partner org? Affects how aggressive the early-access landing copy can be.

These don't block Day 1.

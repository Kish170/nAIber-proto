# Cognitive Assessment Persona — Product Requirements

> **Implementation status:** Placeholder. `CognitiveGraph.ts`, `CognitiveHandler.ts`, `CognitiveState.ts`, and `CognitivePrompt.ts` exist in the codebase but contain no logic. This PRD defines the full design so implementation can begin from a clear spec.

---

## Purpose

The cognitive assessment system tracks communication and cognitive patterns over time to surface meaningful changes for users and their caregivers. It is not a diagnostic tool — it does not label, diagnose, or prescribe. Its purpose is to make subtle trends visible and interpretable.

**This is the nAIber Cognitive Wellness Check** — a proprietary longitudinal monitoring tool. It is explicitly **not** a licensed clinical instrument. It does not produce a clinical score, and it must never be presented as equivalent to MoCA, MMSE, or any other validated clinical battery.

The system operates on two tiers:

| Tier | How | When |
|---|---|---|
| **Direct assessment** | Structured cognitive test via a dedicated call type | On demand or scheduled |
| **Indirect assessment** | Passive linguistic + acoustic analysis | Post-call on every general conversation call |

Direct assessment establishes a quantitative baseline per user. Indirect assessment continuously compares daily communication patterns against that baseline to detect drift. Together they provide a longitudinal picture of cognitive stability.

---

## Licensing and Legal Positioning

### What nAIber is NOT
- **Not MoCA.** The Montreal Cognitive Assessment is a proprietary, copyrighted instrument. Administering it requires a trained, licensed health professional and a paid license from mocastest.org. nAIber does not use, reproduce, or claim equivalence to MoCA.
- **Not MMSE.** The Mini-Mental State Examination is similarly proprietary (Psychological Assessment Resources).
- **Not a diagnostic tool.** nAIber does not diagnose mild cognitive impairment, dementia, or any clinical condition. It does not produce a pass/fail score or clinical classification.

### What nAIber IS
- **A trend-detection and early-signal tool.** The clinical value is: "Over the last 3 months, your recall latency has increased and your fluency scores have shifted — here's the trend, share it with your doctor."
- **Built on public-domain cognitive tasks.** Digit span, word recall, category fluency, proverb interpretation, and serial arithmetic are decades-old neuropsychological techniques that appear in dozens of validated instruments. No single instrument owns these task types. nAIber assembles them into a proprietary battery designed for conversational voice delivery and longitudinal monitoring.
- **A supplement to professional evaluation, not a replacement.** The dashboard and all user-facing language must communicate this clearly.

### Legal review items (pre-launch)
Before Phase 1 ships, the following must be reviewed by legal counsel:
- Disclaimer language on the dashboard and in onboarding consent
- Ensure no copy implies clinical equivalence or diagnostic validity
- Review the term "Cognitive Wellness Check" for any trademark or regulatory concerns
- Validate that consent and disclosure language meets applicable regulations for passive indirect monitoring

---

## Domain Boundary with Health Check

**Clean split:** health check covers physical health (symptoms, medications, physical functioning). Cognitive covers mental function (memory, attention, language, reasoning). No shared questions.

However, for knowledge base and Knowledge Graph purposes, health and cognitive data are used together. Health conditions and medications may correlate with cognitive signal changes — cross-referencing both data sources enriches interpretation even though the collection pipelines are separate.

---

## What a Successful Assessment Looks Like

### Direct test
- The user completes the full test (all domain tasks) within the session.
- Domain scores are computed and stored.
- Baseline is created (first test) or updated (subsequent tests).

### Indirect assessment (per general call)
- Linguistic and acoustic features are extracted from the call transcript.
- Deviation scores against baseline are computed and stored.
- No output to the user — this is silent monitoring.

### Overall
- Trends are visible in the dashboard over time.
- Caregivers and users can observe changes without the system drawing clinical conclusions.

---

## User Experience Model

### Functional requirements

- **Direct test:** Presented as a warm, brief "mind exercise" (~2–4 minutes). The user is told what it is — not hidden. Delivered conversationally, not clinically.
- **Indirect monitoring:** Completely transparent to the user. Happens post-call as part of the general call pipeline. The user is aware (via onboarding/consent) that regular calls are analysed passively.
- The AI never references cognitive performance during a call — it does not say "your score was..." or "that seemed harder for you today." Analysis is post-call only.
- Tone is warm, patient, and encouraging throughout the direct test — the user should not feel like they are failing a test.

### Non-functional requirements

- **Non-diagnostic language everywhere** — no "impairment", "decline", or clinical framing in the UI or AI responses.
- **Longitudinal consistency** — direct tests must use the same task set across sessions to ensure comparability. Task variation invalidates trend data.
- **Baseline validity** — a baseline built on insufficient data is misleading. Minimum data requirements for baseline creation must be defined before shipping Phase 1.

---

## Architecture Overview

```mermaid
flowchart TD
    subgraph DirectTier["Direct Assessment (dedicated call type)"]
        D1[CognitiveGraph - structured test] --> D2[Score domain tasks]
        D2 --> D3[Store results + update baseline]
    end

    subgraph IndirectTier["Indirect Assessment (post-call on general calls)"]
        I1[GeneralPostCallGraph] --> I2[analyze_cognitive_features node]
        I2 --> I3[Extract linguistic + acoustic signals]
        I3 --> I4[Compare to baseline vectors]
        I4 --> I5[Store deviation scores → cognitive_signals table]
    end

    subgraph Baseline["Baseline Store"]
        B1[(Postgres - baseline vectors)]
        B2[(Postgres - cognitive_signals)]
    end

    D3 --> B1
    I5 --> B2
```

---

## Tier 1: Baseline Establishment

The baseline is the reference point for all future indirect analysis. It must be established before indirect monitoring produces meaningful results.

### What the baseline captures

| Data | Source | Purpose |
|---|---|---|
| Contextual data | Onboarding form | Normalise speech/language norms (age range, education level, primary language) |
| Audio/text samples | Onboarding | Capture the user's typical communication style |
| Direct cognitive test results | First direct call | Quantitative anchor across cognitive domains |
| Trusted contact observations | Onboarding form | Qualitative context on normal communication and alertness |

### Baseline metrics extracted

From the initial direct test and audio samples:
- **Speech rate** — words per minute
- **Response latency** — time between question and response onset
- **Pause distribution** — average and variance of pause duration
- **Pitch variance** — monotone vs. dynamic delivery
- **Lexical diversity** — unique words as proportion of total words
- **Semantic coherence** — embedding similarity across sentences
- **Filler word frequency** — rate of "um", "uh", restarts

Metrics are normalized per user (z-scores). Both raw and normalized values are stored. These become the baseline vectors used for deviation scoring in indirect analysis.

### Baseline storage
Stored in Postgres linked to `userId`. Full vector history is kept (not overwritten) to support visualization of baseline evolution over time.

### Trusted contact
A person chosen by the user during onboarding. They submit a brief qualitative description of the user's normal communication and alertness patterns via a frontend form. This input grounds quantitative signals in human context. *(Onboarding flow for trusted contact not yet designed — flagged as open below.)*

---

## Tier 2: Direct Cognitive Test

### Call type
A dedicated call type — scheduled or on-demand, separate from general and health check calls. Triggered similarly to health check (`POST /call/cognitive`).

### Graph structure
Implemented as a `CognitiveGraph` in `llm-server/src/personas/cognitive/`. Follows the same interrupt/resume pattern as `HealthCheckGraph` — each task is a question-answer cycle with durable checkpoint state.

**Node structure (per task):**
```
prompt_task → wait_for_response (interrupt) → evaluate_response → measure_metrics → next_task_or_finalize
```

State persists: current task index, responses collected, timing metrics, domain scores.

### Voice feasibility: MoCA domain mapping

The table below maps standard MoCA domains to what nAIber can and cannot cover via voice-only phone calls. This informed the task set design.

| MoCA Domain | MoCA Task | Voice Feasible? | nAIber Approach |
|---|---|---|---|
| Visuospatial / Executive | Trail making, cube copy, clock drawing | No | Web companion module (Phase 2+) |
| Naming | Identify animals from pictures | No | Dropped — requires images |
| Memory (registration) | 5 words read aloud, immediate repeat | Yes | Register 5 words, recall later in call |
| Attention | Digit span, serial 7s, tap on 'A' | Yes (with adaptation) | Digit span, serial 7s, verbal vigilance (say "yes" on 'A') |
| Language | Sentence repetition, letter fluency | Yes | Letter fluency (F words, 60 seconds) |
| Abstraction | Similarities (train/bicycle, etc.) | Yes | 2 similarity pairs per session |
| Delayed Recall | 5 registered words | Yes | Unprompted recall, then category cues if needed |
| Orientation | Date, day, place, city | Yes | Warm-up orientation questions |

**Domains NOT covered by voice and why:**
- **Visuospatial / Executive** — clock drawing, trail-making, and cube copy require visual output. These assess executive function, spatial reasoning, and constructional ability. Voice cannot capture these. Documented gap for Phase 1; addressed by web companion module in Phase 2+.
- **Picture Naming** — requires showing images. Not applicable to phone calls.

**Key adaptation: Letter vigilance task.** The MoCA "tap on A" task (patient taps when hearing 'A' in a letter string) was adapted from physical tap to verbal response. The user says "yes" when they hear the letter 'A'. This captures the same sustained attention signal via transcript analysis without requiring DTMF phone key presses, which introduce confounds for elderly users (unfamiliarity with pressing keys while listening, VoIP DTMF suppression issues).

### Cognitive domains and task types (Phase 1)

The nAIber Cognitive Wellness Check covers **6 cognitive domains** via **8 structured tasks**, delivered conversationally over voice in approximately **4–6 minutes**.

| # | Domain | Task Type | Description | Approx Duration |
|---|---|---|---|---|
| 1 | Orientation | Date/time questions | Day, month, year, season | ~30s (warm-up) |
| 2 | Memory (registration) | 5-word registration | 5 words read aloud, user repeats immediately to confirm encoding | ~45s |
| 3 | Attention | Digit span (forward + reverse) | Sequences of 3, 4, 5 digits — forward then reverse | ~60s |
| 4 | Attention | Serial 7s | Subtract from 100 by 7, five times | ~45s |
| 5 | Attention | Letter vigilance (verbal) | AI reads a string of letters; user says "yes" each time they hear 'A' | ~30s |
| 6 | Language fluency | Letter fluency | As many words starting with 'F' as possible in 60 seconds, no proper nouns or numbers | ~75s |
| 7 | Abstraction | Similarity pairs | 2 pairs (e.g. train/bicycle, watch/ruler) — "How are these alike?" | ~45s |
| 8 | Memory (delayed recall) | 5-word delayed recall | The 5 words from task #2, unprompted first, then with category cues if needed | ~45s |

**Task ordering rationale:** Registration (task 2) must come early to allow a delay before recall (task 8). Orientation is first because it's low-anxiety and eases the user in. The attention and fluency tasks fill the gap between registration and recall.

**What's excluded from Phase 1 and why:**
- Visuospatial tasks — requires screen interaction, future web module
- Picture naming — requires images, not applicable to voice
- Sentence repetition — lower signal-to-noise for longitudinal trending; can add in a later phase if needed

### Metrics per task
- **Content accuracy** — correctness of answer against expected response (via cosine similarity for open-ended tasks, exact match for digit span and serial 7s)
- **Response latency** — timestamp from question delivery to response onset
- **Speech rate** — words per minute during response
- **Lexical richness** — unique words in the response (primarily for fluency and recall tasks)

### Scoring
Each domain produces a normalized score. Scores are stored with timestamps, allowing trend analysis across sessions. *(Exact scoring thresholds and domain weighting not yet defined — flagged as open below.)*

**Important framing:** Scores are for **longitudinal trend detection only**. They are never presented as a clinical total score, pass/fail threshold, or diagnostic indicator. Dashboard language uses "your trend" and "compared to your baseline", not "your score is X/30".

### Test duration
Target: 4–6 minutes. Tasks should be short, warm, and conversational — not clinical.

---

## Tier 3: Indirect Assessment (Passive)

### When it runs
Post-call, on every general conversation call. Added as a node (`analyze_cognitive_features`) in `GeneralPostCallGraph`, after summarization and RAG embedding.

### Signals extracted

| Signal | Extraction method |
|---|---|
| Speech rate | Word count / call duration from transcript |
| Pause distribution | Timestamped transcript turn gaps |
| Pitch variance | Audio analysis (e.g. pyAudioAnalysis, praat-parselmouth, torchaudio) |
| Lexical diversity | Unique-to-total word ratio from transcript |
| Semantic coherence | Embedding similarity across consecutive sentences |
| Filler word frequency | Pattern match on transcript ("um", "uh", repeated restarts) |
| Response latency | Timestamped turn data |

### Baseline comparison
Each extracted feature is compared to the user's baseline vector. Output is a normalized deviation score per signal. All scores and raw values are stored in the `cognitive_signals` table in Postgres.

### Audio processing dependency
Acoustic features (pitch, pause distribution) require access to raw audio or processed audio metadata from the call. This depends on Twilio/ElevenLabs providing audio or timestamp data post-call. *(Integration not yet designed — flagged as open below.)*

### Feature extraction architecture
The notes recommend a small dedicated feature extraction microservice (FastAPI) that both direct test scoring and indirect analysis call consistently. This keeps `llm-server` lighter and ensures extraction logic is shared. *(Not yet built — flagged as Phase 2.)*

---

## Data Schema

### `cognitive_baselines` (Postgres)
| Field | Type | Notes |
|---|---|---|
| `userId` | string | FK to user |
| `featureVector` | JSON | Normalized baseline values per signal |
| `rawValues` | JSON | Un-normalized metric values |
| `version` | int | Increments on each update |
| `createdAt` | timestamp | |

### `cognitive_test_results` (Postgres)
| Field | Type | Notes |
|---|---|---|
| `userId` | string | |
| `conversationId` | string | |
| `source` | enum | `'voice'` or `'web'` — which modality collected this result |
| `modality` | string | e.g. `'phone_call'`, `'web_clock_drawing'`, `'web_trail_making'` |
| `domainScores` | JSON | Normalized score per domain |
| `rawResponses` | JSON | Per-task response, latency, accuracy |
| `completedAt` | timestamp | |

### `cognitive_signals` (Postgres)
| Field | Type | Notes |
|---|---|---|
| `userId` | string | |
| `conversationId` | string | Linked to a general call |
| `signals` | JSON | Raw values per feature |
| `deviationScores` | JSON | Normalized deviation from baseline per feature |
| `stabilityIndex` | float | Composite average deviation |
| `recordedAt` | timestamp | |

---

## Post-Call Flow

### General call (indirect analysis)
```
GeneralPostCallGraph runs:
  1. Create summary → Postgres
  2. Extract topics → Postgres
  3. Generate embeddings → Qdrant
  4. analyze_cognitive_features (Phase 2):
     a. Extract linguistic signals from transcript
     b. Extract acoustic signals (if audio available)
     c. Compare to baseline vectors
     d. Write deviation scores → cognitive_signals table
```

### Cognitive direct test call
```
CognitiveGraph finalize node:
  → Aggregate domain scores
  → Write to cognitive_test_results table
  → Update cognitive_baselines (weighted moving average)

PostCallWorker (callType = 'cognitive'):
  → Read checkpoint state → extract domain scores and responses
  → Invoke CognitivePostCallGraph → persist results
  → Delete checkpoint thread
```

---

## Baseline Updates Over Time

After each new direct test:
1. Pull existing baseline feature vectors from Postgres.
2. Compute weighted moving average between old baseline and latest test results.
3. Store new version alongside previous (no overwrite — full history retained).
4. If deviation persists beyond a configurable drift window: flag baseline for revalidation, optionally notify trusted contact.

Weighted moving average ensures stable patterns have more influence than short-term fluctuations (e.g. a bad day does not reset the baseline).

---

## Data Consumers

| Consumer | Access | Phase |
|---|---|---|
| Users | Dashboard — trend graphs, stability index, plain-language summaries | Phase 3 |
| Caregivers | Dashboard — same data, trusted contact observations included | Phase 3 |
| Trusted contact | Contextual input at onboarding; notified on baseline revalidation events | Phase 1 |
| Knowledge Graph | Health + cognitive data combined for richer semantic memory | Future |

### Dashboard display guidelines
- Trend graphs per core signal (speech rate, coherence, pause duration)
- Composite stability index (average normalized deviation across all signals)
- Color-coded status: green (stable), amber (moderate deviation), red (significant deviation)
- Plain-language summaries generated by LLM: *"Your communication this week showed consistent coherence and slightly slower pacing than your average."*
- **Non-diagnostic language rules (mandatory):**
  - Never use: "impairment", "decline", "deficit", "abnormal", "diagnosis", "MCI", "dementia"
  - Use instead: "change", "shift", "trend", "compared to your baseline", "worth discussing with your doctor"
  - Never display a total score out of a maximum (e.g. "24/30") — this implies a clinical instrument
  - Always show trends over time, not point-in-time scores
  - Include persistent footer: "This is not a clinical assessment. Share trends with your healthcare provider for professional evaluation."
- **Visuospatial gap disclosure:** Dashboard includes a note explaining that voice-based assessment covers 6 of 8 standard cognitive domains; visuospatial and constructional abilities require in-person or screen-based evaluation

---

## ElevenLabs Voice Expectations

- **Tone:** Warm and encouraging — the user is doing something that takes effort.
- **Pacing:** Unhurried. Extra pause time given between instructions and expected response.
- **Task framing:** Introduced as a "brief mind exercise" not a "cognitive test". Casual and friendly.
- **Acknowledgements:** After each task, brief affirmation before moving on — not evaluative ("Great, let's try the next one").
- **Prompt design:** `CognitivePrompt.ts` in `server/src/prompts/` — not yet implemented.

---

## Implementation Phases

### Phase 1 — MVP: Voice Assessment + Baseline (design target for this PRD)
- **Legal review:** Disclaimer language, dashboard copy, consent model reviewed by legal counsel before shipping
- Onboarding flow: collect contextual data, trusted contact input, initial audio/text samples
- Direct cognitive test as a dedicated call type via `CognitiveGraph` — 8 tasks, 6 domains, voice-only
- Domain scoring (accuracy + latency + speech metrics per task)
- Baseline storage in Postgres (`cognitive_baselines`, `cognitive_test_results`)
- Schema and PostCallWorker path for `callType = 'cognitive'`
- Dashboard surfaces limitation: "For a complete cognitive picture, voice assessments should be supplemented by in-person evaluation" (covers visuospatial gap)
- `cognitive_test_results` schema includes `source: 'voice' | 'web'` and `modality` fields to support future web module data

### Phase 2 — Indirect Metrics + Web Companion Module
**Indirect metrics (passive voice analysis):**
- Add `analyze_cognitive_features` node to `GeneralPostCallGraph`
- Linguistic feature extraction from transcript (speech rate, lexical diversity, coherence, fillers)
- Baseline comparison → deviation scores → `cognitive_signals` table
- Feature extraction microservice (FastAPI) for shared extraction logic
- Acoustic features dependent on audio access from Twilio/ElevenLabs

**Web companion module (visuospatial domains):**
- A logged-in web session (not a phone call) that covers the domains voice cannot assess
- Candidate tasks:
  - Simplified clock drawing (draw on canvas or arrange clock elements)
  - Trail-connecting task (tap numbers/letters in sequence on screen)
  - Simple shape-copying task
- Results feed into the same `cognitive_test_results` schema with `source: 'web'`
- Architecturally clean — another assessment input, not a separate system
- Does NOT block Phase 1. Phase 1 ships with voice-only and documents the visuospatial gap

### Phase 3 — Dashboard Visualization (future)
- REST endpoints: `/api/cognitive/metrics`, `/api/cognitive/trends`
- Interactive graphs (Recharts / Chart.js)
- Stability index visualization
- LLM-generated plain-language summaries
- Trusted contact data surfaced alongside metrics

### Phase 4 — Adaptive Learning (future)
- Baseline drift detection via z-score thresholding or lightweight anomaly model
- Exponential smoothing for baseline updates
- Rolling baseline history for evolution visualization
- Predictive stability scoring (correlate indirect signals with direct test results)

---

## Edge Cases

| Scenario | Expected behaviour |
|---|---|
| User has no baseline yet | Indirect analysis stores raw signals but skips deviation scoring. Baseline must exist before deviation scores are meaningful. |
| User shows significantly different performance on direct test | Weighted moving average absorbs single-session variance. Persistent deviation over configurable window triggers baseline revalidation. |
| User becomes distressed during direct test | Stop the test. Transition to empathetic close. Record partial results. Flag for human review. |
| User refuses tasks during direct test | Record as skipped. Move to next task. Finalize with partial scores. |
| Call drops mid-direct-test | Checkpoint state is preserved. Partial results are recoverable from checkpoint. Post-call worker handles partial result persistence. |
| Audio not available for acoustic features | Linguistic features still extracted from transcript. Acoustic signals skipped. Noted in stored signal record. |

---

## Open Decisions (Required Before Phase 1 Implementation)

These decisions are not yet made and must be resolved before building begins:

| Decision | Why it matters |
|---|---|
| **Legal review of disclaimer and consent language** | Must be reviewed by legal counsel before shipping. Covers dashboard copy, onboarding consent, and the "Cognitive Wellness Check" name itself. See Licensing section above. |
| **Minimum data requirements for a valid baseline** | A baseline built on one 4-minute sample may not be representative. What's the minimum before indirect analysis is enabled? |
| **Scoring model and domain weighting** | How are domain scores combined? Are all domains equally weighted? Is there a threshold below which a test is flagged? Scores must never be presented as clinical totals. |
| **Drift thresholds** | What deviation magnitude over what time window triggers a baseline revalidation? |
| **Trusted contact onboarding flow** | How does the trusted contact submit input? Frontend form, SMS, email? What's the UX? |
| **Audio access from Twilio/ElevenLabs** | Are raw audio or timestamped transcripts available post-call for acoustic feature extraction? This blocks Phase 2 acoustic signals. |
| **Feature extraction service vs. in-process** | FastAPI microservice (recommended in notes) vs. in-process in `llm-server`. Decision affects Phase 2 architecture. |
| **Consent and disclosure model** | Users must be informed that general calls are passively analysed. Where and how is this disclosed? |
| **Relationship between cognitive signals and Knowledge Graph** | Health + cognitive data are both inputs to the KG. The integration model hasn't been designed. See `docs/future/knowledge-graph.md`. |
| **5-word list selection and rotation** | Should the same 5 words be used every session (maximizes comparability) or rotated from a pool (prevents memorization)? Trade-off between longitudinal consistency and practice effects. |
| **Letter vigilance scoring** | How to handle timing ambiguity in verbal "yes" responses vs. physical taps? Need to define acceptable response windows and how to distinguish missed targets from delayed responses in transcript analysis. |

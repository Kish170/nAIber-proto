# Indirect Cognitive Signals — Taxonomy

**Reference:** `docs/research/clinical-assessment-analysis.md` for clinical foundations. Companion to `docs/research/health-redesign.md` and `docs/research/cognitive-improvements.md`.

These signals are extracted passively from all three personas' calls (general, health, cognitive). They run alongside — not inside — the formal MoCA-derived cognitive scoring. The intent is to surface behavioural patterns that change over time, not to diagnose.

Architectural decisions governing these pipelines are recorded in `docs/decisions/adr-005-signal-independence.md`.

## v1 Scope

The v1 demo implements **transcript-only, per-call signals** that require no LLM classification. Audio-dependent signals, trend/longitudinal signals, and LLM-classified signals are explicitly deferred.

| Signal | Status | Method | Notes |
|---|---|---|---|
| Lexical diversity | **v1** | TTR + MTLD word counting | Pure counting, no model calls |
| Syntactic complexity | **v1** | Local NLP parser (e.g. spacy) — MLU + clauses/sentence | No LLM, no API calls |
| Semantic coherence | **v1** | Cosine similarity over OpenAI utterance embeddings | Embeddings only — no generation/classification |
| Disfluency (filler rate) | **v1** | Regex over preserved transcript | Fillers confirmed preserved end-to-end |
| Response latency | **v1** | Timestamp delta from ElevenLabs turn payload | Timestamps available from ElevenLabs but not currently stored — capture during Agent C |
| Prosodic features | Deferred | Audio analysis | Raw audio not retained today |
| Speech effort / fluency | Deferred | Audio analysis | Raw audio not retained today |
| Pause structure & timing | Deferred | Audio analysis | Raw audio not retained today |
| Topic switches / task abandonment | Deferred | LLM classifier | No LLM classifiers in v1 |
| Semantic drift | Deferred | LLM classifier | Same as topic switches — not derivable from coherence (Rule 1) |
| Multi-domain score change (trend) | Deferred | Cross-session diff | Multi-session pipeline back-burnered with RCI |
| Personal-baseline z-scores | Deferred | Rolling baseline + z-score | Multi-session pipeline back-burnered with RCI |
| Temporal drift in coherence/fluency | Deferred | Time-series slopes | Multi-session pipeline back-burnered with RCI |

## Global Rules

These rules govern every signal pipeline and override any conflicting design instinct elsewhere in the codebase.

### 1. Signals do not explain each other

- Each signal is an independent measurement of observed behaviour.
- A signal must not define the meaning of another signal.
- Each signal is determined only by its own inputs.
- No signal pipeline may consume outputs from another signal pipeline.
- Signals are computed in parallel, not sequentially.
- Any relationship between signals is expressed only at **visualization or interpretation time** — never at extraction time.
- Do not identify or persist correlations between signals.

### 2. Confounders reduce confidence, not value

- If something external may have affected a signal's reliability, the signal's certainty is reduced — *not* its measured value.
- Raw values are always preserved.
- Confidence is multiplicatively or additively penalized.
- Confounders are logged explicitly per signal and surfaced downstream.

### 3. Trends override snapshots

- Single measurements are contextual information, not signals.
- Only changes over time are treated as meaningful.
- Direction, consistency, and magnitude of change are prioritized over isolated values.
- Dashboards default to trend graphs, not raw numbers.
- Alerts (where any exist) require multiple time points.
- Baselines are rolling, not fixed.

### 4. The system describes, users interpret

- This is a legal posture — we do not diagnose.
- Output language describes patterns ("response latency increased 20% over the last 14 days"), not conditions.
- Aligns with dashboard-only intent — no clinical recommendations rendered to users.

## Signal Categories

### 1. Speech & Language-Based Markers

#### Vocal biomarker features (per-session, raw audio required)

| Signal | Description | Update Frequency | Data Sufficiency | Known Confounders | Purpose | Possible Metrics |
|---|---|---|---|---|---|---|
| Prosodic features | Pitch variation, energy, voice fatigue | Per session | Min 30s audio per session | Background noise, emotional state, time of day | Changes in pitch variability and energy can reflect motor speech changes or affective changes | Pitch variance, energy variance, prosody stability index |
| Speech effort / fluency | How "smooth" speech sounds | Per session | Min 20 utterances per session | Accent, speech impediments, fatigue | Slowed or effortful speech often correlates with cognitive load or retrieval difficulty | Articulation rate (phones/sec), speech rate (words/min) |
| Pause structure & timing | Duration and distribution of pauses | Per session | Min 1 min continuous audio | Network latency, background noise, thinking time | Frequent or long pauses often occur with word-finding problems | Average pause duration, pause frequency |

#### Linguistic markers (per-interaction, transcript-based)

| Signal | Description | Update Frequency | Data Sufficiency | Known Confounders | Purpose | Possible Metrics |
|---|---|---|---|---|---|---|
| Lexical diversity | Variety of words used | Per interaction | Min 100 words per analysis window | Topic constraint, vocabulary size, education level | Reduced diversity can reflect vocabulary loss or retrieval issues | Type–Token Ratio (TTR), MTLD |
| Syntactic complexity | Sentence structure depth | Per interaction | Min 10 sentences per analysis window | Language proficiency, topic complexity | Simplification of sentence structure is documented in MCI/Alzheimer's | Mean length of utterance (MLU), clauses per sentence |
| Semantic coherence | How closely related sentences are to each other | Per interaction | Min 5 sentence pairs per analysis | Topic switches (intentional vs unintentional) | Lower coherence may reflect disrupted meaning or memory retrieval | Topic-modeling coherence score, cosine similarity between adjacent utterances |
| Disfluency / semantic drift | Irrelevant or wandering responses | Per interaction | Min 3 multi-turn exchanges | Conversational style, exploratory thinking | Filler words and off-topic drifts increase with cognitive load | Filler rate (um/uh per minute), semantic drift measure |

### 2. Language and Behavioural Interaction Patterns

| Signal | Description | Update Frequency | Data Sufficiency | Known Confounders | Purpose | Possible Metrics |
|---|---|---|---|---|---|---|
| Response latency | How long a user takes to reply | Per interaction | Min 10 interaction pairs | Network delay, multitasking, question complexity | Delay between turn boundaries can reflect processing speed | Average response latency |
| Task abandonment / topic switches | Jumping away from a question without finishing | Per interaction | Min 5 structured tasks attempted | User intent, task design, interruptions | Excessive switching can reflect executive control issues | Topic switch count per session |

### 3. Trending & Longitudinal Signals

Per-user baselines, not population norms — fits nAIber's longitudinal model.

| Signal | Description | Update Frequency | Data Sufficiency | Known Confounders | Purpose | Possible Metrics |
|---|---|---|---|---|---|---|
| Change in multi-domain scores | Memory, attention, executive function | Daily / weekly | Min 7 days baseline, 3+ assessments per domain | Learning effects, test familiarity, motivation | Longitudinal change often more meaningful than cross-sectional data | Delta vs previous sessions in each metric |
| Deviations from personal baseline | Performance shifts across various metrics | Rolling window | Min 14 days baseline establishment | Life events, medication changes, sleep quality | Detect anomalies relative to the user's own stable behaviour, regardless of direction | Z-scores relative to personal baseline |
| Temporal drift in linguistic coherence or fluency | Changes over time in language patterns | Weekly | Min 10 interactions per week for 3+ weeks | Topic diversity, conversation partner changes | Measure slow, longitudinal change in language quality, not conversational style or topic preference | Time-series slopes |

## Session-Summary Scores

Interpretable rollups computed per session for dashboard display.

- `speechRateWordsPerMin`
- `avgPauseDuration`
- `pitchVariance`
- `lexicalDiversity`
- `semanticCoherence`
- `fillersPerMin`
- `responseLatency`

## Trend Scores

Computed across sessions, not per-session.

- Rolling 7-day average
- Delta vs baseline
- Anomaly detection flags

## Critical Implementation Considerations

### Data sufficiency & confidence gating

Before surfacing any signal on a dashboard, the system must verify it has enough data to make the signal meaningful. Each signal's *Data Sufficiency* row above is the hard gate — if not met, the signal is computed but not surfaced (or is surfaced with an explicit "insufficient data" state).

Required checks:

- Minimum number of utterances
- Minimum total audio duration
- Minimum baseline window length

Without these, early users see noisy graphs and stakeholders misinterpret randomness as signal.

### Cross-signal contamination

Many signals share confounders even though their pipelines are independent. Examples:

- Fatigue → slower speech → lower coherence
- Stress → more topic switching → higher semantic drift
- Background noise → pause artifacts

Per Global Rule 1, a pipeline must not consume another pipeline's output to compensate. Per Global Rule 2, each pipeline must instead log its own confounders and reduce its own confidence. Provenance and confounder lists are persisted alongside every signal.

### Temporal resolution

Signals update at different cadences:

| Signal type | Frequency |
|---|---|
| Audio prosody | Per session |
| Linguistic features | Per interaction |
| Response latency | Per interaction |
| Trend metrics | Daily / weekly |
| Baseline updates | Rolling window |

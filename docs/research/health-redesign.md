# Health Persona — Redesign Requirements

**Reference:** `docs/research/clinical-assessment-analysis.md` for clinical foundations and the current health persona implementation.

## Problem with the current design

The health check-in is too rigid. It follows a rule-based question collection flow tied to known conditions and medications. While it supports follow-ups, clarifications, and intent detection, the conversation is still fundamentally structured around getting through a fixed question list. Users cannot naturally take control of the conversation.

## Change 1 — Clinical Data Expansion

Add the following clinical instruments to the health check-in, grounded in the research document:

- **PHQ-2 depression screen** — two questions, scored 0–3 each. Score ≥ 3 triggers full GDS-15 assessment. This is critical because depression mimics cognitive decline (pseudodementia) and without mood screening the cognitive persona cannot distinguish reversible depression from actual decline.
- **GDS-15** — administered only when PHQ-2 threshold is met, not every call.
- **IADL questions** — instrumental activities of daily living. These are the earliest behavioral markers of cognitive decline, appearing 2–3 years before formal MCI diagnosis. Key domains: medication management, finances, transportation, meal preparation. New difficulty in a previously independent domain is a major clinical red flag.
- **Self-reported cognitive changes** — direct questions asking if the user has noticed increased forgetfulness, trouble following conversations, or repeating themselves. Validated clinical signal.

These additions serve a dual purpose: improving health data quality and feeding signals into the cognitive persona to contextualize assessment scores (health → cognitive signal sharing via Redis).

## Change 2 — Conversation Flexibility via Medallion Data Collection

Rather than driving the conversation through structured question collection, shift to a more open conversational model where the LLM guides the user naturally and the data is extracted in post-processing.

The structure follows a medallion pattern:

- **Bronze** — raw conversational transcript, open-ended, user-led
- **Silver** — LLM-extracted structured data from the transcript post-call (conditions, answers, mood signals, IADL flags)
- **Gold** — validated, normalized, persisted health log ready for dashboard and signal sharing

This preserves all current data collection goals (condition-specific questions, medication adherence, wellbeing) but removes the rigid turn-by-turn enforcement. The user can take the conversation where they need to go. The post-call pipeline extracts what it needs from the transcript rather than enforcing collection in real time.

## Change 3 — RAG Integration for Health Check-ins

Use the RAG pipeline (Qdrant + Neo4j) during health calls to improve conversational quality and targeting. Specifically:

- Reference past health check-in data and conversation history to identify issues the user was experiencing previously and follow up on them naturally
- Use prior conversation context to personalize talking points the LLM uses during the call
- Surface relevant past signals (a medication side effect mentioned last week, a sleep complaint two calls ago) to make the conversation feel continuous rather than starting from scratch each time

This mirrors what the general persona does with `retrieveMemories` and should be extended to health calls with health-specific retrieval context.

## Change 4 — Health Check-in as Cognitive Proxy

The health check-in serves a dual role — it is not only a health data collection session but also a lightweight cognitive proxy that feeds into and contextualizes the formal cognitive assessment persona.

The cognitive persona uses the MoCA protocol to assess cognitive function through structured exercises. However those scores exist in isolation without supporting context. The health check-in bridges this gap in two ways:

### As a confounding signal source

The clinical research identifies several conditions that produce cognitive scores mimicking decline when the underlying cause is actually reversible — depression, medication changes, poor sleep, acute illness. The health check-in collects exactly this data. PHQ-2/GDS-15 results, IADL flags, medication adherence, and sleep quality from the health persona should be shared with the cognitive persona via Redis signals so that assessment scores can be interpreted in context rather than in isolation.

### As a longitudinal behavioral baseline

IADL difficulties, self-reported cognitive changes, and mood trends collected across health check-ins over time form a behavioral baseline that supports the cognitive persona's drift detection. A declining MoCA score means something very different when IADL independence is also deteriorating vs when it is stable. The health check-in provides that longitudinal behavioral layer the cognitive assessment alone cannot capture.

This means the health and cognitive personas must share data bidirectionally — health signals inform cognitive score interpretation, and cognitive drift alerts increase the depth of IADL and self-reported change questions in subsequent health check-ins.

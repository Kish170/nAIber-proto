# Health Persona — Redesign Requirements

**Reference:** `docs/research/clinical-assessment-analysis.md` for clinical foundations and the current health persona implementation.

## Problem with the current design

The health check-in is too rigid. It follows a rule-based question collection flow tied to known conditions and medications. While it supports follow-ups, clarifications, and intent detection, the conversation is still fundamentally structured around getting through a fixed question list. Users cannot naturally take control of the conversation.

## Change 1 — Clinical Data Expansion

Add the following clinical instruments, grounded in the research document. **v1 scope is narrower than originally proposed** — see deferred items below.

### v1 (in scope)

- **IADL (Lawton 8-domain)** — instrumental activities of daily living. The earliest behavioral markers of cognitive decline, appearing 2–3 years before formal MCI diagnosis. Domains: telephone use, shopping, food preparation, housekeeping, laundry, transportation, medication management, finances. New difficulty in a previously independent domain is a major clinical red flag. **Captured at onboarding via the trusted-contact (caregiver) flow** — informant-reported, not self-reported. Stored in `IadlAssessment` with `source = ONBOARDING`. Re-administration triggers (`DRIFT_TRIGGERED`, `SCHEDULED_REFRESH`, `CAREGIVER_INITIATED`) reserved on the enum but not yet wired up.
- **Self-reported cognitive changes** — three frequency questions (forgetfulness, conversation difficulty, self-repetition) rated `NEVER` (0) → `DAILY` (4), totalled 0–12. **Captured at onboarding**, not in-call. Stored in `CognitiveSelfReport` with `source = ONBOARDING`.

These onboarding-time assessments serve a dual purpose: they form the baseline behavioural layer the cognitive persona uses to contextualize MoCA scores, and they avoid biasing the live health-check call toward a structured screening posture.

### Deferred (see linked docs)

- **PHQ-2 / GDS-15 depression assessment** — deferred entirely from v1. Adding it inline biases the health check toward a mental-health screen we don't have the clinical scaffolding to support, and the trigger logic (longitudinal mood signal across N sessions, separate `DEPRESSION_ASSESSMENT` call type) belongs to a later phase. Design intent captured in `docs/research/depression-assessment-deferred.md`.
- **In-call IADL re-assessment** — for v1, IADL is collected once at onboarding from the caregiver. Drift-triggered or scheduled re-administration is reserved on the `IadlSource` enum but not implemented.
- **Health → Cognitive signal sharing via Redis** — the cross-persona Redis contract is Phase 0 work (separate task) and not yet built.

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

The clinical research identifies several conditions that produce cognitive scores mimicking decline when the underlying cause is actually reversible — depression, medication changes, poor sleep, acute illness. The health check-in collects exactly this data. **In v1**, the cross-persona signals available to the cognitive persona are: medication adherence and condition status from the health log, plus the onboarding `IadlAssessment` and `CognitiveSelfReport`. Depression / mood signals are deferred (see `depression-assessment-deferred.md`). Cross-persona delivery is via Redis (Phase 0 contract — see ADR-005 and the signal-independence taxonomy).

### As a longitudinal behavioral baseline

The onboarding IADL and self-reported cognitive change scores establish a behavioral baseline at intake. Subsequent health check-ins layer in adherence, symptom, and condition data over time. A declining MoCA score means something very different when IADL independence is also deteriorating vs when it is stable — the health surface provides the longitudinal behavioral layer the cognitive assessment alone cannot capture.

This means the health and cognitive personas must share data bidirectionally — health signals inform cognitive score interpretation, and cognitive drift alerts can (in a later phase) trigger an `IadlSource = DRIFT_TRIGGERED` re-assessment via the caregiver.

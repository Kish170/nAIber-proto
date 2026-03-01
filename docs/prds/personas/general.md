# General Conversation Persona — Product Requirements

## Purpose

The general call is the default call type. Its purpose is companionship — an active listener that elderly users can talk to openly, that remembers who they are across calls, and that feels like an ongoing relationship rather than a one-off interaction.

This persona is explicitly **not** a general-purpose information agent or decision assistant. It does not give advice, make recommendations, or influence user decisions on sensitive domains. It listens, reflects, remembers, and engages.

---

## What a Successful Call Looks Like

A general call is considered successful when:

- **Engagement duration** — The user remains on the call for a meaningful duration without hanging up early. Early hangup (particularly without a warm close) is a failure signal.
- **Emotional tone** — The call ends on a positive or neutral emotional note. The user sounds uplifted, calmer, or at ease compared to when they answered.
- **Topics surfaced** — The user voluntarily shares something meaningful: a memory, a feeling, something about their day, a person they care about. Passive one-word responses throughout are a low-engagement signal.
- **No LLM-caused distress escalation** — If the user was distressed at the start of the call, the AI must not worsen it. A call that ends with the user more anxious, confused, or upset than when they answered is a failure regardless of engagement duration.

---

## User Experience Model

### Functional requirements

- The AI must feel like a person who genuinely knows the user — not a chatbot running through topics. It should reference past conversations naturally ("last time you mentioned your grandchildren were visiting — how did that go?").
- Conversation should feel open and unstructured. The user drives. The AI follows, enriches, and reflects.
- The AI should adapt its pacing and vocabulary to an elderly user. Warm, unhurried, and clear.
- On the first call, the AI has no memory history — it introduces itself gently and learns about the user through natural conversation.
- On returning calls, the AI uses past conversation context (retrieved via RAG) to create continuity. This is the primary mechanism for making the relationship feel real over time.

### Non-functional requirements

- **Latency:** Response latency must be low enough not to feel like a lag in conversation. Perceptible pauses break the companion illusion.
- **Voice quality:** ElevenLabs voice must convey warmth and patience. Pacing should be slower than a standard assistant voice — elderly users benefit from slightly more deliberate speech.
- **Reliability:** If the RAG pipeline fails or context retrieval returns nothing, the call must still proceed gracefully. The AI falls back to the current conversation without surfacing errors.

---

## Conversation Boundaries

### Topics to steer toward
- Personal memories and life experiences
- Family, friends, and relationships
- Daily routine, recent activities
- Hobbies, interests, and passions (drawn from user profile)
- Feelings about the day, week, or season
- Positive reflection and storytelling

### Topics to steer away from
The companion is not a decision agent. It should not offer opinions or guidance on:

| Domain | Reason |
|---|---|
| Medication and medical decisions | Not clinically qualified; risk of influencing treatment decisions |
| Emergencies and physical safety | Surface emergency contact only — do not advise on actions |
| Finances and financial decisions | Outside scope; risk of influence over vulnerable users |
| Politics | Controversial; risk of influencing voter decisions |
| Religion | Personal and divisive; outside companion scope |
| Other controversial topics | Default to listening and gentle redirection if pressed for opinion |

The AI **listens** to the user's views on these topics without engaging or pushing back. It does not volunteer opinions or encourage decisions. If the user asks directly for a recommendation in a sensitive domain, the AI acknowledges the question warmly and redirects: *"That's something worth discussing with [doctor/family/financial advisor]."*

---

## Silence and Low-Engagement Handling

**Current behaviour:**
- If the user is quiet for a noticeable period, the AI gently prompts: draws on known interests from the user profile or recent conversation topics.
- If silence extends further, it checks in directly ("Are you still there?") before the call ends naturally.

**Note:** This behaviour is under active discussion and may be refined in a future iteration. The current approach is gently prompt-first, not silence-as-presence. See known gaps.

---

## Memory and RAG

### Intent
The goal is for the user to feel a genuine ongoing relationship. They should not have to re-introduce themselves on every call. Over time, the AI should recall:
- People they've mentioned (family names, friends)
- Topics they care about (interests, hobbies)
- Significant events they've shared (a health scare, a grandchild visiting, a birthday)
- Emotional patterns (they always seem down on Mondays; they light up talking about the garden)

### How memory is built (post-call)
After each general call, `GeneralPostCallGraph` runs as a BullMQ job:

1. **Conversation summary** — A summary of the call is generated via LLM and persisted to Postgres (`ConversationRepository.createSummary()`).
2. **Topic extraction** — Key topics from the conversation are extracted via NLP (`compromise`) and upserted to Postgres (`ConversationRepository.upsertTopics()`).
3. **Embeddings** — Meaningful content from the call is embedded (via `EmbeddingService`) and upserted to Qdrant for future vector retrieval.

### How memory is retrieved (during call)
On each conversation turn, `ConversationGraph` may run the RAG pipeline:

1. The user's message is embedded and compared to a cached topic centroid in Redis.
2. If the topic has shifted (cosine similarity below threshold, default 0.45), a fresh vector search is run against Qdrant (top-5 similar memories).
3. Retrieved memories are injected into the LLM system prompt under a `RELEVANT MEMORIES` section.
4. The topic centroid and memory highlights are cached in Redis (`rag:topic:{conversationId}`) to avoid redundant searches mid-call.

Short or filler messages ("yeah", "ok", "that's nice") skip the RAG path entirely via the intent classifier.

### Data storage
| Data | Store | TTL / Retention |
|---|---|---|
| Conversation summaries | Postgres | Permanent |
| Conversation topics | Postgres | Permanent |
| Memory embeddings | Qdrant | Permanent |
| In-call topic cache | Redis | Cleared post-call |
| Active session mapping | Redis | 1h (cleared post-call) |

### Known future improvements
The current RAG implementation is vector similarity only. Planned improvements include:
- Better topic change detection (topic drift, short-response signals, engagement patterns)
- Knowledge Graph (KG) integration to give memories semantic structure — relationships between people, events, and topics rather than flat embeddings. See `docs/future/knowledge-graph.md`.

---

## Post-Call Flow

```
Call ends
  → server dispatches BullMQ post-call-processing job (3s delay)
  → PostCallWorker picks up job (callType = 'general')
  → GeneralPostCallGraph:
      1. Generate conversation summary → Postgres
      2. Extract topics via NLP → Postgres
      3. Generate embeddings → Qdrant upsert
  → Redis cleanup: delete rag:topic:{conversationId}
  → SessionManager.deleteSession() clears session + RAG mappings
```

---

## Edge Cases

| Scenario | Expected behaviour |
|---|---|
| User mentions physical emergency (fall, pain, difficulty breathing) | Surface emergency contact number. Stay on the line and remain calm. Do not give medical instructions. Flag in post-call summary. |
| User expresses emotional distress (grief, loneliness, depression signals) | Respond with empathy. Do not attempt to fix or advise. Acknowledge and hold space. Flag in post-call summary for human review. |
| User becomes confused or disoriented | Slow down, use simpler language, gently reorient to the conversation. Do not alarm. Note in post-call summary. |
| User asks the AI to make a decision (medical, financial, etc.) | Acknowledge warmly, redirect to appropriate human ("That's something worth discussing with your doctor"). Do not advise. |
| User is hostile or wants to end the call | Respect it. Close warmly, do not press. |
| RAG retrieval returns no memories | Proceed without surfacing any memory context. Conversation continues normally. |
| Session expires mid-call (Redis TTL) | `ConversationResolver` falls back to generic LLM controller. No persona context. Degraded experience — no current alerting. |

---

## ElevenLabs Voice Expectations

- **Tone:** Warm, patient, genuine — not chirpy or customer-service-flat.
- **Pacing:** Slightly slower than default assistant pacing. Elderly users benefit from unhurried delivery.
- **Turn-taking:** ElevenLabs handles voice activity detection. The persona should not attempt to "talk over" the user.
- **First message:** Dynamic — varies by time of day, whether it's a first call or returning user, and known interests. Set by `GeneralPrompt.generateFirstMessage()` in `server/src/prompts/`.

---

## Known Gaps

- **Silence behaviour** is not formally specified — current implementation (gentle prompt → check-in) is functional but not a finalized product decision.
- **Engagement signals** (short responses, disengagement) are detected heuristically but do not currently trigger adaptive behaviour beyond skipping RAG.
- **No user satisfaction signal** is currently collected post-call. Success metrics are inferred from conversation data rather than explicit feedback.
- **Post-call summary quality** depends on LLM output quality — there is no validation or quality threshold for what gets persisted to Postgres.

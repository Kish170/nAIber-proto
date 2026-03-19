# System Prompts

## Purpose
Define persona-specific system prompts sent to ElevenLabs at call start. These control the AI's behavior, tone, and conversation structure for each call type.

## Key Behaviors
- Prompts built dynamically using user profile data (name, age, interests, conditions, last summary)
- First message generated via GPT call — different for first-time vs returning users
- Abstract base class (`PromptInterface.ts`) provides shared sections: emergency detection, tone, cultural sensitivity, user context
- Each persona extends the base with its own identity, boundaries, and conversation rules

## Personas
| Persona | File | Status |
|---------|------|--------|
| General | `GeneralPrompt.ts` | Fully implemented — companionship, active listening, memory usage, steering |
| Health | `HealthPrompt.ts` | Fully implemented — structured Q&A, validation, follow-up strategy |
| Cognitive | `CognitivePrompt.ts` | **Placeholder** — needs implementation |

## Why Prompts Live Here
System prompts are sent directly over WSS to ElevenLabs at call start, before llm-server is ever involved. They must live in the telephony layer. See [ADR-006](../../decisions/adr-006-prompt-location.md).

## Constraints
- Prompts live in `apps/server/src/prompts/` — do NOT move them
- Changes to prompts affect live call behavior immediately
- Should not contain sensitive identifiers (userId, phone) — see session-management cleanup notes

## Dependencies
- UserHandler (user profile data for prompt building)
- OpenAI client (dynamic first message generation)

## Current Status
General and Health prompts fully implemented. Cognitive prompt is a placeholder that needs implementation (tracked in `docs/tracking/implementation.md`).

## Related Docs
- [Media Streaming](./media-streaming.md) — where prompts are injected into ElevenLabs
- [ADR-006: Prompt Location](../../decisions/adr-006-prompt-location.md) — why prompts live in telephony server

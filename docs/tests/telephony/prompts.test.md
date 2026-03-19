# System Prompts — Test Spec

Reference PRD: [prompts.md](../../prds/telephony/prompts.md)

## Unit Tests

### PromptInterface (SystemPrompt base class)

#### buildUserContext()
- Includes user ID and phone in output
- Note: userId/phone in prompt is a known security concern — tracked for removal

#### cleanJson()
- Strips null/undefined values from object before stringifying
- Returns formatted JSON string

#### Shared sections
- `tone` — contains conversational tone guidelines
- `culturalSensitivity` — contains respect and boundary rules
- `emergencyDetection` — contains escalation criteria and response approach

### GeneralPrompt

#### generateSystemPrompt()
- Includes base sections (tone, cultural sensitivity, emergency detection)
- Includes role boundaries — companionship, NOT problem-solving or coaching
- Includes steering guardrails — no pivoting to health/cognitive topics
- Includes response shaping rules
- Includes user context built from profile
- Includes user's interests, conditions, last conversation summary when available
- Handles missing optional profile fields gracefully (no undefined in output)

#### generateFirstMessage()
- Makes OpenAI API call to generate dynamic greeting
- Produces different message for first-time vs returning users
- Includes user's name in the prompt to OpenAI
- Returns a string suitable for ElevenLabs first_message

### HealthPrompt

#### generateSystemPrompt()
- Includes base sections (tone, cultural sensitivity, emergency detection)
- Includes health-specific role boundaries — data collection, NOT diagnosis
- Includes steering guidelines — strict health focus, redirect off-topic
- Includes response shaping for health context
- Includes user's conditions and medications in prompt
- Handles users with no conditions/medications

#### generateFirstMessage()
- Makes OpenAI API call for dynamic health check greeting
- Produces contextual greeting referencing user's known conditions

### CognitivePrompt (placeholder)
- Currently empty — test spec to be expanded when implemented
- Should follow same pattern: base sections + cognitive-specific boundaries + task instructions

## High-Impact Error Scenarios

### OpenAI call fails during first message generation
- `openAIClient` throws when generating first message
- Verify error propagates (WebSocketService needs to handle this)

### User profile has minimal data
- Profile with only required fields (id, phone, name) — no conditions, no summaries, no interests
- Verify prompts still generate valid output without undefined/null text

## Test Approach
- Mock `OpenAIClient` for first message generation
- Create test `UserProfile` instances with varying completeness
- Assert prompt output contains expected sections and user-specific data
- Assert no raw `undefined` or `null` strings appear in generated prompts

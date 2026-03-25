# Redis Migration Tracking

Items currently stored in Redis that should migrate to a dedicated observability/logging service (Datadog, Grafana Loki, etc.) once available. These are not required for client-facing functionality.

## Migrate to Observability Service

| Key Pattern | Current Purpose | Why Migrate |
|---|---|---|
| `rag:audit:{conversationId}:*` | RAG retrieval audit trail (source attribution, scores, context chunks) | Debug/observability only — no runtime dependency |
| Future: call tracing/correlation logs | Cross-service log correlation (server → ElevenLabs → llm-server) | Logging concern, not state |
| Future: latency metrics per node | Graph node execution timing | Metrics concern |

## Keep in Redis (Operational State)

| Key Pattern | Purpose | Why Keep |
|---|---|---|
| `session:{conversationId}` | Active call session data | Hot state, read every request |
| `rag:user:{userId}` | Maps userId → conversationId | Real-time lookup for ConversationResolver |
| `call_type:{callSid}` | Pre-call routing | Short-lived operational state (60s TTL) |
| `health_check:{userId}:{conversationId}` | Durable execution thread state | Required for interrupt/resume |
| `cognitive:{userId}:{conversationId}` | Durable execution thread state | Required for interrupt/resume |
| `rag:topic:{conversationId}` | Active topic tracking | Per-call state |

## Keys Pending Removal

| Key Pattern | Reason |
|---|---|
| `rag:phone:{phone}` | Security concern — part of ConversationResolver fallback path being removed |

## Notes
- RAG audit keys use short TTL (1h) so they don't accumulate — acceptable for now
- Once an observability service is in place, audit data should be sent there instead of Redis
- Consider structured logging (pino/winston) as the transport layer to the observability service

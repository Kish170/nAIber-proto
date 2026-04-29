/**
 * Unit tests for GeneralPostCallGraph — verifies GS-1 fix:
 * post-call graph must create a CallLog row before persisting the summary.
 *
 * Run (`mock.module` requires `--experimental-test-module-mocks`):
 *
 *   npm run test:post-call-graph --workspace=@naiber/llm-server
 *
 * Or from repo root in one line (do not break the line before the file path — zsh
 * would run node without arguments and scan the whole repo for tests):
 *
 *   node --test --experimental-test-module-mocks --import tsx/esm apps/llm-server/src/personas/general/post-call/GeneralPostCallGraph.test.ts
 */
import { test, mock, beforeEach } from 'node:test';
import assert from 'node:assert/strict';

const CALL_LOG_ID = 'test-call-log-id';
const SUMMARY_ID = 'test-summary-id';
const CONVERSATION_ID = 'test-conv-id';
const USER_ID = 'test-user-id';

// ── Module-level mocks (must be called before dynamic import of GeneralPostCallGraph) ──

const mockCreateLog = mock.fn(async () => ({ id: CALL_LOG_ID }));
const mockCreateSummary = mock.fn(async () => ({ id: SUMMARY_ID }));
const mockGetConversationTopics = mock.fn(async () => []);
const mockCreateConversationTopic = mock.fn(async () => ({ id: 't1', topicName: 'test', topicEmbedding: [] }));
const mockUpdateConversationTopic = mock.fn(async () => ({ id: 't1', topicName: 'test', topicEmbedding: [] }));
const mockCreateConversationReferences = mock.fn(async () => ({}));

await mock.module('../ConversationHandler.js', {
    namedExports: {
        createLog: mockCreateLog,
        createSummary: mockCreateSummary,
        getConversationTopics: mockGetConversationTopics,
        createConversationTopic: mockCreateConversationTopic,
        updateConversationTopic: mockUpdateConversationTopic,
        createConversationReferences: mockCreateConversationReferences,
    }
});

// Mock NERService and KGPopulationService to avoid Neo4j/OpenAI connections
await mock.module('../../../services/graph/NERService.js', {
    namedExports: {
        NERService: class {
            extractPersons = mock.fn(async () => []);
        }
    }
});

await mock.module('../../../services/graph/KGPopulationService.js', {
    namedExports: {
        KGPopulationService: class {
            populateNodes = mock.fn(async () => {});
            populateRelationships = mock.fn(async () => {});
        }
    }
});

// ── Fixture data ──────────────────────────────────────────────────────────────

const FIXTURE_TRANSCRIPT = [
    { role: 'agent', message: 'Hello! How are you doing today?', time_in_call_secs: 2 },
    { role: 'user', message: 'I am doing well! I had a lovely lunch with my daughter Sarah yesterday.', time_in_call_secs: 10 },
    { role: 'agent', message: 'That sounds wonderful! What did you have?', time_in_call_secs: 14 },
    { role: 'user', message: 'We went to that Italian place downtown. It was delicious.', time_in_call_secs: 22 },
    { role: 'user', message: 'Not much else, just enjoying the nice weather. Goodbye!', time_in_call_secs: 35 },
];

const MOCK_SUMMARY_RESPONSE = JSON.stringify({
    summaryText: 'The user had a lovely lunch with their daughter Sarah at an Italian restaurant downtown. They were in good spirits and enjoying nice weather.',
    topicsDiscussed: ['family', 'food'],
    keyHighlights: [
        { text: 'had lunch with daughter Sarah at Italian restaurant; user sounded happy and warm', importanceScore: 7 }
    ]
});

// ── Mock client factories ─────────────────────────────────────────────────────

function makeMockElevenLabsClient(transcript = FIXTURE_TRANSCRIPT) {
    return {
        getStructuredTranscriptWithRetry: mock.fn(async () => transcript),
    };
}

function makeMockOpenAIClient() {
    return {
        generalGPTCall: mock.fn(async () => ({
            choices: [{ message: { content: MOCK_SUMMARY_RESPONSE } }]
        })),
    };
}

function makeMockEmbeddingService() {
    return {
        embedText: mock.fn(async () => new Array(1536).fill(0)),
        embedTexts: mock.fn(async (texts: string[]) => texts.map(() => new Array(1536).fill(0))),
    };
}

function makeMockVectorStore() {
    return {
        addDocuments: mock.fn(async () => ['point-id-1']),
        similaritySearchWithScore: mock.fn(async () => []),
    };
}

// ── Import graph after all mocks are set up ───────────────────────────────────

const { GeneralPostCallGraph } = await import('./GeneralPostCallGraph.js');

// ── Tests ─────────────────────────────────────────────────────────────────────

beforeEach(() => {
    mockCreateLog.mock.resetCalls();
    mockCreateSummary.mock.resetCalls();
    mockGetConversationTopics.mock.resetCalls();
});

test('GS-1: createLog is called before createSummary and callLogId is linked to the summary', async () => {
    const graph = new GeneralPostCallGraph(
        makeMockOpenAIClient() as any,
        makeMockEmbeddingService() as any,
        makeMockVectorStore() as any,
        makeMockElevenLabsClient() as any,
    ).compile();

    const result = await graph.invoke({
        conversationId: CONVERSATION_ID,
        userId: USER_ID,
        isFirstCall: false,
        callType: 'general',
        transcript: '',
    });

    // CallLog must have been created exactly once
    assert.equal(mockCreateLog.mock.callCount(), 1, 'createLog should be called exactly once');

    const logArgs = mockCreateLog.mock.calls[0].arguments[0];
    assert.equal(logArgs.elderlyProfileId, USER_ID, 'elderlyProfileId must match userId');
    assert.equal(logArgs.status, 'COMPLETED');
    assert.equal(logArgs.outcome, 'COMPLETED');
    assert.equal(logArgs.elevenlabsConversationId, CONVERSATION_ID);
    assert.equal(logArgs.checkInCompleted, true);
    assert.ok(logArgs.scheduledTime instanceof Date, 'scheduledTime must be a Date');
    assert.ok(logArgs.endTime instanceof Date, 'endTime must be a Date');

    // Summary must reference the CallLog
    assert.equal(mockCreateSummary.mock.callCount(), 1, 'createSummary should be called exactly once');
    const summaryArgs = mockCreateSummary.mock.calls[0].arguments[0];
    assert.equal(summaryArgs.callLogId, CALL_LOG_ID, 'summary callLogId must match the created CallLog id');

    // State must expose callLogId
    assert.equal(result.callLogId, CALL_LOG_ID, 'graph state must contain callLogId');
    assert.equal(result.summaryId, SUMMARY_ID, 'graph state must contain summaryId');
});

test('GS-1: createLog is NOT called when transcript fetch returns nothing', async () => {
    const graph = new GeneralPostCallGraph(
        makeMockOpenAIClient() as any,
        makeMockEmbeddingService() as any,
        makeMockVectorStore() as any,
        makeMockElevenLabsClient(null as any) as any,
    ).compile();

    const result = await graph.invoke({
        conversationId: CONVERSATION_ID,
        userId: USER_ID,
        isFirstCall: false,
        callType: 'general',
        transcript: '',
    });

    assert.equal(mockCreateLog.mock.callCount(), 0, 'createLog must not be called when transcript fetch fails');
    assert.ok(result.errors.length > 0, 'errors should be populated on transcript failure');
});

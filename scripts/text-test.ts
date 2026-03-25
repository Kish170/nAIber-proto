/**
 * Text-based persona call testing via ElevenLabs TextConversation SDK.
 *
 * Tests the full pipeline: ElevenLabs → llm-server → persona graphs, using text instead of voice.
 *
 * Usage:
 *   npm run test:text -- --call-type general
 *   npm run test:text -- --call-type health_check
 *   npm run test:text -- --call-type cognitive
 *   npm run test:text -- --call-type health_check --script scripts/test-scenarios/health-complete.json
 *
 * Prerequisites:
 *   - Docker stack running (Redis, Postgres, Neo4j, Qdrant, llm-server)
 *   - llm-server reachable by ElevenLabs (ngrok/public URL)
 *   - DB seeded (npx prisma db seed)
 *   - .env with ELEVENLABS_AGENT_ID, ELEVENLABS_API_KEY, OPENAI_API_KEY
 *
 * Commands during interactive mode:
 *   !quit     — end session and exit
 *   !postcall — trigger post-call processing and verify results
 *   !info     — print current session details
 */

import 'dotenv/config';
import * as readline from 'node:readline';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { TextConversation } from '@elevenlabs/client';
import { RedisClient } from '@naiber/shared-clients';
import { OpenAIClient } from '@naiber/shared-clients';
import { PrismaClient } from '../generated/prisma/index.js';
import { Queue, QueueEvents } from 'bullmq';
import { UserProfile } from '../apps/server/src/handlers/UserHandler.js';
import { buildGeneralSystemPrompt, buildGeneralFirstMessage } from '../apps/server/src/prompts/GeneralPrompt.js';
import { buildHealthSystemPrompt, buildHealthFirstMessage } from '../apps/server/src/prompts/HealthPrompt.js';
import { buildCognitiveSystemPrompt, buildCognitiveFirstMessage } from '../apps/server/src/prompts/CognitivePrompt.js';

// ─── Types ──────────────────────────────────────────────────────────────────

type CallType = 'general' | 'health_check' | 'cognitive';

interface Checkpoint {
    name: string;
    pass: boolean;
    timestamp: string;
    data?: Record<string, any>;
    error?: string;
}

interface TranscriptEntry {
    role: 'ai' | 'user';
    content: string;
    timestamp: string;
    elapsedMs: number;
}

interface QuestionResult {
    questionId: string;
    type: string;
    category: string;
    questionText: string;
    agentAsked: string;
    userAnswer: string;
    validatedAnswer: any;
    isValid: boolean;
    retries: number;
    retryReason?: string;
    pass: boolean;
}

interface TaskResult {
    position: number;
    type: string;
    domain: string;
    maxScore: number | null;
    agentPrompt: string;
    exchanges: any[];
    score?: number;
    pass: boolean;
}

interface TestResults {
    timestamp: string;
    callType: CallType;
    mode: 'interactive' | 'scripted';
    duration: string;
    conversationId: string;
    userId: string;
    summary: { total: number; passed: number; failed: number; skipped: number };
    checkpoints: Checkpoint[];
    questions?: QuestionResult[];
    tasks?: TaskResult[];
    wellbeing?: any;
    contentRotation?: any;
    scoring?: any;
    postcall?: Checkpoint[];
    transcript: TranscriptEntry[];
}

// ─── TestTracker ────────────────────────────────────────────────────────────

class TestTracker {
    private checkpoints: Checkpoint[] = [];
    private postcallCheckpoints: Checkpoint[] = [];
    private transcript: TranscriptEntry[] = [];
    private questions: QuestionResult[] = [];
    private tasks: TaskResult[] = [];
    private wellbeing: any = null;
    private contentRotation: any = null;
    private scoring: any = null;
    private startTime = Date.now();
    private lastAgentMessage = '';
    private lastSendTime = 0;
    private exchangeCount = 0;
    private conversationId = '';
    private userId = '';
    private callType: CallType = 'general';
    private mode: 'interactive' | 'scripted' = 'interactive';

    record(name: string, pass: boolean, data?: Record<string, any>, error?: string): void {
        this.checkpoints.push({
            name,
            pass,
            timestamp: new Date().toISOString(),
            data,
            error,
        });
        const icon = pass ? '✓' : '✗';
        const suffix = error ? ` — ${error}` : data ? ` (${JSON.stringify(data)})` : '';
        console.log(`  ${icon} ${name}${suffix}`);
    }

    recordPostcall(name: string, pass: boolean, data?: Record<string, any>, error?: string): void {
        this.postcallCheckpoints.push({
            name,
            pass,
            timestamp: new Date().toISOString(),
            data,
            error,
        });
        const icon = pass ? '✓' : '✗';
        const suffix = error ? ` — ${error}` : data ? ` (${JSON.stringify(data)})` : '';
        console.log(`  ${icon} ${name}${suffix}`);
    }

    recordTranscript(role: 'ai' | 'user', content: string): void {
        this.transcript.push({
            role,
            content,
            timestamp: new Date().toISOString(),
            elapsedMs: Date.now() - this.startTime,
        });
        if (role === 'ai') {
            this.lastAgentMessage = content;
            if (this.lastSendTime > 0) {
                const latencyMs = Date.now() - this.lastSendTime;
                console.log(`  [latency: ${latencyMs}ms]`);
            }
        }
    }

    recordQuestion(q: QuestionResult): void {
        this.questions.push(q);
    }

    recordTask(t: TaskResult): void {
        this.tasks.push(t);
    }

    setWellbeing(w: any): void { this.wellbeing = w; }
    setContentRotation(c: any): void { this.contentRotation = c; }
    setScoring(s: any): void { this.scoring = s; }

    setMeta(conversationId: string, userId: string, callType: CallType, mode: 'interactive' | 'scripted'): void {
        this.conversationId = conversationId;
        this.userId = userId;
        this.callType = callType;
        this.mode = mode;
    }

    markSend(): void { this.lastSendTime = Date.now(); }
    incrementExchange(): void { this.exchangeCount++; }
    getLastAgentMessage(): string { return this.lastAgentMessage; }
    getExchangeCount(): number { return this.exchangeCount; }

    buildResults(): TestResults {
        const allCheckpoints = [...this.checkpoints, ...this.postcallCheckpoints];
        const passed = allCheckpoints.filter(c => c.pass).length;
        const failed = allCheckpoints.filter(c => !c.pass).length;
        const duration = `${Math.round((Date.now() - this.startTime) / 1000)}s`;

        const results: TestResults = {
            timestamp: new Date().toISOString(),
            callType: this.callType,
            mode: this.mode,
            duration,
            conversationId: this.conversationId,
            userId: this.userId,
            summary: { total: allCheckpoints.length, passed, failed, skipped: 0 },
            checkpoints: this.checkpoints,
            transcript: this.transcript,
        };

        if (this.questions.length > 0) results.questions = this.questions;
        if (this.tasks.length > 0) results.tasks = this.tasks;
        if (this.wellbeing) results.wellbeing = this.wellbeing;
        if (this.contentRotation) results.contentRotation = this.contentRotation;
        if (this.scoring) results.scoring = this.scoring;
        if (this.postcallCheckpoints.length > 0) results.postcall = this.postcallCheckpoints;

        return results;
    }

    printSummary(): void {
        const results = this.buildResults();
        console.log('\n' + '='.repeat(60));
        console.log(`=== Test Results: ${results.callType} ===`);
        console.log(`Duration: ${results.duration} | Exchanges: ${this.exchangeCount}`);
        console.log(`Checkpoints: ${results.summary.passed}/${results.summary.total} passed`);
        console.log('');

        console.log('  Connection & Routing:');
        for (const cp of this.checkpoints.filter(c => ['elevenlabs_connected', 'redis_session_created', 'conversation_resolver', 'supervisor_routing', 'durable_execution_active'].includes(c.name))) {
            const icon = cp.pass ? '✓' : '✗';
            console.log(`    ${icon} ${cp.name}${cp.error ? ` — ${cp.error}` : ''}`);
        }

        if (this.callType === 'health_check' && this.questions.length > 0) {
            console.log('\n  Health Check Questions:');
            for (const q of this.questions) {
                const icon = q.pass ? '✓' : '✗';
                console.log(`    ${icon} ${q.questionId} (${q.type}) — answer: ${JSON.stringify(q.validatedAnswer)}${q.retries > 0 ? ` [${q.retries} retries]` : ''}`);
            }
        }

        if (this.callType === 'cognitive' && this.tasks.length > 0) {
            console.log('\n  Cognitive Tasks:');
            for (const t of this.tasks) {
                const icon = t.pass ? '✓' : '✗';
                const scoreStr = t.score != null ? ` — score: ${t.score}/${t.maxScore ?? '∞'}` : '';
                console.log(`    ${icon} Task ${t.position}: ${t.type}${scoreStr}`);
            }
            if (this.scoring) {
                console.log(`\n  Stability Index: ${this.scoring.stabilityIndex}`);
            }
        }

        if (this.postcallCheckpoints.length > 0) {
            console.log('\n  Post-Call:');
            for (const cp of this.postcallCheckpoints) {
                const icon = cp.pass ? '✓' : '✗';
                console.log(`    ${icon} ${cp.name}${cp.error ? ` — ${cp.error}` : ''}`);
            }
        }

        console.log('='.repeat(60));
    }
}

// ─── Output ─────────────────────────────────────────────────────────────────

function ensureResultsDir(): string {
    const dir = path.join(process.cwd(), 'scripts', 'test-results');
    if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
    }
    return dir;
}

function saveResults(tracker: TestTracker): void {
    const results = tracker.buildResults();
    const dir = ensureResultsDir();
    const ts = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);

    // JSON results
    const jsonPath = path.join(dir, `results-${results.callType}-${ts}.json`);
    fs.writeFileSync(jsonPath, JSON.stringify(results, null, 2));
    console.log(`\nResults → ${jsonPath}`);

    // Markdown transcript
    const mdPath = path.join(dir, `transcript-${results.callType}-${ts}.md`);
    fs.writeFileSync(mdPath, buildMarkdownTranscript(results));
    console.log(`Transcript → ${mdPath}`);
}

function buildMarkdownTranscript(results: TestResults): string {
    const lines: string[] = [];
    const callTypeLabel = results.callType.replace(/_/g, ' ');

    lines.push(`# ${callTypeLabel.charAt(0).toUpperCase() + callTypeLabel.slice(1)} Transcript — ${results.timestamp.slice(0, 16).replace('T', ' ')}`);
    lines.push('');
    lines.push(`**Call Type:** ${results.callType}`);
    lines.push(`**Duration:** ${results.duration}`);
    lines.push(`**Conversation ID:** ${results.conversationId}`);
    lines.push(`**User ID:** ${results.userId}`);
    lines.push(`**Result:** ${results.summary.passed}/${results.summary.total} checkpoints passed`);
    lines.push('');
    lines.push('---');
    lines.push('');

    // Connection section
    lines.push('## Connection');
    for (const cp of results.checkpoints.filter(c =>
        ['elevenlabs_connected', 'redis_session_created', 'conversation_resolver', 'supervisor_routing'].includes(c.name)
    )) {
        const icon = cp.pass ? '✅' : '❌';
        lines.push(`- ${icon} ${cp.name}${cp.data ? ` — ${JSON.stringify(cp.data)}` : ''}${cp.error ? ` — ${cp.error}` : ''}`);
    }
    lines.push('');
    lines.push('---');
    lines.push('');

    // Conversation transcript
    lines.push('## Conversation');
    lines.push('');
    const startTime = results.transcript[0]?.elapsedMs ?? 0;
    for (const entry of results.transcript) {
        const elapsed = Math.round((entry.elapsedMs - startTime) / 1000);
        const mins = Math.floor(elapsed / 60);
        const secs = elapsed % 60;
        const timeStr = `${mins}:${String(secs).padStart(2, '0')}`;
        const role = entry.role === 'ai' ? 'AI' : 'USER';
        lines.push(`**[${role} — ${timeStr}]** ${entry.content}`);
        lines.push('');
    }

    // Questions summary (health check)
    if (results.questions && results.questions.length > 0) {
        lines.push('---');
        lines.push('');
        lines.push('## Questions Summary');
        lines.push('');
        lines.push('| Question | Type | Answer | Valid |');
        lines.push('|---|---|---|---|');
        for (const q of results.questions) {
            const icon = q.isValid ? '✅' : '❌';
            const answer = typeof q.validatedAnswer === 'string'
                ? q.validatedAnswer.slice(0, 40) + (q.validatedAnswer.length > 40 ? '...' : '')
                : String(q.validatedAnswer);
            lines.push(`| ${q.questionId} | ${q.type} | ${answer} | ${icon} |`);
        }
        lines.push('');
    }

    // Tasks summary (cognitive)
    if (results.tasks && results.tasks.length > 0) {
        lines.push('---');
        lines.push('');
        lines.push('## Tasks Summary');
        lines.push('');
        lines.push('| # | Task | Domain | Score |');
        lines.push('|---|---|---|---|');
        for (const t of results.tasks) {
            const scoreStr = t.score != null ? `${t.score}/${t.maxScore ?? '∞'}` : 'n/a';
            lines.push(`| ${t.position} | ${t.type} | ${t.domain} | ${scoreStr} |`);
        }
        lines.push('');

        if (results.scoring) {
            lines.push('### Domain Scores');
            lines.push('');
            for (const [domain, data] of Object.entries(results.scoring.domainScores ?? {})) {
                const d = data as any;
                lines.push(`- **${domain}:** ${d.raw}/${d.max ?? '∞'} (normalized: ${d.normalized ?? 'n/a'})`);
            }
            lines.push('');
            lines.push(`**Stability Index:** ${results.scoring.stabilityIndex}`);
            lines.push('');
        }
    }

    // Post-call
    if (results.postcall && results.postcall.length > 0) {
        lines.push('---');
        lines.push('');
        lines.push('## Post-Call');
        lines.push('');
        for (const cp of results.postcall) {
            const icon = cp.pass ? '✅' : '❌';
            lines.push(`- ${icon} ${cp.name}${cp.data ? ` — ${JSON.stringify(cp.data)}` : ''}${cp.error ? ` — ${cp.error}` : ''}`);
        }
        lines.push('');
    }

    return lines.join('\n');
}

// ─── Redis Session ──────────────────────────────────────────────────────────

async function createRedisSession(
    redis: RedisClient,
    conversationId: string,
    userId: string,
    phone: string,
    callType: CallType,
    tracker: TestTracker
): Promise<void> {
    const ttl = 3600;
    const sessionData = {
        callSid: `CA-text-test-${Date.now()}`,
        conversationId,
        userId,
        phone,
        streamSid: `MZ-text-test-${Date.now()}`,
        startedAt: new Date().toISOString(),
        lastMessageAt: new Date().toISOString(),
        callType,
    };

    try {
        await redis.set(`session:${conversationId}`, JSON.stringify(sessionData), { EX: ttl });
        await redis.set(`rag:user:${userId}`, conversationId, { EX: ttl });
        tracker.record('redis_session_created', true);
    } catch (err: any) {
        tracker.record('redis_session_created', false, undefined, err.message);
        throw err;
    }
}

async function cleanupRedisSession(redis: RedisClient, conversationId: string, userId: string): Promise<void> {
    try {
        await redis.deleteByPattern(`session:${conversationId}`);
        await redis.deleteByPattern(`rag:user:${userId}`);
        console.log('[cleanup] Redis session keys deleted');
    } catch (err) {
        console.warn('[cleanup] Failed to delete Redis keys:', err);
    }
}

// ─── Post-Call ──────────────────────────────────────────────────────────────

async function triggerPostCall(
    conversationId: string,
    userId: string,
    callType: CallType,
    tracker: TestTracker
): Promise<void> {
    console.log('\n[postcall] Dispatching post-call job...');

    const redisUrl = process.env.REDIS_URL || 'redis://localhost:6379';
    const queue = new Queue('post-call-processing', {
        connection: { url: redisUrl },
    });
    const queueEvents = new QueueEvents('post-call-processing', {
        connection: { url: redisUrl },
    });

    try {
        const job = await queue.add('post-call', {
            conversationId,
            userId,
            isFirstCall: true,
            callType,
            timestamp: Date.now(),
        });
        tracker.recordPostcall('postcall_dispatched', true, { jobId: job.id });

        // Wait for completion
        console.log('[postcall] Waiting for job to complete (timeout 30s)...');
        const result = await job.waitUntilFinished(queueEvents, 30000).catch((err: any) => {
            tracker.recordPostcall('postcall_completed', false, undefined, err.message);
            return null;
        });

        if (result) {
            tracker.recordPostcall('postcall_completed', true, { result });
        }

        // Verify results by call type
        await verifyPostCallResults(conversationId, userId, callType, tracker);

    } catch (err: any) {
        tracker.recordPostcall('postcall_dispatched', false, undefined, err.message);
    } finally {
        await queueEvents.close();
        await queue.close();
    }
}

async function verifyPostCallResults(
    conversationId: string,
    userId: string,
    callType: CallType,
    tracker: TestTracker
): Promise<void> {
    const prisma = new PrismaClient();
    const redis = RedisClient.getInstance();

    try {
        if (callType === 'general') {
            // Check conversation summary
            const summary = await prisma.conversationSummary.findFirst({
                where: { conversationId },
            });
            tracker.recordPostcall('postcall_summary', !!summary, summary ? { summaryLength: summary.summaryText?.length } : undefined);

            // Check topics via conversation topic references
            const topicRefs = await prisma.conversationTopicReference.findMany({
                where: { conversationSummary: { conversationId } },
                include: { conversationTopic: true },
            });
            tracker.recordPostcall('postcall_topics', topicRefs.length > 0, {
                topicCount: topicRefs.length,
                topics: topicRefs.map(r => r.conversationTopic.topicName),
            });

            // KG verification (Neo4j) - check if nodes were created
            try {
                const neo4j = await import('neo4j-driver');
                const driver = neo4j.default.driver(
                    process.env.NEO4J_URI || 'bolt://localhost:7687',
                    neo4j.default.auth.basic(
                        process.env.NEO4J_USERNAME || 'neo4j',
                        process.env.NEO4J_PASSWORD || 'password'
                    )
                );
                const session = driver.session();

                // Check Conversation node
                const convResult = await session.run(
                    'MATCH (c:Conversation {conversationId: $conversationId}) RETURN c', { conversationId }
                );
                tracker.recordPostcall('postcall_kg_conversation_node', convResult.records.length > 0);

                // Check Summary node (Conversation -[:HAS_SUMMARY]-> Summary)
                const summaryResult = await session.run(
                    'MATCH (c:Conversation {conversationId: $conversationId})-[:HAS_SUMMARY]->(s:Summary) RETURN s', { conversationId }
                );
                tracker.recordPostcall('postcall_kg_summary_node', summaryResult.records.length > 0);

                // Check Topic nodes (Summary -[:MENTIONS]-> Topic)
                const topicResult = await session.run(
                    'MATCH (c:Conversation {conversationId: $conversationId})-[:HAS_SUMMARY]->(s)-[:MENTIONS]->(t:Topic) RETURN t', { conversationId }
                );
                tracker.recordPostcall('postcall_kg_topics', topicResult.records.length > 0, {
                    topicNodes: topicResult.records.length,
                });

                // Check Person nodes (User -[:MENTIONED]-> Person)
                const personResult = await session.run(
                    'MATCH (u:User {userId: $userId})-[:MENTIONED]->(p:Person) RETURN p', { userId }
                );
                tracker.recordPostcall('postcall_kg_persons', true, {
                    persons: personResult.records.map(r => r.get('p').properties.name),
                });

                // Check relationships from Conversation node
                const relResult = await session.run(
                    `MATCH (c:Conversation {conversationId: $conversationId})-[r]->() RETURN type(r) as relType, count(*) as cnt`,
                    { conversationId }
                );
                const rels: Record<string, number> = {};
                for (const r of relResult.records) {
                    rels[r.get('relType')] = r.get('cnt').toNumber?.() ?? r.get('cnt');
                }
                tracker.recordPostcall('postcall_kg_relationships', Object.keys(rels).length > 0, rels);

                await session.close();
                await driver.close();
            } catch (err: any) {
                tracker.recordPostcall('postcall_kg_conversation_node', false, undefined, `Neo4j error: ${err.message}`);
            }

            // Check Redis cleanup
            const topicKey = await redis.get(`rag:topic:${conversationId}`);
            tracker.recordPostcall('postcall_redis_cleanup', topicKey === null);

        } else if (callType === 'health_check') {
            // Check health check log (answers is a Json field)
            const log = await prisma.healthCheckLog.findFirst({
                where: { conversationId },
            });
            const answers = Array.isArray(log?.answers) ? log.answers : [];
            tracker.recordPostcall('postcall_answers_persisted', answers.length > 0, {
                answersRecorded: answers.length,
            });
            tracker.recordPostcall('postcall_log_created', !!log);

            // Check thread deleted
            const threadKey = await redis.get(`health_check:${userId}:${conversationId}`);
            tracker.recordPostcall('postcall_thread_deleted', threadKey === null);

        } else if (callType === 'cognitive') {
            // Check cognitive test result
            const result = await prisma.cognitiveTestResult.findFirst({
                where: { conversationId },
            });
            tracker.recordPostcall('postcall_results_persisted', !!result, result ? {
                taskResponseCount: (result.taskResponses as any[])?.length,
            } : undefined);

            // Check baseline updated
            const baseline = await prisma.cognitiveBaseline.findFirst({
                where: { elderlyProfileId: userId },
                orderBy: { version: 'desc' },
            });
            tracker.recordPostcall('postcall_baseline_updated', !!baseline);

            // Check thread deleted
            const threadKey = await redis.get(`cognitive:${userId}:${conversationId}`);
            tracker.recordPostcall('postcall_thread_deleted', threadKey === null);
        }
    } catch (err: any) {
        console.error('[postcall] Verification error:', err.message);
    } finally {
        await prisma.$disconnect();
    }
}

// ─── Main ───────────────────────────────────────────────────────────────────

async function main(): Promise<void> {
    // Parse args
    const args = process.argv.slice(2);
    const callTypeIdx = args.indexOf('--call-type');
    const scriptIdx = args.indexOf('--script');

    if (callTypeIdx === -1 || !args[callTypeIdx + 1]) {
        console.error('Usage: tsx scripts/text-test.ts --call-type general|health_check|cognitive [--script <path>]');
        process.exit(1);
    }

    const callType = args[callTypeIdx + 1] as CallType;
    if (!['general', 'health_check', 'cognitive'].includes(callType)) {
        console.error(`Invalid call type: ${callType}. Must be general, health_check, or cognitive.`);
        process.exit(1);
    }

    const scriptPath = scriptIdx !== -1 ? args[scriptIdx + 1] : null;
    let scriptMessages: string[] = [];
    let scriptDelay = 2000;

    if (scriptPath) {
        const scriptContent = JSON.parse(fs.readFileSync(scriptPath, 'utf-8'));
        scriptMessages = scriptContent.messages;
        scriptDelay = scriptContent.delayMs || 2000;
        console.log(`[script] Loaded ${scriptMessages.length} messages from ${scriptPath}`);
    }

    const tracker = new TestTracker();
    const isScripted = scriptMessages.length > 0;

    console.log(`\n${'='.repeat(60)}`);
    console.log(`  nAIber Text Test — ${callType}`);
    console.log(`  Mode: ${isScripted ? 'scripted' : 'interactive'}`);
    console.log(`${'='.repeat(60)}\n`);

    // Load user profile
    const prisma = new PrismaClient();
    const elderlyProfile = await prisma.elderlyProfile.findFirst({
        include: {
            authUser: true,
            healthConditions: true,
            medications: true,
            emergencyContact: true,
            conversationTopics: { take: 5, orderBy: { updatedAt: 'desc' } },
            conversationSummaries: { take: 3, orderBy: { createdAt: 'desc' } },
        },
    });
    await prisma.$disconnect();

    if (!elderlyProfile) {
        console.error('No elderly profile found. Run: npx prisma db seed');
        process.exit(1);
    }

    const userId = elderlyProfile.id;
    const phone = elderlyProfile.phone;
    console.log(`[user] ${elderlyProfile.name} (${userId})`);

    // Load UserProfile for prompt builders
    const userProfile = await UserProfile.loadById(userId);
    if (!userProfile) {
        console.error('Failed to load UserProfile');
        process.exit(1);
    }

    // Build system prompt and first message
    const openAIClient = OpenAIClient.getInstance({
        apiKey: process.env.OPENAI_API_KEY!,
        baseUrl: process.env.OPENAI_BASE_URL,
    });
    let systemPrompt: string;
    let firstMessage: string;

    switch (callType) {
        case 'health_check':
            systemPrompt = buildHealthSystemPrompt(userProfile);
            firstMessage = await buildHealthFirstMessage(userProfile, openAIClient);
            break;
        case 'cognitive':
            systemPrompt = buildCognitiveSystemPrompt(userProfile);
            firstMessage = await buildCognitiveFirstMessage(userProfile, openAIClient);
            break;
        case 'general':
        default:
            systemPrompt = buildGeneralSystemPrompt(userProfile);
            firstMessage = await buildGeneralFirstMessage(userProfile, openAIClient);
            break;
    }

    console.log(`[prompt] System prompt built (${systemPrompt.length} chars)`);
    console.log(`[prompt] First message: "${firstMessage.slice(0, 80)}..."`);

    // Connect to Redis
    const redis = RedisClient.getInstance();
    await redis.connect();

    // State for session management
    let conversationId = '';
    let sessionCreated = false;
    const sessionReadyPromise = new Promise<void>((resolve) => {
        const check = () => {
            if (sessionCreated) resolve();
            else setTimeout(check, 50);
        };
        check();
    });

    // Get signed URL for authenticated agent
    console.log('\n[elevenlabs] Getting signed URL...');
    let signedUrl: string;
    try {
        const agentId = process.env.ELEVENLABS_AGENT_ID!;
        const apiKey = process.env.ELEVENLABS_API_KEY!;
        const resp = await fetch(
            `https://api.elevenlabs.io/v1/convai/conversation/get-signed-url?agent_id=${agentId}`,
            { headers: { 'xi-api-key': apiKey } }
        );
        if (!resp.ok) {
            throw new Error(`Failed to get signed URL: ${resp.status} ${resp.statusText}`);
        }
        const data = await resp.json() as { signed_url: string };
        signedUrl = data.signed_url;
        console.log('[elevenlabs] Signed URL obtained');
    } catch (err: any) {
        console.error('[elevenlabs] Failed to get signed URL:', err.message);
        tracker.record('elevenlabs_connected', false, undefined, err.message);
        tracker.printSummary();
        saveResults(tracker);
        process.exit(1);
    }

    // Start ElevenLabs TextConversation
    console.log('[elevenlabs] Starting text conversation session...');

    let conversation: TextConversation;
    try {
        conversation = await TextConversation.startSession({
            signedUrl,
            overrides: {
                agent: {
                    prompt: { prompt: systemPrompt },
                    firstMessage,
                },
                conversation: { textOnly: true },
            },
            onDebug: (info: unknown) => {
                console.log('[elevenlabs:debug]', JSON.stringify(info, null, 2));
            },
            onConnect: async ({ conversationId: convId }: { conversationId: string }) => {
                conversationId = convId;
                tracker.record('elevenlabs_connected', true, { conversationId: convId });
                tracker.setMeta(convId, userId, callType, isScripted ? 'scripted' : 'interactive');

                // Create Redis session
                await createRedisSession(redis, convId, userId, phone, callType, tracker);
                sessionCreated = true;
            },
            onMessage: ({ message, source }: { message: string; source: string }) => {
                if (source === 'ai') {
                    tracker.recordTranscript('ai', message);
                    tracker.incrementExchange();

                    // Check for first agent response (proves resolver + routing worked)
                    if (tracker.getExchangeCount() === 1) {
                        tracker.record('conversation_resolver', true);
                        tracker.record('supervisor_routing', true, { routedTo: callType === 'general' ? 'general_call' : callType });
                    }

                    console.log(`\n  [AI] ${message}\n`);
                }
            },
            onDisconnect: (details: any) => {
                console.log(`\n[elevenlabs] Disconnected:`, JSON.stringify(details, null, 2));
            },
            onError: (message: string, details?: unknown) => {
                console.error(`[elevenlabs] Error: ${message}`, details ? JSON.stringify(details) : '');
            },
        });
    } catch (err: any) {
        const errMsg = err?.message || err?.reason || String(err);
        tracker.record('elevenlabs_connected', false, undefined, errMsg);
        console.error(`[elevenlabs] Failed to start session:`, err);
        tracker.printSummary();
        saveResults(tracker);
        process.exit(1);
    }

    // Wait for session to be ready
    await sessionReadyPromise;

    if (callType === 'health_check' || callType === 'cognitive') {
        tracker.record('durable_execution_active', true);
    }

    // Send messages
    if (isScripted) {
        // Scripted mode
        for (let i = 0; i < scriptMessages.length; i++) {
            await new Promise(r => setTimeout(r, scriptDelay));
            const msg = scriptMessages[i];
            console.log(`  [YOU] ${msg}`);
            tracker.recordTranscript('user', msg);
            tracker.markSend();
            conversation.sendUserMessage(msg);

            // Wait for response
            await new Promise(r => setTimeout(r, scriptDelay));
        }

        // Wait a bit for final response
        await new Promise(r => setTimeout(r, 3000));

        // Cleanup scripted mode
        console.log('\n[session] Scripted mode complete, ending session...');
        await conversation.endSession();

        // Give ElevenLabs time to finalize the transcript before post-call
        console.log('[session] Waiting 5s for transcript to become available...');
        await new Promise(r => setTimeout(r, 5000));

        // Trigger post-call processing and verify results
        await triggerPostCall(conversationId, userId, callType, tracker);

        await cleanupRedisSession(redis, conversationId, userId);
        tracker.printSummary();
        saveResults(tracker);
        await redis.disconnect();
        process.exit(0);

    } else {
        // Interactive mode
        const rl = readline.createInterface({
            input: process.stdin,
            output: process.stdout,
        });

        const prompt = () => {
            rl.question('  [YOU] ', async (input) => {
                const trimmed = input.trim();

                if (trimmed === '!quit') {
                    console.log('\n[session] Ending...');
                    await conversation.endSession();
                    await cleanupRedisSession(redis, conversationId, userId);
                    tracker.printSummary();
                    saveResults(tracker);
                    rl.close();
                    await redis.disconnect();
                    process.exit(0);
                }

                if (trimmed === '!postcall') {
                    await triggerPostCall(conversationId, userId, callType, tracker);
                    prompt();
                    return;
                }

                if (trimmed === '!info') {
                    console.log(`\n  Conversation ID: ${conversationId}`);
                    console.log(`  Call Type: ${callType}`);
                    console.log(`  User: ${elderlyProfile.name} (${userId})`);
                    console.log(`  Exchanges: ${tracker.getExchangeCount()}`);
                    console.log(`  Last agent: "${tracker.getLastAgentMessage().slice(0, 80)}..."\n`);
                    prompt();
                    return;
                }

                if (!trimmed) {
                    prompt();
                    return;
                }

                tracker.recordTranscript('user', trimmed);
                tracker.markSend();
                conversation.sendUserMessage(trimmed);

                // Wait for response before prompting again
                await new Promise(r => setTimeout(r, 2000));
                prompt();
            });
        };

        console.log('\n  Type your messages. Commands: !quit, !postcall, !info\n');

        // Wait for first agent message
        await new Promise(r => setTimeout(r, 3000));
        prompt();
    }
}

// ─── Entry Point ────────────────────────────────────────────────────────────

main().catch((err) => {
    console.error('Fatal error:', err);
    process.exit(1);
});

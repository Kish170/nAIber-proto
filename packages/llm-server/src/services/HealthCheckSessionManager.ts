import { RedisClient } from "@naiber/shared";
import { HealthCheckHandler, ParsedHealthCheckData } from "../handlers/HealthCheckHandler.js";
import { Question, ScaleQuestion, BooleanQuestion, TextQuestion, QuestionCategory } from "../handlers/questions/index.js";
import { HealthCheckAnswer } from "../states/ConversationState.js";

export interface HealthCheckSession {
    userId: string;
    conversationId: string;  
    currentQuestionIndex: number;
    totalQuestions: number;
    questions: Question[];
    answers: HealthCheckAnswer[];
    questionAttempts: number;
    isComplete: boolean;
    startedAt: number;
    lastUpdatedAt: number;
}

export interface QuestionData {
    type: string; 
    question: string; 
    category: string; 
    relatedTo: string; 
    min: number;
    max: number; 
    optional: boolean;
}

export class HealthCheckSessionManager {
    private readonly SESSION_KEY_PREFIX = 'health_check:';
    private readonly DEFAULT_TTL = 3600; 

    constructor(private redisClient: RedisClient) {}

    async initializeSession(userId: string, conversationId: string): Promise<HealthCheckSession> {
        const existing = await this.getSession(userId);
        if (existing) {
            console.log('[HealthCheckSessionManager] Session already exists for user:', userId);
            return existing;
        }

        const questions = await HealthCheckHandler.initializeHealthCheck(userId);

        const session: HealthCheckSession = {
            userId,
            conversationId,
            currentQuestionIndex: 0,
            totalQuestions: questions.length,
            questions,
            answers: [],
            questionAttempts: 0,
            isComplete: false,
            startedAt: Date.now(),
            lastUpdatedAt: Date.now()
        };

        await this.saveSession(session);

        console.log('[HealthCheckSessionManager] Initialized session:', {
            userId,
            conversationId,
            totalQuestions: questions.length
        });

        return session;
    }

    async getSession(userId: string): Promise<HealthCheckSession | null> {
        const key = this.getSessionKey(userId);
        const session = await this.redisClient.getJSON<any>(key);

        if (!session) {
            return null;
        }

        session.questions = session.questions.map((q: any) => this.rehydrateQuestion(q));

        if (session.answers && session.answers.length > 0) {
            session.answers = session.answers.map((a: any) => ({
                ...a,
                question: this.rehydrateQuestion(a.question)
            }));
        }

        console.log('[HealthCheckSessionManager] Retrieved session:', {
            userId,
            conversationId: session.conversationId,
            currentQuestion: session.currentQuestionIndex,
            totalQuestions: session.totalQuestions,
            isComplete: session.isComplete
        });

        return session as HealthCheckSession;
    }

    private rehydrateQuestion(questionData: any): Question {
        const { type, question, category, relatedTo, min, max, optional } = questionData;

        switch (type) {
            case 'scale':
                return new ScaleQuestion(
                    question,
                    category as QuestionCategory,
                    min ?? 1,
                    max ?? 10,
                    relatedTo
                );

            case 'boolean':
                return new BooleanQuestion(
                    question,
                    category as QuestionCategory,
                    relatedTo
                );

            case 'text':
                return new TextQuestion(
                    question,
                    category as QuestionCategory,
                    optional ?? true,
                    relatedTo
                );

            default:
                console.error('[HealthCheckSessionManager] Unknown question type:', type);
                return new TextQuestion(
                    question,
                    category as QuestionCategory,
                    true,
                    relatedTo
                );
        }
    }

    async saveSession(session: HealthCheckSession): Promise<void> {
        const key = this.getSessionKey(session.userId);
        session.lastUpdatedAt = Date.now();

        await this.redisClient.setJSON(key, session, this.DEFAULT_TTL);

        console.log('[HealthCheckSessionManager] Saved session:', {
            userId: session.userId,
            conversationId: session.conversationId,
            currentQuestion: session.currentQuestionIndex,
            totalQuestions: session.totalQuestions
        });
    }

    async completeSession(userId: string): Promise<void> {
        const session = await this.getSession(userId);
        if (!session) {
            console.warn('[HealthCheckSessionManager] No session found to complete:', userId);
            return;
        }

        session.isComplete = true;
        await this.saveSession(session);

        const validAnswers = session.answers.filter(a => a.isValid);
        const questions = validAnswers.map(a => a.question);
        const answers = validAnswers.map(a => a.validatedAnswer);

        try {
            const parsedData = HealthCheckHandler.parseHealthCheckAnswers(questions, answers);

            await HealthCheckHandler.saveHealthCheckResults(
                session.userId,
                session.conversationId,
                parsedData
            );

            console.log('[HealthCheckSessionManager] Health check completed and saved:', {
                userId,
                conversationId: session.conversationId,
                totalAnswers: validAnswers.length
            });

            await this.deleteSession(userId);
        } catch (error) {
            console.error('[HealthCheckSessionManager] Error saving health check results:', error);
            throw error;
        }
    }

    async deleteSession(userId: string): Promise<void> {
        const key = this.getSessionKey(userId);
        await this.redisClient.getClient().del(key);

        console.log('[HealthCheckSessionManager] Deleted session:', userId);
    }

    private getSessionKey(userId: string): string {
        return `${this.SESSION_KEY_PREFIX}${userId}`;
    }

    async hasActiveSession(userId: string): Promise<boolean> {
        const session = await this.getSession(userId);
        return session !== null && !session.isComplete;
    }
}
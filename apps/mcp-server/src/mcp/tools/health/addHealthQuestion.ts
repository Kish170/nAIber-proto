import { RedisClient } from '@naiber/shared-clients';
import { randomUUID } from 'crypto';

const QUEUE_TTL_SECONDS = 7200;

export interface AddHealthQuestionInput {
    topic: string;
    questionText: string;
    conversationId: string;
    questionType?: 'scale' | 'boolean' | 'text';
}

export async function addHealthQuestionHandler(input: AddHealthQuestionInput): Promise<{ questionId: string }> {
    const { topic, questionText, conversationId, questionType } = input;

    const questionId = randomUUID();
    const question = {
        id: questionId,
        topic,
        questionText,
        questionType: questionType ?? inferType(topic),
        source: 'tangent_created' as const,
        addedAt: Date.now()
    };

    const redisKey = `health:new_questions:${conversationId}`;
    const rawClient = RedisClient.getInstance().getClient();
    await rawClient.lPush(redisKey, JSON.stringify(question));
    await rawClient.expire(redisKey, QUEUE_TTL_SECONDS);

    console.log(`[MCP addHealthQuestion] Queued question for ${conversationId}:`, { topic, questionId });

    return { questionId };
}

function inferType(topic: string): 'scale' | 'boolean' | 'text' {
    if (topic === 'MEDICATION_ADHERENCE') return 'boolean';
    if (topic === 'SLEEP') return 'scale';
    return 'text';
}

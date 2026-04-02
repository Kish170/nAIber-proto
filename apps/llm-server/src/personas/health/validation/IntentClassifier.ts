import nlp from 'compromise';
import { ChatOpenAI } from '@langchain/openai';
import { IntentSchema, type IntentResult } from './ExtractionSchemas.js';

export type IntentClassification = IntentResult & { tier: 1 | 2 };

const REFUSING_PATTERN = /\b(skip|pass|refuse|don'?t want|move on|stop|next question|not comfortable|rather not|i'?d rather skip|leave it|forget it|ignore it)\b/i;

export class IntentClassifier {
    private structuredLLM: ReturnType<ChatOpenAI['withStructuredOutput']>;

    constructor(chatModel: ChatOpenAI) {
        this.structuredLLM = chatModel.withStructuredOutput(IntentSchema);
    }

    classifyRulesOnly(rawAnswer: string): IntentClassification {
        const trimmed = rawAnswer.trim();

        if (REFUSING_PATTERN.test(trimmed)) {
            console.log('[IntentClassifier] tier:1 REFUSING (rules-only)');
            return { intent: 'REFUSING', confidence: 1.0, tier: 1 };
        }

        const doc = nlp(trimmed);
        if (doc.sentences().isQuestion().length > 0) {
            console.log('[IntentClassifier] tier:1 ASKING (rules-only)');
            return { intent: 'ASKING', confidence: 0.9, tier: 1 };
        }

        console.log('[IntentClassifier] tier:1 ANSWERING (rules-only)');
        return { intent: 'ANSWERING', confidence: 1.0, tier: 1 };
    }

    async classify(rawAnswer: string): Promise<IntentClassification> {
        const trimmed = rawAnswer.trim();

        if (REFUSING_PATTERN.test(trimmed)) {
            console.log('[IntentClassifier] tier:1 REFUSING');
            return { intent: 'REFUSING', confidence: 1.0, tier: 1 };
        }

        const doc = nlp(trimmed);
        if (doc.sentences().isQuestion().length > 0) {
            console.log('[IntentClassifier] tier:1 ASKING');
            return { intent: 'ASKING', confidence: 0.9, tier: 1 };
        }

        try {
            const result = await this.structuredLLM.invoke([
                {
                    role: 'system',
                    content:
                        'Classify the user message as one of: ANSWERING, ASKING, REFUSING.\n' +
                        'ANSWERING = attempting to give an answer, even if vague or poorly formatted.\n' +
                        'ASKING = asking a clarifying question back.\n' +
                        'REFUSING = explicitly declining to answer or wanting to skip.\n' +
                        `User message: "${trimmed}"`
                }
            ]) as IntentResult;

            console.log(`[IntentClassifier] tier:2 ${result.intent} (confidence: ${result.confidence})`);
            return { ...result, tier: 2 };
        } catch {
            console.warn('[IntentClassifier] LLM fallback failed, defaulting to ANSWERING');
            return { intent: 'ANSWERING', confidence: 0.5, tier: 2 };
        }
    }
}
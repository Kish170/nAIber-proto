import { z } from 'zod';
import { ChatOpenAI } from '@langchain/openai';

const IntentSchema = z.object({
    intent: z.enum(['ANSWERING', 'ASKING', 'REFUSING', 'CONFIRMING']).describe(
        'ANSWERING = attempting to give an answer; ' +
        'ASKING = asking a question back; ' +
        'REFUSING = declining to answer; ' +
        'CONFIRMING = acknowledging they understood and are ready (e.g. "yes", "ok", "sure", "I\'ll try")'
    ),
    confidence: z.number().min(0).max(1),
});

type IntentResult = z.infer<typeof IntentSchema>;

const CONFIRMING_PATTERNS = /\b(yes|yeah|yep|ok|okay|sure|ready|go ahead|let'?s go|alright|I'?ll try|I can try|got it|understood|of course|certainly|definitely)\b/i;
const REFUSING_PATTERNS = /\b(no|nope|I (can'?t|don'?t|won'?t|refuse|want to stop)|skip|stop|quit|not (today|now)|I'?d rather not)\b/i;
const ASKING_PATTERNS = /\?$/;

export class CognitiveIntentClassifier {
    private structuredLLM: ReturnType<ChatOpenAI['withStructuredOutput']>;

    constructor(private readonly llm: ChatOpenAI) {
        this.structuredLLM = llm.withStructuredOutput(IntentSchema);
    }

    classifyRulesOnly(rawAnswer: string): { intent: IntentResult['intent']; tier: 1 | 2; confidence: number } {
        const text = rawAnswer.trim();
        if (CONFIRMING_PATTERNS.test(text)) return { intent: 'CONFIRMING', tier: 1, confidence: 0.9 };
        if (REFUSING_PATTERNS.test(text)) return { intent: 'REFUSING', tier: 1, confidence: 0.9 };
        if (ASKING_PATTERNS.test(text)) return { intent: 'ASKING', tier: 1, confidence: 0.8 };
        return { intent: 'ANSWERING', tier: 1, confidence: 0.8 };
    }

    isConfirmingResponse(rawAnswer: string): boolean {
        return CONFIRMING_PATTERNS.test(rawAnswer.trim());
    }

    async classify(
        rawAnswer: string,
        previousResponse?: string
    ): Promise<{ intent: IntentResult['intent']; tier: 1 | 2; confidence: number }> {
        const rulesResult = this.classifyRulesOnly(rawAnswer);
        if (rulesResult.confidence >= 0.9) return rulesResult;

        try {
            const prompt = [
                'Classify the intent of this response in a cognitive assessment call.',
                previousResponse ? `Assessment prompt: "${previousResponse}"` : '',
                `Participant said: "${rawAnswer}"`,
            ].filter(Boolean).join('\n');

            const result = await this.structuredLLM.invoke([{ role: 'user', content: prompt }]) as IntentResult;
            return { intent: result.intent, tier: 2, confidence: result.confidence };
        } catch {
            return rulesResult;
        }
    }
}

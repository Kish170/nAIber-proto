import nlp from 'compromise';
import { ChatOpenAI } from '@langchain/openai';
import {
    ScaleExtractionSchema,
    BooleanExtractionSchema,
    type ScaleExtractionResult,
    type BooleanExtractionResult
} from './ExtractionSchemas.js';
import type { QuestionData, ScaleQuestionData, BooleanQuestionData } from '../questions/Question.js';

export type ExtractionMethod = 'rule-based' | 'structured-llm' | 'not-extractable';

export interface ExtractionResult {
    value: string;
    confidence: number;
    method: ExtractionMethod;
}

const WORD_TO_NUMBER: Record<string, number> = {
    one: 1, two: 2, three: 3, four: 4, five: 5,
    six: 6, seven: 7, eight: 8, nine: 9, ten: 10
};

const AFFIRMATIVE = /\b(yes|yeah|yep|yup|sure|absolutely|definitely|correct|right|of course|certainly|indeed|i did|i have|i've|i took|taken)\b/i;
const NEGATIVE = /\b(no|nope|nah|never|not really|haven'?t|didn'?t|have not|did not|not yet|i missed|i skipped|i forgot)\b/i;

export class AnswerExtractor {
    private scaleLLM: ReturnType<ChatOpenAI['withStructuredOutput']>;
    private booleanLLM: ReturnType<ChatOpenAI['withStructuredOutput']>;

    constructor(chatModel: ChatOpenAI) {
        this.scaleLLM = chatModel.withStructuredOutput(ScaleExtractionSchema);
        this.booleanLLM = chatModel.withStructuredOutput(BooleanExtractionSchema);
    }

    async extract(question: QuestionData, rawAnswer: string): Promise<ExtractionResult> {
        const trimmed = rawAnswer.trim();

        if (question.type === 'scale') return this.extractScale(question, trimmed);
        if (question.type === 'boolean') return this.extractBoolean(question, trimmed);

        return { value: trimmed, confidence: 1.0, method: 'rule-based' };
    }

    private async extractScale(question: ScaleQuestionData, trimmed: string): Promise<ExtractionResult> {
        const { min, max } = question;

        const direct = parseInt(trimmed, 10);
        if (!isNaN(direct) && direct >= min && direct <= max) {
            return { value: String(direct), confidence: 1.0, method: 'rule-based' };
        }

        const digitMatch = trimmed.match(/\b(10|[1-9])\b/);
        if (digitMatch) {
            const n = parseInt(digitMatch[1], 10);
            if (n >= min && n <= max) {
                return { value: String(n), confidence: 0.95, method: 'rule-based' };
            }
        }

        const lower = trimmed.toLowerCase();
        for (const [word, num] of Object.entries(WORD_TO_NUMBER)) {
            if (lower.includes(word) && num >= min && num <= max) {
                return { value: String(num), confidence: 0.9, method: 'rule-based' };
            }
        }

        try {
            const result = await this.scaleLLM.invoke([
                {
                    role: 'system',
                    content:
                        `The user was asked: "${question.question}"\n` +
                        `Expected: an integer between ${min} and ${max}.\n` +
                        `User responded: "${trimmed}"\n` +
                        `Extract the numeric value they intended.`
                }
            ]) as ScaleExtractionResult;

            if (result.cannot_extract || result.value === null) {
                return { value: '', confidence: 0, method: 'not-extractable' };
            }

            console.log(`[AnswerExtractor] scale LLM: ${result.value} (confidence: ${result.confidence})`);
            return { value: String(result.value), confidence: result.confidence, method: 'structured-llm' };
        } catch {
            return { value: '', confidence: 0, method: 'not-extractable' };
        }
    }

    private async extractBoolean(question: BooleanQuestionData, trimmed: string): Promise<ExtractionResult> {
        const doc = nlp(trimmed);
        const hasExplicitNegation =
            doc.match('not').length > 0 ||
            doc.match('never').length > 0 ||
            doc.match('#Verb not').length > 0;

        if (!hasExplicitNegation && AFFIRMATIVE.test(trimmed)) {
            return { value: 'yes', confidence: 1.0, method: 'rule-based' };
        }

        if (NEGATIVE.test(trimmed) || hasExplicitNegation) {
            return { value: 'no', confidence: 1.0, method: 'rule-based' };
        }

        try {
            const result = await this.booleanLLM.invoke([
                {
                    role: 'system',
                    content:
                        `The user was asked: "${question.question}"\n` +
                        `Expected: yes or no.\n` +
                        `User responded: "${trimmed}"\n` +
                        `Determine whether their answer means yes or no.`
                }
            ]) as BooleanExtractionResult;

            if (result.cannot_extract || result.value === null) {
                return { value: '', confidence: 0, method: 'not-extractable' };
            }

            console.log(`[AnswerExtractor] boolean LLM: ${result.value} (confidence: ${result.confidence})`);
            return { value: result.value, confidence: result.confidence, method: 'structured-llm' };
        } catch {
            return { value: '', confidence: 0, method: 'not-extractable' };
        }
    }
}
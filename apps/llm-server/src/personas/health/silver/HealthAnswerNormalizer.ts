import { ChatOpenAI } from '@langchain/openai';
import {
    ConditionNormalisationSchema,
    SymptomNormalisationSchema,
    GeneralNotesSchema,
    type ConditionNormalisationResult,
    type SymptomNormalisationResult,
    type GeneralNotesResult
} from '../validation/ExtractionSchemas.js';

export class HealthAnswerNormalizer {
    private conditionLLM: ReturnType<ChatOpenAI['withStructuredOutput']>;
    private symptomLLM: ReturnType<ChatOpenAI['withStructuredOutput']>;
    private notesLLM: ReturnType<ChatOpenAI['withStructuredOutput']>;

    constructor(chatModel: ChatOpenAI) {
        this.conditionLLM = chatModel.withStructuredOutput(ConditionNormalisationSchema);
        this.symptomLLM = chatModel.withStructuredOutput(SymptomNormalisationSchema);
        this.notesLLM = chatModel.withStructuredOutput(GeneralNotesSchema);
    }

    async normalizeConditionNote(
        conditionName: string,
        rawAnswer: string
    ): Promise<ConditionNormalisationResult> {
        try {
            const result = await this.conditionLLM.invoke([
                {
                    role: 'system',
                    content:
                        `An elderly patient was asked about their ${conditionName} condition.\n` +
                        `Their response: "${rawAnswer}"\n` +
                        `Extract structured health insights from their answer.`
                }
            ]) as ConditionNormalisationResult;

            console.log(`[HealthAnswerNormalizer] condition "${conditionName}": severity=${result.severity}, change=${result.change_from_baseline}`);
            return result;
        } catch (err) {
            console.warn(`[HealthAnswerNormalizer] condition normalisation failed for "${conditionName}":`, err);
            return {
                symptoms_mentioned: [],
                severity: 'unknown',
                change_from_baseline: 'unknown',
                notable_flags: []
            };
        }
    }

    async normalizeSymptomReport(rawAnswer: string): Promise<SymptomNormalisationResult> {
        try {
            const result = await this.symptomLLM.invoke([
                {
                    role: 'system',
                    content:
                        `An elderly patient described their physical symptoms.\n` +
                        `Their response: "${rawAnswer}"\n` +
                        `Extract distinct symptoms, body parts referenced, and severity.`
                }
            ]) as SymptomNormalisationResult;

            console.log(`[HealthAnswerNormalizer] symptoms: ${result.symptoms.length} found, severity=${result.severity}`);
            return result;
        } catch (err) {
            console.warn('[HealthAnswerNormalizer] symptom normalisation failed:', err);
            return { symptoms: [], body_parts: [], severity: 'unknown', no_symptoms: false };
        }
    }

    async normalizeGeneralNotes(rawAnswer: string): Promise<GeneralNotesResult> {
        try {
            const result = await this.notesLLM.invoke([
                {
                    role: 'system',
                    content:
                        `An elderly patient shared any final health notes.\n` +
                        `Their response: "${rawAnswer}"\n` +
                        `Extract any health concerns or positive updates they mentioned.`
                }
            ]) as GeneralNotesResult;

            console.log(`[HealthAnswerNormalizer] notes: ${result.concerns.length} concerns, ${result.positives.length} positives`);
            return result;
        } catch (err) {
            console.warn('[HealthAnswerNormalizer] general notes normalisation failed:', err);
            return { concerns: [], positives: [], no_additional_notes: true };
        }
    }
}
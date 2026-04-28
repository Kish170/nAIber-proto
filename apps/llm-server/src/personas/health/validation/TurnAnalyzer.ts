import { ChatOpenAI } from '@langchain/openai';
import { TurnAnalysisSchema, TurnAnalysisResult, OpeningClassificationSchema } from './ExtractionSchemas.js';
import type { DynamicQuestion, OpeningPhase } from '../HealthCheckState.js';

export class TurnAnalyzer {
    private structuredLLM: ReturnType<ChatOpenAI['withStructuredOutput']>;
    private structuredOpeningLLM: ReturnType<ChatOpenAI['withStructuredOutput']>;

    constructor(chatModel: ChatOpenAI) {
        this.structuredLLM = chatModel.withStructuredOutput(TurnAnalysisSchema);
        this.structuredOpeningLLM = chatModel.withStructuredOutput(OpeningClassificationSchema);
    }

    async analyzeOpeningSentiment(
        rawAnswer: string,
        previousResponse?: string
    ): Promise<'WELL' | 'POORLY' | 'AMBIGUOUS'> {
        const prompt = [
            'You are assessing a single response in an elderly health check-in phone call.',
            previousResponse ? `Agent said: "${previousResponse}"` : '',
            `Elder said: "${rawAnswer}"`,
            '',
            'Classify how the elder says they are feeling:',
            '- WELL: they indicate they are doing fine, good, okay, not bad, alright, pretty good, well',
            '- POORLY: they indicate distress, pain, tiredness, illness, feeling bad, not great, terrible, sick',
            '- AMBIGUOUS: truly unclear — the response does not indicate their wellbeing at all',
            '',
            'Lean toward WELL or POORLY. Only use AMBIGUOUS if there is genuinely no sentiment signal.',
        ].filter(Boolean).join('\n');

        try {
            const result = await this.structuredOpeningLLM.invoke([{ role: 'user', content: prompt }]) as { sentiment: 'WELL' | 'POORLY' | 'AMBIGUOUS'; confidence: number };
            return result.sentiment;
        } catch {
            return 'AMBIGUOUS';
        }
    }

    async analyze(
        rawAnswer: string,
        options: {
            question?: DynamicQuestion | null;
            openingPhase?: OpeningPhase;
            subQuestionCount?: number;
            previousResponse?: string;
            pendingQuestions?: DynamicQuestion[];
        } = {}
    ): Promise<TurnAnalysisResult> {
        const {
            question,
            openingPhase = 'conversation',
            subQuestionCount = 0,
            previousResponse = '',
            pendingQuestions = []
        } = options;
        const inConversation = openingPhase === 'conversation';

        const lines: string[] = [
            'You are analyzing a single turn in an elderly health check-in phone call.',
            '',
        ];

        if (inConversation && question) {
            lines.push(`Current topic: ${question.topic}`);
            lines.push(`Question type: ${question.questionType} (scale=1-10 number, boolean=yes/no, text=free)`);
            lines.push(`Question: "${question.questionText}"`);
            lines.push(`Sub-questions already asked: ${subQuestionCount}`);
        } else {
            lines.push(`Opening phase: ${openingPhase}`);
        }

        if (previousResponse) lines.push(`Previous agent message: "${previousResponse}"`);
        lines.push(`Elder said: "${rawAnswer}"`);
        lines.push('');
        lines.push('Classify this response:');
        lines.push('- intent: ANSWERING (giving information), REFUSING (declining to answer), ASKING (asking a question back)');
        lines.push('- isOnTopic: true unless the elder goes completely off-health-topic (family gossip, weather, sports, news, unrelated stories).');
        lines.push('  ANY health-related content (symptoms, pain, medication, sleep, mood, mobility, appetite) is ALWAYS on-topic.');
        lines.push('  Even if the elder mentions a health issue that is different from the specific question, still mark isOnTopic=true — the health info is relevant.');
        lines.push('- readyToAdvance: true if we should close this topic window and move on. Rules:');
        lines.push('  * Always true when intent=REFUSING.');
        lines.push('  * True when question type is "scale" AND the answer contains a clear number (e.g. "eight", "7", "ten out of ten").');
        lines.push('  * True when question type is "boolean" AND the answer is a clear yes or no.');
        lines.push('  * True when the elder uses explicit closure: "nothing else", "move on", "that\'s all", "I\'m done", "next", "no more", "let\'s continue".');
        lines.push('  * True when engagement=low AND subQuestionCount >= 1.');
        lines.push('  * False otherwise.');
        lines.push('- sentiment: positive, neutral, or negative overall tone.');
        lines.push('- engagement: high (elaborating or wants to say more) or low (brief, minimal, done).');

        if (openingPhase !== 'conversation') {
            lines.push('- openingSentiment: WELL (feeling fine/good), POORLY (distress, pain, illness), AMBIGUOUS (unclear). Required for opening phases.');
        }
        if (openingPhase === 'poorly_probing') {
            lines.push('- isHealthRelated: true if the concern is health-related (symptoms, medications, pain, sleep, mood, mobility, appetite).');
            lines.push('- suggestedTopic: best slot: SYMPTOM|MEDICATION_SIDE_EFFECT|SLEEP|PAIN|MOOD|MOBILITY|APPETITE|COGNITION_SELF_REPORT|OTHER_HEALTH, or null.');
        }

        if (inConversation) {
            lines.push('');
            lines.push('If isOnTopic=false, also classify the tangent:');
            lines.push('- tangentAction:');
            lines.push('  * "redirect" — not health-related (weather, family, news, hobbies, etc.)');

            if (pendingQuestions.length > 0) {
                const summary = pendingQuestions
                    .map(q => `  [id: ${q.id}] (${q.topic}) "${q.questionText}"`)
                    .join('\n');
                lines.push('  * "merge_into_pending" — an existing pending question already covers what they raised. Provide tangentTargetQuestionId.');
                lines.push(`  Existing pending questions:\n${summary}`);
            } else {
                lines.push('  * "merge_into_pending" — (no pending questions to merge into)');
            }

            lines.push('  * "create_new_pending" — ONLY if the elder explicitly raises a clearly new health concern (a named symptom, condition, or medication issue) that is NOT already covered by any pending question. Do NOT use this for vague health mentions or general context.');
            lines.push('- tangentTargetQuestionId: ID from the pending list to merge into, or null.');
            lines.push('- tangentNewTopic: taxonomy slot for new question, or null.');
            lines.push('- tangentNewQuestionText: question text for new question, or null.');
            lines.push('If isOnTopic=true, leave all tangent fields unset.');
        }

        const prompt = lines.join('\n');

        try {
            const result = await this.structuredLLM.invoke([{ role: 'user', content: prompt }]);
            return result as TurnAnalysisResult;
        } catch {
            return {
                intent: 'ANSWERING',
                isOnTopic: true,
                readyToAdvance: false,
                sentiment: 'neutral',
                engagement: 'high',
            };
        }
    }
}
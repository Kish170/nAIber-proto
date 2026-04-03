import { ChatOpenAI } from '@langchain/openai';
import { FollowUpEvaluationSchema, type FollowUpEvaluationResult } from './ExtractionSchemas.js';
import type { QuestionData } from '../questions/Question.js';
import type { AnswerSignals } from './SignalDetector.js';

export interface FollowUpResult {
    question: string;
    reason: string;
}

export class FollowUpEvaluator {
    private structuredLLM: ReturnType<ChatOpenAI['withStructuredOutput']>;

    constructor(chatModel: ChatOpenAI) {
        this.structuredLLM = chatModel.withStructuredOutput(FollowUpEvaluationSchema);
    }

    async evaluate(
        question: QuestionData,
        rawAnswer: string,
        extractedValue: string,
        signals: AnswerSignals
    ): Promise<FollowUpResult | null> {
        try {
            const signalContext = [
                signals.uncertain    ? 'uncertain phrasing'    : null,
                signals.partial      ? 'partial answer'        : null,
                signals.sentiment === 'negative' ? 'negative sentiment' : null,
                signals.engagement === 'low'     ? 'brief / low engagement' : null,
            ].filter(Boolean).join(', ');

            const result = await this.structuredLLM.invoke([
                {
                    role: 'system',
                    content:
                        `You are evaluating a health check-in response to decide whether a brief follow-up question would capture more useful detail for the patient's health record.\n\n` +
                        `This is a note-taking session only — you do NOT diagnose, advise, or interpret clinical severity.\n\n` +
                        `CONTEXT:\n` +
                        `Question type: ${question.type}\n` +
                        `Question asked: "${question.question}"\n` +
                        `Patient answered: "${rawAnswer}"\n` +
                        `Extracted value: "${extractedValue}"\n` +
                        (signalContext ? `Answer signals: ${signalContext}\n` : '') +
                        `\nWHEN TO FOLLOW UP:\n` +
                        `- Scale question with a notably low score (roughly ≤5/10)\n` +
                        `- Symptoms, discomfort, or pain were mentioned\n` +
                        `- A health condition appears to be worsening or is unclear\n` +
                        `- Medication was not taken\n` +
                        `- The answer is vague, brief, or uncertain for a question that expected detail\n` +
                        `\nWHEN NOT TO FOLLOW UP:\n` +
                        `- A clear high score (>7/10) with no concerning signals\n` +
                        `- A confident "yes" to medication adherence\n` +
                        `- "No symptoms" stated clearly\n` +
                        `- The answer is already detailed and complete\n` +
                        `\nIF you follow up, generate ONE brief, neutral question (maximum 20 words):\n` +
                        `- Ask what, how long, or when — not why in an intrusive way\n` +
                        `- Do NOT diagnose, reassure, advise, or reference scores as good/bad\n` +
                        `- The goal is to capture more detail for the health record, not to probe emotionally`
                }
            ]) as FollowUpEvaluationResult;

            if (!result.should_follow_up || !result.follow_up_question?.trim()) {
                console.log(`[FollowUpEvaluator] no follow-up — ${result.reason}`);
                return null;
            }

            console.log(`[FollowUpEvaluator] follow-up triggered — ${result.reason}`);
            return { question: result.follow_up_question.trim(), reason: result.reason };
        } catch {
            console.warn('[FollowUpEvaluator] evaluation failed — skipping follow-up');
            return null;
        }
    }
}

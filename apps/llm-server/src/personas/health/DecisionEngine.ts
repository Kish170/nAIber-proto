import { ChatOpenAI } from "@langchain/openai";
import { SystemMessage } from "@langchain/core/messages";
import {
    HealthCheckStateType,
    HealthCheckAnswer,
    InterpretationResult,
    AgentDecision
} from "./HealthCheckState.js";
import { QuestionData } from "./questions/index.js";
import type { AnswerSignals } from "./validation/SignalDetector.js";
import type { ExtractionResult } from "./validation/AnswerExtractor.js";

const NEGATIVE_CONDITION_TERMS = /\b(worse|worsening|pain|painful|bad|terrible|difficult|struggle|struggling|hard|concerning|deteriorating|flaring|elevated|higher|increased|going up|gone up|not great|not good|off)\b/i;
const POSITIVE_CONDITION_TERMS = /\b(fine|good|great|stable|normal|okay|ok|better|same as usual|no change|unchanged|under control|managed)\b/i;
const AFFIRMATIVE_CONFIRM = /\b(yes|yeah|yep|correct|right|exactly|that's right|uh-huh|sure)\b/i;

export interface DecisionResult {
    decision: AgentDecision;
    stateUpdates: Record<string, unknown>;
}

export class DecisionEngine {
    private llm: ChatOpenAI;

    constructor(chatModel: ChatOpenAI) {
        this.llm = chatModel;
    }

    async evaluate(state: HealthCheckStateType, interpretation: InterpretationResult): Promise<DecisionResult> {
        const currentQuestion = state.healthCheckQuestions[state.currentQuestionIndex];
        if (!currentQuestion) return this.skip(state, 'No current question');

        const { intent, intentTier, extraction, signals } = interpretation;

        if (state.currentDecision?.action === 'wrap_up') {
            return this.handleWrapUpResponse(state, interpretation);
        }

        if (intent === 'CONFIRMING' && state.currentDecision?.action === 'retry') {
            console.log('[DecisionEngine] Post-retry CONFIRMING — re-asking question');
            return {
                decision: { action: 'retry', extractedSlots: {}, confidence: 0, reasoning: 'Post-retry confirmation — re-presenting question' },
                stateUpdates: { pendingClarification: false, clarificationContext: '' },
            };
        }

        if (intent === 'REFUSING') return this.handleRefusing(state, intentTier);
        if (intent === 'ASKING')   return this.handleAsking(state);

        if (!extraction || extraction.method === 'not-extractable') {
            return this.handleExtractionFailed(state);
        }

        const slot = currentQuestion.slot ?? currentQuestion.category;
        const extractedSlots = { [slot]: this.parseSlotValue(slot, extraction.value) };

        if (this.isConfirmationResponse(state, extraction)) {
            return this.handleConfirmationResponse(state, currentQuestion);
        }

        if (
            currentQuestion.type === 'scale' &&
            state.currentDecision?.action !== 'confirm' &&
            this.lacksExplicitNumber(state.rawAnswer) &&
            state.questionAttempts < 2
        ) {
            console.log('[DecisionEngine] Scale question — no explicit number → retry');
            return {
                decision: { action: 'retry', extractedSlots: {}, confidence: 0, reasoning: 'Scale question — patient did not give an explicit number' },
                stateUpdates: { questionAttempts: state.questionAttempts + 1, pendingClarification: false }
            };
        }

        if (this.shouldConfirm(state, extraction)) {
            return this.handleLowConfidence(state, extraction, extractedSlots);
        }

        return this.handleSuccessfulExtraction(state, currentQuestion, extraction, extractedSlots, signals);
    }

    private handleRefusing(state: HealthCheckStateType, intentTier: number): DecisionResult {
        console.log('[DecisionEngine] REFUSING → skip');
        return this.skip(state, `User refused to answer (tier ${intentTier})`, 'refused');
    }

    private handleAsking(state: HealthCheckStateType): DecisionResult {
        console.log('[DecisionEngine] ASKING → retry with clarification');
        return {
            decision: {
                action: 'retry',
                extractedSlots: {},
                confidence: 0,
                reasoning: 'User is asking a clarifying question'
            },
            stateUpdates: {
                pendingClarification: true,
                clarificationContext: state.rawAnswer,
                questionAttempts: state.questionAttempts + 1
            }
        };
    }

    private handleExtractionFailed(state: HealthCheckStateType): DecisionResult {
        if (state.questionAttempts < 2) {
            console.log(`[DecisionEngine] not-extractable → retry (attempt ${state.questionAttempts + 1}/2)`);
            return {
                decision: {
                    action: 'retry',
                    extractedSlots: {},
                    confidence: 0,
                    reasoning: `Could not extract a valid answer. Retry attempt ${state.questionAttempts + 1}/2`
                },
                stateUpdates: {
                    questionAttempts: state.questionAttempts + 1,
                    pendingClarification: false
                }
            };
        }
        return this.skip(state, 'Could not extract a valid answer after 2 retries');
    }

    private async handleConfirmationResponse(state: HealthCheckStateType, currentQuestion: QuestionData): Promise<DecisionResult> {
        const proposedSlots = state.currentDecision!.extractedSlots;
        const proposedValue = String(Object.values(proposedSlots)[0] ?? '');
        console.log('[DecisionEngine] confirmed proposed value');

        const confirmedExtraction: ExtractionResult = {
            value: proposedValue,
            confidence: 1.0,
            method: 'rule-based',
        };
        const signals = state.lastInterpretation?.signals ?? { uncertain: false, partial: false, correction: false, offTopic: false, sentiment: 'neutral', engagement: 'high' };
        return this.handleSuccessfulExtraction(state, currentQuestion, confirmedExtraction, proposedSlots, signals);
    }

    private handleLowConfidence(
        state: HealthCheckStateType,
        extraction: ExtractionResult,
        extractedSlots: Record<string, string | number | boolean | null>
    ): DecisionResult {
        const confirmQuestion = `Just to confirm — I understood your answer as "${extraction.value}". Is that right?`;
        console.log(`[DecisionEngine] low confidence (${extraction.confidence.toFixed(2)}) → confirm`);
        return {
            decision: {
                action: 'confirm',
                extractedSlots,
                confidence: extraction.confidence,
                confirmQuestion,
                reasoning: `LLM confidence ${extraction.confidence.toFixed(2)} < 0.8, requesting confirmation`
            },
            stateUpdates: {
                questionAttempts: state.questionAttempts + 1,
                pendingClarification: false
            }
        };
    }

    private async handleSuccessfulExtraction(
        state: HealthCheckStateType,
        currentQuestion: QuestionData,
        extraction: ExtractionResult,
        extractedSlots: Record<string, string | number | boolean | null>,
        signals: AnswerSignals
    ): Promise<DecisionResult> {
        const isFollowUpQuestion = currentQuestion.id.startsWith('follow_up_');
        const canFollowUp = this.canFollowUp(state, isFollowUpQuestion);

        if (canFollowUp) {
            const followupReason = this.detectFollowUpTrigger(currentQuestion.slot ?? currentQuestion.category, extraction.value, signals);
            if (followupReason) {
                if (state.currentQuestionFollowUpCount === 0) {
                    return this.buildFollowUpResult(state, currentQuestion, extraction, extractedSlots, followupReason);
                } else {
                    return this.buildWrapUpResult(state, extraction, extractedSlots, followupReason, true);
                }
            }
        }

        if (!isFollowUpQuestion && currentQuestion.type !== 'boolean') {
            return this.buildWrapUpResult(state, extraction, extractedSlots, 'transition check', false);
        }

        console.log(`[DecisionEngine] next (${extraction.method}, confidence: ${extraction.confidence.toFixed(2)})`);
        return {
            decision: {
                action: 'next',
                extractedSlots,
                confidence: extraction.confidence,
                reasoning: `Answer accepted via ${extraction.method} (confidence: ${extraction.confidence.toFixed(2)})`
            },
            stateUpdates: {
                ...this.recordAnswer(state, extraction.value, true, extraction.method, extraction.confidence),
                currentQuestionFollowUpCount: isFollowUpQuestion ? 0 : state.currentQuestionFollowUpCount
            }
        };
    }

    private canFollowUp(state: HealthCheckStateType, isFollowUpQuestion: boolean): boolean {
        if (isFollowUpQuestion) return false;
        const alreadyHasFollowUp = state.healthCheckQuestions.some(
            q => q.id.startsWith(`follow_up_${state.currentQuestionIndex}_`)
        );
        return !alreadyHasFollowUp;
    }

    private detectFollowUpTrigger(slot: string, value: string, signals: AnswerSignals): string | null {
        if (signals.uncertain) return 'uncertain signal detected';
        if (signals.partial)   return 'partial answer detected';

        if (slot === 'wellbeing_score' || slot === 'sleep_score') {
            const n = parseInt(value, 10);
            if (!isNaN(n) && n <= 5) return `low ${slot.replace('_score', '').replace('_', ' ')} score (${n}/10)`;
        }

        if (slot === 'condition_status') {
            if (NEGATIVE_CONDITION_TERMS.test(value)) return 'negative condition indicators reported';
            if (!POSITIVE_CONDITION_TERMS.test(value)) return 'condition status may need more detail';
        }

        if (slot === 'physical_symptoms') {
            const noSymptoms = /\b(none|nothing|no symptoms?|all good|feeling fine|feeling good|nothing to report)\b/i;
            if (!noSymptoms.test(value)) return 'physical symptoms reported';
        }

        if (slot === 'medication_adherence' && value === 'no') {
            return 'medication not taken today';
        }

        return null;
    }

    private async buildFollowUpResult(
        state: HealthCheckStateType,
        currentQuestion: QuestionData,
        extraction: ExtractionResult,
        extractedSlots: Record<string, string | number | boolean | null>,
        reason: string
    ): Promise<DecisionResult> {
        const followupText = await this.generateFollowUpText(currentQuestion, extraction.value, reason);
        if (!followupText) {
            console.warn('[DecisionEngine] follow-up generation failed — proceeding to next');
            return {
                decision: {
                    action: 'next',
                    extractedSlots,
                    confidence: extraction.confidence,
                    reasoning: `Follow-up generation failed for: ${reason}. Proceeding.`
                },
                stateUpdates: {
                    ...this.recordAnswer(state, extraction.value, true, extraction.method, extraction.confidence),
                    currentQuestionFollowUpCount: state.currentQuestionFollowUpCount
                }
            };
        }

        const recordedState = this.recordAnswer(state, extraction.value, true, extraction.method, extraction.confidence);
        const followUpData = this.buildFollowUpQuestion(currentQuestion, followupText, state.currentQuestionIndex);

        const newQuestions = [...state.healthCheckQuestions];
        newQuestions.splice(recordedState.currentQuestionIndex, 0, followUpData);

        console.log(`[DecisionEngine] followup → ${reason}`);
        return {
            decision: {
                action: 'followup',
                extractedSlots,
                confidence: extraction.confidence,
                followupQuestion: followupText,
                reasoning: `Follow-up triggered: ${reason}`
            },
            stateUpdates: {
                ...recordedState,
                healthCheckQuestions: newQuestions,
                currentQuestionFollowUpCount: state.currentQuestionFollowUpCount + 1
            }
        };
    }

    private buildWrapUpResult(
        state: HealthCheckStateType,
        extraction: ExtractionResult,
        extractedSlots: Record<string, string | number | boolean | null>,
        reason: string,
        incrementCount: boolean = true
    ): DecisionResult {
        console.log(`[DecisionEngine] wrap_up → ${reason}`);
        return {
            decision: {
                action: 'wrap_up',
                extractedSlots,
                confidence: extraction.confidence,
                reasoning: reason
            },
            stateUpdates: {
                currentQuestionFollowUpCount: incrementCount
                    ? state.currentQuestionFollowUpCount + 1
                    : state.currentQuestionFollowUpCount,
            },
        };
    }

    private async handleWrapUpResponse(state: HealthCheckStateType, interpretation: InterpretationResult): Promise<DecisionResult> {
        const { intent, signals } = interpretation;
        const currentQuestion = state.healthCheckQuestions[state.currentQuestionIndex];
        const proposedSlots = state.currentDecision?.extractedSlots ?? {};
        const proposedValue = String(Object.values(proposedSlots)[0] ?? '');

        const isDone = intent === 'REFUSING' || intent === 'CONFIRMING' || intent === 'ASKING' ||
            (intent === 'ANSWERING' && signals.engagement === 'low');

        if (!isDone && intent === 'ANSWERING' && currentQuestion) {
            const followupText = await this.generateFollowUpText(currentQuestion, state.rawAnswer, 'user continued sharing after wrap-up');
            if (followupText) {
                const recordedState = this.recordAnswer(state, proposedValue, true, 'rule-based', 1.0);
                const followUpData = this.buildFollowUpQuestion(currentQuestion, followupText, state.currentQuestionIndex);
                const newQuestions = [...state.healthCheckQuestions];
                newQuestions.splice(recordedState.currentQuestionIndex, 0, followUpData);
                console.log('[DecisionEngine] wrap_up → user has more to say, generating follow-up');
                return {
                    decision: { action: 'followup', extractedSlots: proposedSlots, confidence: 1.0, followupQuestion: followupText, reasoning: 'User continued sharing after wrap-up' },
                    stateUpdates: { ...recordedState, healthCheckQuestions: newQuestions, currentQuestionFollowUpCount: state.currentQuestionFollowUpCount + 1 },
                };
            }
        }

        console.log('[DecisionEngine] wrap_up resolved — advancing to next question');
        return {
            decision: { action: 'next', extractedSlots: proposedSlots, confidence: 1.0, reasoning: 'User indicated they are done with this topic' },
            stateUpdates: { ...this.recordAnswer(state, proposedValue, true, 'rule-based', 1.0), currentQuestionFollowUpCount: 0 },
        };
    }

    private async generateFollowUpText(question: QuestionData, answer: string, reason: string): Promise<string | undefined> {
        try {
            const response = await this.llm.invoke([
                new SystemMessage(
                    `You are conducting a health check-in with an elderly patient.\n` +
                    `The question was: "${question.question}"\n` +
                    `The patient answered: "${answer}"\n` +
                    `Reason for follow-up: ${reason}\n\n` +
                    `Generate one brief, empathetic follow-up question to gather more useful health context.\n` +
                    `Keep it under 20 words. Return ONLY the question text — no explanation, no quotes.`
                )
            ]);
            return String(response.content).trim() || undefined;
        } catch {
            return undefined;
        }
    }

    private buildFollowUpQuestion(parent: QuestionData, questionText: string, parentIndex: number): QuestionData {
        return {
            id: `follow_up_${parentIndex}_${Date.now()}`,
            question: questionText,
            type: 'text',
            category: parent.category,
            slot: 'general_notes',
            context: `Follow-up to: ${parent.question}`,
            validation: 'Free text response',
            optional: true,
            relatedTo: parent.relatedTo
        } as QuestionData;
    }

    private isConfirmationResponse(state: HealthCheckStateType, extraction: ExtractionResult): boolean {
        return (
            state.currentDecision?.action === 'confirm' &&
            AFFIRMATIVE_CONFIRM.test(state.rawAnswer.trim()) &&
            extraction.method === 'not-extractable'
        );
    }

    private shouldConfirm(state: HealthCheckStateType, extraction: ExtractionResult): boolean {
        return (
            state.questionAttempts === 0 &&
            state.currentDecision?.action !== 'confirm' &&
            extraction.method === 'structured-llm' &&
            extraction.confidence < 0.8
        );
    }

    recordAnswer(
        state: HealthCheckStateType,
        validatedAnswer: string,
        isValid: boolean,
        extractionMethod: HealthCheckAnswer['extractionMethod'],
        confidence: number
    ) {
        const currentQuestion = state.healthCheckQuestions[state.currentQuestionIndex];
        const answerRecord: HealthCheckAnswer = {
            questionIndex: state.currentQuestionIndex,
            question: currentQuestion,
            rawAnswer: state.rawAnswer,
            validatedAnswer,
            isValid,
            attemptCount: state.questionAttempts + 1,
            extractionMethod,
            confidence
        };
        return {
            isValid,
            validatedAnswer,
            healthCheckAnswers: [...state.healthCheckAnswers, answerRecord],
            currentQuestionIndex: state.currentQuestionIndex + 1,
            questionAttempts: 0,
            lastValidationError: ""
        };
    }

    skipQuestion(state: HealthCheckStateType, skipReason?: 'refused' | 'exhausted') {
        const currentQuestion = state.healthCheckQuestions[state.currentQuestionIndex];
        const answerRecord: HealthCheckAnswer = {
            questionIndex: state.currentQuestionIndex,
            question: currentQuestion,
            rawAnswer: state.rawAnswer,
            validatedAnswer: 'not answered',
            isValid: false,
            attemptCount: state.questionAttempts + 1,
            extractionMethod: 'not-extractable',
            confidence: 0,
            ...(skipReason && { skipReason }),
        };
        return {
            isValid: false,
            validatedAnswer: 'not answered',
            healthCheckAnswers: [...state.healthCheckAnswers, answerRecord],
            currentQuestionIndex: state.currentQuestionIndex + 1,
            questionAttempts: 0,
            currentQuestionFollowUpCount: 0,
            lastValidationError: ""
        };
    }

    private skip(state: HealthCheckStateType, reason: string, skipReason?: 'refused' | 'exhausted'): DecisionResult {
        console.warn(`[DecisionEngine] skip — ${reason}`);
        return {
            decision: { action: 'skip', extractedSlots: {}, confidence: 0, reasoning: reason },
            stateUpdates: this.skipQuestion(state, skipReason)
        };
    }

    private parseSlotValue(slot: string, rawValue: string): string | number | boolean | null {
        if (slot === 'wellbeing_score' || slot === 'sleep_score') {
            const n = parseInt(rawValue, 10);
            return isNaN(n) ? null : n;
        }
        if (slot === 'medication_adherence') {
            if (rawValue === 'yes') return true;
            if (rawValue === 'no')  return false;
            return null;
        }
        return rawValue || null;
    }

    private lacksExplicitNumber(rawAnswer: string): boolean {
        return !/\b([1-9]|10)\b/.test(rawAnswer);
    }
}
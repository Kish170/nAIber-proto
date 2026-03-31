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

const MAX_RETRY_ATTEMPTS = 2;
const NEGATIVE_CONDITION_TERMS = /\b(worse|pain|bad|terrible|difficult|struggle|struggling|hard|concerning|deteriorating|flaring)\b/i;
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

        if (this.shouldConfirm(state, extraction)) {
            return this.handleLowConfidence(state, extraction, extractedSlots);
        }

        return this.handleSuccessfulExtraction(state, currentQuestion, extraction, extractedSlots, signals);
    }

    private handleRefusing(state: HealthCheckStateType, intentTier: number): DecisionResult {
        console.log('[DecisionEngine] REFUSING → skip');
        return this.skip(state, `User refused to answer (tier ${intentTier})`);
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
        if (state.questionAttempts < MAX_RETRY_ATTEMPTS - 1) {
            console.log(`[DecisionEngine] not-extractable → retry ${state.questionAttempts + 1}/${MAX_RETRY_ATTEMPTS}`);
            return {
                decision: {
                    action: 'retry',
                    extractedSlots: {},
                    confidence: 0,
                    reasoning: `Could not extract a valid answer. Retry ${state.questionAttempts + 1}/${MAX_RETRY_ATTEMPTS}`
                },
                stateUpdates: {
                    questionAttempts: state.questionAttempts + 1,
                    pendingClarification: false
                }
            };
        }
        return this.skip(state, 'Max retry attempts reached after extraction failure');
    }

    private handleConfirmationResponse(state: HealthCheckStateType, currentQuestion: QuestionData): DecisionResult {
        const proposedSlots = state.currentDecision!.extractedSlots;
        const proposedValue = String(Object.values(proposedSlots)[0] ?? '');
        const isFollowUp = currentQuestion.id.startsWith('follow_up_');
        console.log('[DecisionEngine] confirmed proposed value');
        return {
            decision: {
                action: 'next',
                extractedSlots: proposedSlots,
                confidence: 1.0,
                reasoning: 'User confirmed the proposed value'
            },
            stateUpdates: {
                ...this.recordAnswer(state, proposedValue, true, 'rule-based', 1.0),
                currentQuestionFollowUpCount: isFollowUp ? 0 : state.currentQuestionFollowUpCount
            }
        };
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
                return this.buildFollowUpResult(state, currentQuestion, extraction, extractedSlots, followupReason);
            }
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
        return !alreadyHasFollowUp && state.currentQuestionFollowUpCount < 1;
    }

    private detectFollowUpTrigger(slot: string, value: string, signals: AnswerSignals): string | null {
        if (signals.uncertain) return 'uncertain signal detected';
        if (signals.partial)   return 'partial answer detected';

        if (slot === 'wellbeing_score' || slot === 'sleep_score') {
            const n = parseInt(value, 10);
            if (!isNaN(n) && n <= 4) return `low ${slot.replace('_', ' ')} (${n}/10)`;
        }

        if (slot === 'condition_status' && NEGATIVE_CONDITION_TERMS.test(value)) {
            return 'negative condition indicators reported';
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

    skipQuestion(state: HealthCheckStateType) {
        const currentQuestion = state.healthCheckQuestions[state.currentQuestionIndex];
        const answerRecord: HealthCheckAnswer = {
            questionIndex: state.currentQuestionIndex,
            question: currentQuestion,
            rawAnswer: state.rawAnswer,
            validatedAnswer: 'not answered',
            isValid: false,
            attemptCount: state.questionAttempts + 1,
            extractionMethod: 'not-extractable',
            confidence: 0
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

    private skip(state: HealthCheckStateType, reason: string): DecisionResult {
        console.warn(`[DecisionEngine] skip — ${reason}`);
        return {
            decision: { action: 'skip', extractedSlots: {}, confidence: 0, reasoning: reason },
            stateUpdates: this.skipQuestion(state)
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
}
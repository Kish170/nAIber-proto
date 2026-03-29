import { StateGraph, END, interrupt } from "@langchain/langgraph";
import { BaseCheckpointSaver } from "@langchain/langgraph-checkpoint";
import { ChatOpenAI } from "@langchain/openai";
import { SystemMessage } from "@langchain/core/messages";
import { HealthCheckState, HealthCheckStateType, HealthCheckAnswer } from "./HealthCheckState.js";
import { HealthCheckHandler } from "./HealthCheckHandler.js";
import { QuestionData } from "./questions/index.js";
import { OpenAIClient } from "@naiber/shared-clients";
import { IntentClassifier } from "./validation/IntentClassifier.js";
import { AnswerExtractor } from "./validation/AnswerExtractor.js";

const MAX_RETRY_ATTEMPTS = 2;
const MAX_FOLLOW_UP_QUESTIONS = 2;

export class HealthCheckGraph {
    private llm: ChatOpenAI;
    private intentClassifier: IntentClassifier;
    private answerExtractor: AnswerExtractor;
    private compiledGraph: any;
    private initialQuestions?: QuestionData[];

    constructor(openAIClient: OpenAIClient, checkpointer: BaseCheckpointSaver, initialQuestions?: QuestionData[]) {
        const chatModel = openAIClient.returnChatModel() as ChatOpenAI;
        this.llm = chatModel;
        this.intentClassifier = new IntentClassifier(chatModel);
        this.answerExtractor = new AnswerExtractor(chatModel);
        this.initialQuestions = initialQuestions;

        const graph: any = new StateGraph(HealthCheckState);

        graph.addNode("orchestrator", this.orchestrate.bind(this));
        graph.addNode("ask_question", this.askQuestion.bind(this));
        graph.addNode("wait_for_answer", this.waitForAnswer.bind(this));
        graph.addNode("validate_answer", this.validateAnswer.bind(this));
        graph.addNode("check_follow_up", this.checkFollowUp.bind(this));
        graph.addNode("finalize", this.finalize.bind(this));

        graph.setEntryPoint("orchestrator");
        graph.addEdge("orchestrator", "ask_question");
        graph.addEdge("ask_question", "wait_for_answer");
        graph.addEdge("wait_for_answer", "validate_answer");
        graph.addConditionalEdges("validate_answer", this.routeAfterValidation.bind(this));
        graph.addConditionalEdges("check_follow_up", this.routeAfterFollowUp.bind(this));
        graph.addEdge("finalize", END);

        this.compiledGraph = graph.compile({ checkpointer });
    }

    private async orchestrate(state: HealthCheckStateType) {
        if (state.healthCheckQuestions?.length > 0) {
            console.log('[HealthCheckGraph] Questions already loaded, skipping re-init');
            return {};
        }

        console.log('[HealthCheckGraph] Initializing health check for userId:', state.userId);

        const questionData = this.initialQuestions
            ? this.initialQuestions
            : (await HealthCheckHandler.initializeHealthCheck(state.userId)).map(q => q.toJSON() as QuestionData);

        console.log('[HealthCheckGraph] Loaded questions:', {
            userId: state.userId,
            totalQuestions: questionData.length
        });

        return {
            healthCheckQuestions: questionData,
            currentQuestionIndex: 0,
            questionAttempts: 0,
            healthCheckAnswers: []
        };
    }

    private async askQuestion(state: HealthCheckStateType) {
        const currentQuestion = state.healthCheckQuestions[state.currentQuestionIndex];

        if (!currentQuestion) {
            console.error('[HealthCheckGraph] No question at index:', state.currentQuestionIndex);
            return {
                response: "I'm sorry, something went wrong. Let's end the health check here.",
                isHealthCheckComplete: true
            };
        }

        const questionContext = this.buildQuestionContext(currentQuestion, state);
        const originalSystemMsg = state.messages.find(m => m instanceof SystemMessage);
        const combinedPrompt = originalSystemMsg
            ? `${originalSystemMsg.content}\n\n${questionContext}`
            : questionContext;

        const conversationHistory = state.messages
            .filter(m => !(m instanceof SystemMessage))
            .slice(-4);

        const messages = [
            new SystemMessage(combinedPrompt),
            ...conversationHistory
        ];

        const response = await this.llm.invoke(messages);

        const content = typeof response.content === 'string'
            ? response.content
            : Array.isArray(response.content)
                ? response.content.map(p => typeof p === 'string' ? p : JSON.stringify(p)).join('')
                : String(response.content);

        console.log('[HealthCheckGraph] Question generated:', {
            questionIndex: state.currentQuestionIndex,
            total: state.healthCheckQuestions.length,
            isRetry: state.questionAttempts > 0,
            isClarification: state.pendingClarification
        });

        return {
            response: content,
            pendingClarification: false,
            clarificationContext: ""
        };
    }

    private waitForAnswer(state: HealthCheckStateType) {
        if (!state.healthCheckQuestions?.length || state.currentQuestionIndex == null) {
            console.error('[HealthCheckGraph] waitForAnswer called with invalid state — completing early');
            return { isHealthCheckComplete: true };
        }

        const userAnswer = interrupt({
            question: state.healthCheckQuestions[state.currentQuestionIndex],
            questionIndex: state.currentQuestionIndex,
            response: state.response
        });

        console.log('[HealthCheckGraph] Received answer:', {
            questionIndex: state.currentQuestionIndex,
            answerPreview: String(userAnswer).substring(0, 100)
        });

        return { rawAnswer: String(userAnswer) };
    }

    private async validateAnswer(state: HealthCheckStateType) {
        const currentQuestion = state.healthCheckQuestions[state.currentQuestionIndex];

        if (!currentQuestion) {
            console.error('[HealthCheckGraph] No question at index for validation:', state.currentQuestionIndex);
            return { isValid: false, validatedAnswer: state.rawAnswer };
        }

        const { intent, tier } = await this.intentClassifier.classify(state.rawAnswer);
        console.log('[HealthCheckGraph] Intent:', { intent, tier, questionIndex: state.currentQuestionIndex });

        if (intent === 'ASKING') {
            return {
                pendingClarification: true,
                clarificationContext: state.rawAnswer,
                lastValidationError: ""
            };
        }

        if (intent === 'REFUSING') {
            console.log('[HealthCheckGraph] User refused question, skipping');
            return this.skipQuestion(state);
        }

        const extraction = await this.answerExtractor.extract(currentQuestion, state.rawAnswer);
        console.log('[HealthCheckGraph] Extraction:', {
            method: extraction.method,
            confidence: extraction.confidence,
            questionIndex: state.currentQuestionIndex
        });

        if (extraction.method !== 'not-extractable') {
            return this.recordAnswer(state, extraction.value, true, extraction.method, extraction.confidence);
        }

        if (state.questionAttempts < MAX_RETRY_ATTEMPTS - 1) {
            return {
                isValid: false,
                validatedAnswer: '',
                questionAttempts: state.questionAttempts + 1,
                lastValidationError: `Please provide a valid ${currentQuestion.type} answer`
            };
        }

        console.warn('[HealthCheckGraph] Max attempts reached, skipping question');
        return this.skipQuestion(state);
    }

    private async checkFollowUp(state: HealthCheckStateType) {
        const allQuestionsAnswered = state.currentQuestionIndex >= state.healthCheckQuestions.length;
        if (!allQuestionsAnswered) {
            return {};
        }

        const followUpCount = state.healthCheckQuestions.filter(q => q.id.startsWith('follow_up_')).length;
        if (followUpCount >= MAX_FOLLOW_UP_QUESTIONS) {
            return {};
        }

        const lastAnswer = state.healthCheckAnswers[state.healthCheckAnswers.length - 1];
        if (!lastAnswer?.isValid) {
            return {};
        }

        const followUp = await this.generateFollowUpQuestion(lastAnswer);
        if (followUp) {
            console.log('[HealthCheckGraph] Adding follow-up question:', followUp.question);
            return { healthCheckQuestions: [...state.healthCheckQuestions, followUp] };
        }

        return {};
    }

    private finalize(state: HealthCheckStateType) {
        console.log('[HealthCheckGraph] Health check complete:', {
            userId: state.userId,
            totalAnswers: state.healthCheckAnswers.length,
            validAnswers: state.healthCheckAnswers.filter(a => a.isValid).length
        });

        return {
            response: "Thank you for completing your health check! All your responses have been recorded. Take care, goodbye!",
            isHealthCheckComplete: true
        };
    }

    private routeAfterValidation(state: HealthCheckStateType): "ask_question" | "check_follow_up" | "finalize" {
        if (state.isHealthCheckComplete) return "finalize";
        if (state.pendingClarification) return "ask_question";
        if (state.questionAttempts > 0) return "ask_question";
        return "check_follow_up";
    }

    private routeAfterFollowUp(state: HealthCheckStateType): "ask_question" | "finalize" {
        if (state.currentQuestionIndex < state.healthCheckQuestions.length) return "ask_question";
        return "finalize";
    }

    private async generateFollowUpQuestion(lastAnswer: HealthCheckAnswer): Promise<QuestionData | null> {
        try {
            const response = await this.llm.invoke([
                new SystemMessage(
                    `A health check patient answered "${lastAnswer.validatedAnswer}" to the question: "${lastAnswer.question.question}".\n` +
                    `Does this answer warrant a brief follow-up question to gather more useful health information?\n` +
                    `If yes, return a JSON object with this exact shape (no markdown, no explanation):\n` +
                    `{"question": "...", "category": "${lastAnswer.question.category}", "context": "..."}\n` +
                    `If no follow-up is needed, respond with exactly: NO_FOLLOW_UP`
                )
            ]);
            const content = String(response.content).trim();
            if (content === 'NO_FOLLOW_UP') return null;

            const parsed = JSON.parse(content);
            return {
                id: `follow_up_${lastAnswer.questionIndex}_${Date.now()}`,
                question: parsed.question,
                type: 'text',
                category: parsed.category ?? lastAnswer.question.category,
                context: parsed.context ?? '',
                validation: 'Free text response',
                optional: true
            } as QuestionData;
        } catch {
            return null;
        }
    }

    private recordAnswer(
        state: HealthCheckStateType,
        validatedAnswer: string,
        isValid: boolean,
        extractionMethod: HealthCheckAnswer['extractionMethod'] = 'rule-based',
        confidence: number = 1.0
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

    private skipQuestion(state: HealthCheckStateType) {
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
            lastValidationError: ""
        };
    }

    private buildQuestionContext(question: QuestionData, state: HealthCheckStateType): string {
        const questionNumber = state.currentQuestionIndex + 1;
        const totalQuestions = state.healthCheckQuestions.length;

        let context = `You are conducting a health check-in with an elderly user.\n`;
        context += `Progress: Question ${questionNumber} of ${totalQuestions}.\n\n`;

        if (state.currentQuestionIndex === 0 && state.questionAttempts === 0 && !state.pendingClarification) {
            context += `## Starting Health Check\n`;
            context += `Tell the user: "Before you go, let's do a quick health check-in."\n\n`;
        }

        if (state.healthCheckAnswers.length > 0) {
            const validAnswers = state.healthCheckAnswers.filter(a => a.isValid);
            if (validAnswers.length > 0) {
                context += `## Previous Responses\n`;
                validAnswers.forEach(a => {
                    context += `- ${a.question.question}: ${a.validatedAnswer}\n`;
                });
                context += `\n`;
            }
        }

        if (state.pendingClarification) {
            context += `## Clarification Request\n`;
            context += `The user asked: "${state.clarificationContext}"\n`;
            context += `Kindly answer their question, then gently re-ask the following question:\n`;
            context += `"${question.question}"\n`;
        } else {
            context += `## Current Question\n`;
            context += `Type: ${question.type}\n`;
            context += `Category: ${question.category}\n`;

            if (question.type === 'scale') {
                context += `Scale range: ${question.min}-${question.max}\n`;
            }

            context += `\n## Instructions\n`;
            context += `Ask the following question in a warm, conversational way:\n`;
            context += `"${question.question}"\n\n`;

            if (state.questionAttempts > 0) {
                context += `NOTE: The user's previous answer was not clear enough to extract a valid response.\n`;
                context += `Gently explain what format you need and ask again.\n`;
            }
        }

        context += `\nBe empathetic and conversational. Provide context for why you're asking.`;
        return context;
    }

    get graph() {
        return this.compiledGraph;
    }
}
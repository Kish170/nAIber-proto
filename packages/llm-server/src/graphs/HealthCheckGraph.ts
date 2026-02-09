import { StateGraph, END, interrupt } from "@langchain/langgraph";
import { BaseCheckpointSaver } from "@langchain/langgraph-checkpoint";
import { ChatOpenAI } from "@langchain/openai";
import { SystemMessage } from "@langchain/core/messages";
import { HealthCheckState, HealthCheckStateType, HealthCheckAnswer } from "../states/HealthCheckState.js";
import { HealthCheckHandler } from "../handlers/HealthCheckHandler.js";
import { QuestionData, validateQuestionData } from "../handlers/questions/index.js";
import { OpenAIClient } from "@naiber/shared";

const MAX_RETRY_ATTEMPTS = 2;

export class HealthCheckGraph {
    private llm: ChatOpenAI;
    private compiledGraph: any;

    constructor(openAIClient: OpenAIClient, checkpointer: BaseCheckpointSaver) {
        this.llm = openAIClient.returnChatModel() as any;

        const graph: any = new StateGraph(HealthCheckState);

        graph.addNode("initialize", this.initialize.bind(this));
        graph.addNode("ask_question", this.askQuestion.bind(this));
        graph.addNode("wait_for_answer", this.waitForAnswer.bind(this));
        graph.addNode("validate_answer", this.validateAnswer.bind(this));
        graph.addNode("finalize", this.finalize.bind(this));

        graph.setEntryPoint("initialize");
        graph.addEdge("initialize", "ask_question");
        graph.addEdge("ask_question", "wait_for_answer");
        graph.addEdge("wait_for_answer", "validate_answer");
        graph.addConditionalEdges("validate_answer", this.routeAfterValidation.bind(this));
        graph.addEdge("finalize", END);

        this.compiledGraph = graph.compile({ checkpointer });
    }

    private async initialize(state: HealthCheckStateType) {
        console.log('[HealthCheckGraph] Initializing health check for userId:', state.userId);

        const questions = await HealthCheckHandler.initializeHealthCheck(state.userId);
        const questionData = questions.map(q => q.toJSON() as QuestionData);

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

        const systemPrompt = this.buildQuestionContext(currentQuestion, state);

        console.log('[HealthCheckGraph] Asking question:', {
            questionIndex: state.currentQuestionIndex,
            questionType: currentQuestion.type,
            isRetry: state.questionAttempts > 0
        });

        const messages = [
            new SystemMessage(systemPrompt),
            ...state.messages.slice(-3)
        ];

        const response = await this.llm.invoke(messages);

        let content: string;
        if (typeof response.content === 'string') {
            content = response.content;
        } else if (Array.isArray(response.content)) {
            content = response.content
                .map(part => typeof part === 'string' ? part : JSON.stringify(part))
                .join('');
        } else {
            content = String(response.content);
        }

        console.log('[HealthCheckGraph] Question generated:', {
            questionIndex: state.currentQuestionIndex,
            responseLength: content.length
        });

        return { response: content };
    }

    private waitForAnswer(state: HealthCheckStateType) {
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

    private validateAnswer(state: HealthCheckStateType) {
        const currentQuestion = state.healthCheckQuestions[state.currentQuestionIndex];

        if (!currentQuestion) {
            console.error('[HealthCheckGraph] No question at index for validation:', state.currentQuestionIndex);
            return {
                isValid: false,
                validatedAnswer: state.rawAnswer
            };
        }

        const validation = validateQuestionData(currentQuestion, state.rawAnswer);

        console.log('[HealthCheckGraph] Validation result:', {
            questionIndex: state.currentQuestionIndex,
            isValid: validation.isValid,
            validatedAnswer: validation.validatedAnswer,
            questionAttempts: state.questionAttempts
        });

        const answerRecord: HealthCheckAnswer = {
            questionIndex: state.currentQuestionIndex,
            question: currentQuestion,
            rawAnswer: state.rawAnswer,
            validatedAnswer: validation.validatedAnswer,
            isValid: validation.isValid,
            attemptCount: state.questionAttempts + 1
        };

        if (validation.isValid) {
            console.log('[HealthCheckGraph] Valid answer, moving to next question');
            return {
                isValid: true,
                validatedAnswer: validation.validatedAnswer,
                healthCheckAnswers: [...state.healthCheckAnswers, answerRecord],
                currentQuestionIndex: state.currentQuestionIndex + 1,
                questionAttempts: 0
            };
        } else if (state.questionAttempts < MAX_RETRY_ATTEMPTS - 1) {
            console.log('[HealthCheckGraph] Invalid answer, retry attempt:', state.questionAttempts + 1);
            return {
                isValid: false,
                validatedAnswer: validation.validatedAnswer,
                questionAttempts: state.questionAttempts + 1
            };
        } else {
            console.warn('[HealthCheckGraph] Max attempts reached, accepting invalid answer and moving on');
            return {
                isValid: false,
                validatedAnswer: validation.validatedAnswer,
                healthCheckAnswers: [...state.healthCheckAnswers, answerRecord],
                currentQuestionIndex: state.currentQuestionIndex + 1,
                questionAttempts: 0
            };
        }
    }

    private routeAfterValidation(state: HealthCheckStateType): "ask_question" | "finalize" {
        if (state.currentQuestionIndex >= state.healthCheckQuestions.length) {
            return "finalize";
        }
        return "ask_question";
    }

    private finalize(state: HealthCheckStateType) {
        console.log('[HealthCheckGraph] Health check complete:', {
            userId: state.userId,
            totalAnswers: state.healthCheckAnswers.length
        });

        const validAnswers = state.healthCheckAnswers.filter(a => a.isValid);
        const questions = validAnswers.map(a => a.question);
        const answers = validAnswers.map(a => a.validatedAnswer);

        const parsedData = HealthCheckHandler.parseHealthCheckAnswers(questions, answers);

        console.log('[HealthCheckGraph] Parsed health check data:', {
            userId: state.userId,
            healthLog: parsedData.healthLog,
            medicationLogs: parsedData.medicationLogs.length,
            conditionLogs: parsedData.healthConditionLogs.length
        });

        return {
            response: "Thank you for completing the health check! Your responses have been recorded. Is there anything else I can help you with?",
            isHealthCheckComplete: true
        };
    }

    private buildQuestionContext(question: QuestionData, state: HealthCheckStateType): string {
        let context = `You are conducting a health check-in with an elderly user.\n\n`;

        if (state.currentQuestionIndex === 0 && state.questionAttempts === 0) {
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
            context += `NOTE: The user's previous answer was invalid. `;
            context += `Gently explain what format you need and ask again.\n`;

            if (question.type === 'scale') {
                context += `\nExpect a number between ${question.min} and ${question.max}.\n`;
            } else if (question.type === 'boolean') {
                context += `\nExpect a yes/no answer.\n`;
            }
        }

        context += `\nBe empathetic and provide context for why you're asking this question.`;

        return context;
    }

    get graph() {
        return this.compiledGraph;
    }
}

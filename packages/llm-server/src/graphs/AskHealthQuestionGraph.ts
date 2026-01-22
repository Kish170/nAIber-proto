import { StateGraph, END } from "@langchain/langgraph";
import { ChatOpenAI } from "@langchain/openai";
import { SystemMessage } from "@langchain/core/messages";
import { ConversationState, ConversationStateType } from "../states/ConversationState.js";
import { HealthCheckSessionManager } from "../services/HealthCheckSessionManager.js";
import { OpenAIClient } from "@naiber/shared";
import { Question, ScaleQuestion, BooleanQuestion } from "../handlers/questions/index.js";

export class AskHealthQuestionGraph {
    private graph: any;
    private llm: ChatOpenAI;
    private sessionManager: HealthCheckSessionManager;

    constructor(openAIClient: OpenAIClient, sessionManager: HealthCheckSessionManager) {
        this.llm = openAIClient.returnChatModel() as any;
        this.sessionManager = sessionManager;

        this.graph = new StateGraph(ConversationState);

        this.graph.addNode("load_session", this.loadSession.bind(this));
        this.graph.addNode("ask_question_with_llm", this.askQuestionWithLLM.bind(this));

        this.graph.addEdge("load_session", "ask_question_with_llm");
        this.graph.addEdge("ask_question_with_llm", END);

        this.graph.setEntryPoint("load_session");
    }

    private async loadSession(state: ConversationStateType) {
        console.log('[AskHealthQuestionGraph] Loading session for userId:', state.userId);

        const session = await this.sessionManager.getSession(state.userId);
        if (!session) {
            console.error('[AskHealthQuestionGraph] No session found for user:', state.userId);
            return {
                response: "I'm sorry, I couldn't find your health check session. Let's start over.",
                isHealthCheckComplete: false
            };
        }

        console.log('[AskHealthQuestionGraph] Session loaded:', {
            userId: state.userId,
            currentQuestionIndex: session.currentQuestionIndex,
            totalQuestions: session.totalQuestions,
            questionAttempts: session.questionAttempts
        });

        return {
            healthCheckQuestions: session.questions,
            currentQuestionIndex: session.currentQuestionIndex,
            questionAttempts: session.questionAttempts,
            healthCheckAnswers: session.answers
        };
    }

    private async askQuestionWithLLM(state: ConversationStateType) {
        const currentQuestion = state.healthCheckQuestions[state.currentQuestionIndex];

        if (!currentQuestion) {
            console.error('[AskHealthQuestionGraph] No current question at index:', state.currentQuestionIndex);
            return {
                response: "I'm sorry, something went wrong. Let's end the health check here.",
                isHealthCheckComplete: true
            };
        }

        const systemPrompt = this.buildQuestionContext(currentQuestion, state);

        console.log('[AskHealthQuestionGraph] Asking question:', {
            questionIndex: state.currentQuestionIndex,
            questionType: currentQuestion.getType(),
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

        console.log('[AskHealthQuestionGraph] Question asked:', {
            questionIndex: state.currentQuestionIndex,
            responseLength: content.length
        });

        return {
            response: content
        };
    }

    private buildQuestionContext(question: Question, state: ConversationStateType): string {
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
                    context += `- ${a.question.getQuestion()}: ${a.validatedAnswer}\n`;
                });
                context += `\n`;
            }
        }

        context += `## Current Question\n`;
        context += `Type: ${question.getType()}\n`;
        context += `Category: ${question.category}\n`;

        if (question instanceof ScaleQuestion) {
            context += `Scale range: ${question.getMin()}-${question.getMax()}\n`;
        }

        context += `\n## Instructions\n`;
        context += `Ask the following question in a warm, conversational way:\n`;
        context += `"${question.getQuestion()}"\n\n`;

        if (state.questionAttempts > 0) {
            context += `NOTE: The user's previous answer was invalid. `;
            context += `Gently explain what format you need and ask again.\n`;

            if (question instanceof ScaleQuestion) {
                context += `\nExpect a number between ${question.getMin()} and ${question.getMax()}.\n`;
            } else if (question instanceof BooleanQuestion) {
                context += `\nExpect a yes/no answer.\n`;
            }
        }

        context += `\nBe empathetic and provide context for why you're asking this question.`;

        return context;
    }

    public compile() {
        return this.graph.compile();
    }
}
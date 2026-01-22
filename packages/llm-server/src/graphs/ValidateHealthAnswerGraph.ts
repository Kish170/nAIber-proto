import { StateGraph, END } from "@langchain/langgraph";
import { ConversationState, ConversationStateType } from "../states/ConversationState.js";
import { HealthCheckSessionManager } from "../services/HealthCheckSessionManager.js";

export class ValidateHealthAnswerGraph {
    private graph: any;
    private sessionManager: HealthCheckSessionManager;
    private readonly MAX_RETRY_ATTEMPTS = 2;

    constructor(sessionManager: HealthCheckSessionManager) {
        this.sessionManager = sessionManager;

        this.graph = new StateGraph(ConversationState);

        this.graph.addNode("load_session", this.loadSession.bind(this));
        this.graph.addNode("extract_answer", this.extractAnswer.bind(this));
        this.graph.addNode("validate_answer", this.validateAnswer.bind(this));
        this.graph.addNode("update_session", this.updateSession.bind(this));

        this.graph.addEdge("load_session", "extract_answer");
        this.graph.addEdge("extract_answer", "validate_answer");
        this.graph.addEdge("validate_answer", "update_session");
        this.graph.addEdge("update_session", END);

        this.graph.setEntryPoint("load_session");
    }

    private async loadSession(state: ConversationStateType) {
        console.log('[ValidateHealthAnswerGraph] Loading session for userId:', state.userId);

        const session = await this.sessionManager.getSession(state.userId);
        if (!session) {
            console.error('[ValidateHealthAnswerGraph] No session found for user:', state.userId);
            return {
                response: "I'm sorry, I couldn't find your health check session.",
                isHealthCheckComplete: false
            };
        }

        console.log('[ValidateHealthAnswerGraph] Session loaded:', {
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

    private extractAnswer(state: ConversationStateType) {
        const lastMessage = state.messages[state.messages.length - 1];
        const rawAnswer = typeof lastMessage.content === 'string'
            ? lastMessage.content
            : JSON.stringify(lastMessage.content);

        console.log('[ValidateHealthAnswerGraph] Extracted answer:', {
            rawAnswer: rawAnswer.substring(0, 100),
            currentQuestionIndex: state.currentQuestionIndex
        });

        return { rawAnswer };
    }

    private validateAnswer(state: ConversationStateType) {
        const currentQuestion = state.healthCheckQuestions[state.currentQuestionIndex];

        if (!currentQuestion) {
            console.error('[ValidateHealthAnswerGraph] No current question at index:', state.currentQuestionIndex);
            return {
                isValid: false,
                validatedAnswer: state.rawAnswer
            };
        }

        const validation = currentQuestion.validate(state.rawAnswer);

        console.log('[ValidateHealthAnswerGraph] Validation result:', {
            questionIndex: state.currentQuestionIndex,
            isValid: validation.isValid,
            validatedAnswer: validation.validatedAnswer,
            questionAttempts: state.questionAttempts
        });

        return {
            isValid: validation.isValid,
            validatedAnswer: validation.validatedAnswer
        };
    }

    private async updateSession(state: ConversationStateType) {
        const session = await this.sessionManager.getSession(state.userId);
        if (!session) {
            console.error('[ValidateHealthAnswerGraph] Session not found during update:', state.userId);
            return {
                response: "I'm sorry, something went wrong with your health check session.",
                isHealthCheckComplete: false
            };
        }

        const currentQuestion = session.questions[session.currentQuestionIndex];

        const answerRecord = {
            questionIndex: session.currentQuestionIndex,
            question: currentQuestion,
            rawAnswer: state.rawAnswer,
            validatedAnswer: state.validatedAnswer,
            isValid: state.isValid,
            attemptCount: session.questionAttempts + 1
        };

        if (state.isValid) {
            session.answers.push(answerRecord);
            session.currentQuestionIndex++;
            session.questionAttempts = 0;

            console.log('[ValidateHealthAnswerGraph] Valid answer accepted, moving to question', session.currentQuestionIndex);
        } else if (session.questionAttempts < this.MAX_RETRY_ATTEMPTS - 1) {
            session.questionAttempts++;

            console.log('[ValidateHealthAnswerGraph] Invalid answer, retry attempt:', session.questionAttempts);

            await this.sessionManager.saveSession(session);

            return {
                needsNextQuestion: true, 
                isHealthCheckComplete: false
            };
        } else {
            session.answers.push(answerRecord);
            session.currentQuestionIndex++;
            session.questionAttempts = 0;

            console.warn('[ValidateHealthAnswerGraph] Max attempts reached, accepting invalid answer and moving on');
        }

        if (session.currentQuestionIndex >= session.totalQuestions) {
            console.log('[ValidateHealthAnswerGraph] All questions completed, finishing health check');

            await this.sessionManager.completeSession(state.userId);

            return {
                response: "Thank you for completing the health check! Your responses have been recorded. Is there anything else I can help you with?",
                isHealthCheckComplete: true,
                needsNextQuestion: false
            };
        }

        await this.sessionManager.saveSession(session);

        console.log('[ValidateHealthAnswerGraph] Session updated, next question needed');

        return {
            needsNextQuestion: true,
            isHealthCheckComplete: false
        };
    }

    public compile() {
        return this.graph.compile();
    }
}
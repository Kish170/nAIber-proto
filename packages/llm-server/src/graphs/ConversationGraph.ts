import { StateGraph, END } from "@langchain/langgraph";
import { ChatOpenAI } from "@langchain/openai";
import { SystemMessage } from "@langchain/core/messages";
import { ConversationState, ConversationStateType } from "../states/ConversationState.js";
import { EmbeddingService } from "../../../shared/src/services/EmbeddingService.js";
import { IntentClassifier } from "../services/IntentClassifier.js";
import { MemoryRetriever } from "../services/MemoryRetriever.js";
import { TopicManager } from "../services/TopicManager.js";
import { HealthCheckHandler } from "../handlers/HealthCheckHandler.js";
import { Question, ScaleQuestion, BooleanQuestion, TextQuestion } from "../handlers/questions/index.js";

export class ConversationGraph {
    private graph: any;
    private llm: ChatOpenAI;
    private embeddingService: EmbeddingService;
    private memoryRetriever: MemoryRetriever;
    private intentClassifier: IntentClassifier;
    private topicManager: TopicManager;
    private readonly MAX_RETRY_ATTEMPTS = 2;
    constructor(openAIKey: string, embeddingService: EmbeddingService, memoryRetriever: MemoryRetriever, topicManager: TopicManager) {
        this.llm = new ChatOpenAI({
            apiKey: openAIKey,
            model: "gpt-4o",
            temperature: 0.7
        });
        this.embeddingService = embeddingService;
        this.memoryRetriever = memoryRetriever;
        this.topicManager = topicManager;
        this.intentClassifier = new IntentClassifier();

        this.graph = new StateGraph(ConversationState);

        this.graph.addNode("classify_intent", this.classifyIntent.bind(this));
        this.graph.addNode("retrieve_memories", this.retrieveMemories.bind(this));
        this.graph.addNode("check_topic_fatigue", this.checkTopicFatigue.bind(this));
        this.graph.addNode("generate_response", this.generateResponse.bind(this));
        this.graph.addNode("skip_rag", this.skipRAG.bind(this));

        this.graph.addNode("start_health_check", this.startHealthCheck.bind(this));
        this.graph.addNode("prepare_health_question", this.prepareHealthQuestion.bind(this));
        this.graph.addNode("ask_health_question_with_llm", this.askHealthQuestionWithLLM.bind(this));
        this.graph.addNode("validate_health_answer", this.validateHealthAnswer.bind(this));
        this.graph.addNode("save_health_check_results", this.saveHealthCheckResults.bind(this));

        this.graph.addConditionalEdges(
            "classify_intent",
            (state: ConversationStateType) => {
                if (state.isEndCall && !state.isHealthCheckComplete) return "start_health_check"
                return state.shouldProcessRAG ? "retrieve_memories" : "skip_rag"
            }
        );

        this.graph.addEdge("retrieve_memories", "check_topic_fatigue");
        this.graph.addEdge("check_topic_fatigue", "generate_response");
        this.graph.addEdge("skip_rag", "generate_response");
        this.graph.addEdge("generate_response", END);

        this.graph.addEdge("start_health_check", "prepare_health_question");
        this.graph.addEdge("prepare_health_question", "ask_health_question_with_llm");
        this.graph.addEdge("ask_health_question_with_llm", "validate_health_answer");

        this.graph.addConditionalEdges("validate_health_answer", (state: ConversationStateType) => {
            const hasMoreQuestions = state.currentQuestionIndex < state.healthCheckQuestions.length;
            const lastAnswer = state.healthCheckAnswers[state.healthCheckAnswers.length - 1];
            const shouldRetry = lastAnswer && !lastAnswer.isValid && state.questionAttempts < this.MAX_RETRY_ATTEMPTS;

            if (shouldRetry) {
                return "prepare_health_question";
            } else if (hasMoreQuestions) {
                return "prepare_health_question";
            } else {
                return "save_health_check_results";
            }
        });

        this.graph.addEdge("save_health_check_results", END);

        this.graph.setEntryPoint("classify_intent");
    }

    private async classifyIntent(state: ConversationStateType) {
        const lastMessage = state.messages[state.messages.length - 1];
        const content = typeof lastMessage.content === 'string' ? lastMessage.content : JSON.stringify(lastMessage.content);

        const classification = this.intentClassifier.classifyIntent(content);

        return {
            shouldProcessRAG: classification.shouldProcessRAG,
            messageLength: classification.messageLength,
            hasSubstantiveContent: classification.hasSubstantiveContent,
            isContinuation: classification.isContinuation,
            isShortResponse: classification.isShortResponse
        };
    }

    private async retrieveMemories(state: ConversationStateType) {
        const lastMessage = state.messages[state.messages.length - 1];
        const content = typeof lastMessage.content === 'string' ? lastMessage.content : JSON.stringify(lastMessage.content);

        const newEmbedding = await this.embeddingService.embedQuery(content);
        const topicChanged = await this.topicManager.detectTopicChange(
            state.conversationId,
            newEmbedding,
            state.messageLength
        );

        let memories: string[] = [];

        if (topicChanged || state.topicFatigue > 0.25) {
            if (topicChanged) {
                await this.topicManager.resetTopicFatigue(state.conversationId);
            }

            const retrievedMemories = await this.memoryRetriever.retrieveMemories(
                state.userId,
                newEmbedding,
                5
            );
            memories = retrievedMemories.highlights;
        }

        return {
            retrievedMemories: memories,
            currentTopicVector: newEmbedding,
            topicChanged,
            messageCount: topicChanged ? 1 : state.messageCount + 1
        };
    }

    private async checkTopicFatigue(state: ConversationStateType) {
        await this.topicManager.updateTopicState(
            state.conversationId,
            state.currentTopicVector || [],
            state.messageLength
        );

        const topicState = await this.topicManager.getCurrentTopic(state.conversationId);
        const topicFatigue = topicState?.topicFatigue || 0;

        let fatigueGuidance = "";
        if (topicFatigue >= 0.75) {
            fatigueGuidance = "TOPIC CHANGE RECOMMENDED: Topic extensively discussed...";
        } else if (topicFatigue >= 0.50) {
            fatigueGuidance = "TOPIC FRESHNESS NEEDED: Topic thoroughly covered...";
        } else if (topicFatigue >= 0.25) {
            fatigueGuidance = "TOPIC ENGAGEMENT NOTE: Watch for user interest cues...";
        }

        return { topicFatigue, fatigueGuidance };
    }

    private async generateResponse(state: ConversationStateType) {
        let contextSection = "";
        if (state.retrievedMemories.length > 0) {
            contextSection = `# RELEVANT MEMORIES FROM PAST CONVERSATIONS
            ${state.retrievedMemories.map((m, i) => `${i + 1}. ${m}`).join('\n')}

            Use these memories to provide continuity and personalization.
            `;
        }

        if (state.fatigueGuidance) {
            contextSection += `\n\n${state.fatigueGuidance}`;
        }

        const systemPromptText = `${this.getSystemPrompt(state.userId)}

        ${contextSection}`;

        const recentMessages = state.messages.slice(-10);

        const messages = [
            new SystemMessage(systemPromptText),
            ...recentMessages
        ];

        const response = await this.llm.invoke(messages, {
            response_format: { type: 'json_object' }
        });

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

        let parsedResponse: { response: string; is_end_call_detected: boolean };
        try {
            parsedResponse = JSON.parse(content);
        } catch (error) {
            console.error('[ConversationGraph] Failed to parse JSON response:', error);
            console.error('[ConversationGraph] Raw content:', content);
            return { response: content, isEndCall: false };
        }

        if (!parsedResponse.response || typeof parsedResponse.is_end_call_detected !== 'boolean') {
            console.error('[ConversationGraph] Invalid response structure:', parsedResponse);
            return {
                response: parsedResponse.response || content,
                isEndCall: parsedResponse.is_end_call_detected ?? false
            };
        }

        console.log('[ConversationGraph] End call detection:', {
            isEndCallDetected: parsedResponse.is_end_call_detected,
            response: parsedResponse.response.substring(0, 100)
        });

        return {
            response: parsedResponse.response,
            isEndCall: parsedResponse.is_end_call_detected
        };
    }

    private async skipRAG(state: ConversationStateType) {
        return {
            messageCount: state.messageCount + 1
        };
    }

    private getSystemPrompt(userId: string): string {
        return `
            You are a helpful AI assistant having a conversation with user ${userId}.
            Your goal is to provide contextual, natural responses.

            If you think the user is about to end the call (e.g., says goodbye, mentions ending, or closing remarks), 
            set "is_end_call_detected" to true. Otherwise, set it to false.

            Return your output in JSON with these fields:
            {
            "response": "assistant's next message",
            "is_end_call_detected": boolean
            }
        `;
    }

    private async startHealthCheck(state: ConversationStateType) {
        console.log('[ConversationGraph] Starting health check for user:', state.userId);

        try {
            // Generate Question objects (not strings)
            const questions = await HealthCheckHandler.initializeHealthCheck(state.userId);

            console.log('[ConversationGraph] Generated', questions.length, 'health check questions');

            return {
                healthCheckQuestions: questions,  // Store full Question objects
                currentQuestionIndex: 0,
                questionAttempts: 0
            };
        } catch (error) {
            console.error('[ConversationGraph] Error initializing health check:', error);
            // Fallback to basic questions
            return {
                healthCheckQuestions: [
                    new ScaleQuestion("On a scale of 1-10, how are you feeling overall?", 'general'),
                    new TextQuestion("Are you experiencing any symptoms?", 'symptom'),
                    new ScaleQuestion("How would you rate your sleep from 1-10?", 'general')
                ],
                currentQuestionIndex: 0,
                questionAttempts: 0
            };
        }
    }

    private async prepareHealthQuestion(state: ConversationStateType) {
        const currentQuestion = state.healthCheckQuestions[state.currentQuestionIndex];

        if (!currentQuestion) {
            console.log('[ConversationGraph] No question at index', state.currentQuestionIndex, '- health check complete');
            return { isHealthCheckComplete: true };
        }

        console.log('[ConversationGraph] Preparing health question', state.currentQuestionIndex + 1, 'of', state.healthCheckQuestions.length);

        return {};
    }

    private buildQuestionContext(question: Question, state: ConversationStateType): string {
        let context = `You are conducting a health check-in with an elderly user.\n\n`;

        if (state.currentQuestionIndex === 0 && state.questionAttempts === 0) {
            context += `## Starting Health Check\n`;
            context += `This is the BEGINNING of the health check-in. Tell the user something along the line "We're starting your health check-in now" `;
            context += `or similar phrasing to clearly indicate they are entering a structured health assessment.\n\n`;
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
        }

        if (question instanceof ScaleQuestion) {
            context += `\nExpect a number between ${question.getMin()} and ${question.getMax()}.\n`;
        } else if (question instanceof BooleanQuestion) {
            context += `\nExpect a yes/no answer.\n`;
        }

        context += `\nBe empathetic and provide context for why you're asking this question.`;

        return context;
    }

    private async askHealthQuestionWithLLM(state: ConversationStateType) {
        const currentQuestion = state.healthCheckQuestions[state.currentQuestionIndex];

        if (!currentQuestion) {
            console.log('[ConversationGraph] No current question - health check complete');

            const completionMessage = `That completes our health check-in for today. Is there anything else on your mind you'd like to talk about, or is there anything else I can help you with before we wrap up?`;

            return {
                response: completionMessage,
                isHealthCheckComplete: true
            };
        }

        const systemPrompt = this.buildQuestionContext(currentQuestion, state);

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

        console.log('[ConversationGraph] LLM asked health question:', {
            questionIndex: state.currentQuestionIndex,
            response: content.substring(0, 100)
        });

        return {
            response: content
        };
    }

    private async validateHealthAnswer(state: ConversationStateType) {
        const lastMessage = state.messages[state.messages.length - 1];
        const currentQuestion = state.healthCheckQuestions[state.currentQuestionIndex];

        if (!currentQuestion) {
            console.error('[ConversationGraph] No current question to validate against');
            return { isHealthCheckComplete: true };
        }

        let rawAnswer: string;
        if (typeof lastMessage.content === 'string') {
            rawAnswer = lastMessage.content;
        } else if (Array.isArray(lastMessage.content)) {
            rawAnswer = lastMessage.content
                .map(part => typeof part === 'string' ? part : JSON.stringify(part))
                .join('');
        } else {
            rawAnswer = String(lastMessage.content);
        }

        const validation = currentQuestion.validate(rawAnswer);

        console.log('[ConversationGraph] Answer validation:', {
            questionIndex: state.currentQuestionIndex,
            isValid: validation.isValid,
            attempts: state.questionAttempts + 1
        });

        const answerRecord = {
            questionIndex: state.currentQuestionIndex,
            question: currentQuestion,
            rawAnswer,
            validatedAnswer: validation.validatedAnswer,
            isValid: validation.isValid,
            attemptCount: state.questionAttempts + 1
        };

        if (validation.isValid) {
            return {
                healthCheckAnswers: [answerRecord],
                currentQuestionIndex: state.currentQuestionIndex + 1,
                questionAttempts: 0  
            };
        } else if (state.questionAttempts < this.MAX_RETRY_ATTEMPTS - 1) {
            console.log('[ConversationGraph] Invalid answer, retrying. Attempt', state.questionAttempts + 1);
            return {
                healthCheckAnswers: [answerRecord],
                questionAttempts: state.questionAttempts + 1
            };
        } else {
            console.warn('[ConversationGraph] Max attempts reached, accepting invalid answer');
            return {
                healthCheckAnswers: [answerRecord],
                currentQuestionIndex: state.currentQuestionIndex + 1,
                questionAttempts: 0
            };
        }
    }

    private async saveHealthCheckResults(state: ConversationStateType) {
        console.log('[ConversationGraph] Saving health check results');

        try {
            const validAnswers = state.healthCheckAnswers.filter(a => a.isValid);
            const questions = validAnswers.map(a => a.question);
            const answers = validAnswers.map(a => a.validatedAnswer);

            const parsedData = HealthCheckHandler.parseHealthCheckAnswers(questions, answers);

            await HealthCheckHandler.saveHealthCheckResults(
                state.userId,
                state.conversationId,
                parsedData
            );

            console.log('[ConversationGraph] Health check results saved successfully');

            return {
                isHealthCheckComplete: true,
                response: "Thank you for completing the health check! Your responses have been recorded."
            };
        } catch (error) {
            console.error('[ConversationGraph] Error saving health check results:', error);
            return {
                isHealthCheckComplete: true,
                response: "Thank you for completing the health check!"
            };
        }
    }

    public compile() {
        return this.graph.compile();
    }
}
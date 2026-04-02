import { ChatOpenAI } from "@langchain/openai";
import { QuestionData } from "./questions/index.js";
import { IntentClassifier } from "./validation/IntentClassifier.js";
import { AnswerExtractor } from "./validation/AnswerExtractor.js";
import { detectSignals } from "./validation/SignalDetector.js";
import { InterpretationResult } from "./HealthCheckState.js";

export class AnswerInterpreter {
    private intentClassifier: IntentClassifier;
    private answerExtractor: AnswerExtractor;

    constructor(chatModel: ChatOpenAI) {
        this.intentClassifier = new IntentClassifier(chatModel);
        this.answerExtractor = new AnswerExtractor(chatModel);
    }

    async interpret(question: QuestionData | undefined, rawAnswer: string, priorAiResponse?: string): Promise<InterpretationResult> {
        const { intent, confidence: _intentConfidence, tier } = await this.intentClassifier.classify(rawAnswer, priorAiResponse);
        const signals = detectSignals(rawAnswer);

        console.log('[AnswerInterpreter]', {
            intent,
            tier,
            uncertain: signals.uncertain,
            partial: signals.partial,
            correction: signals.correction,
            sentiment: signals.sentiment,
            engagement: signals.engagement
        });

        if (intent !== 'ANSWERING' || !question) {
            return { intent, intentTier: tier, signals };
        }

        const extraction = await this.answerExtractor.extract(question, rawAnswer);

        console.log('[AnswerInterpreter] extraction:', {
            method: extraction.method,
            confidence: extraction.confidence,
            value: extraction.value.substring(0, 60)
        });

        return { intent, intentTier: tier, extraction, signals };
    }
}
import { DynamicStructuredTool } from "@langchain/core/tools";
import { z } from "zod";
import { ChatOpenAI } from "@langchain/openai";
import { SystemMessage, HumanMessage } from "@langchain/core/messages";

export function createDetectEndOfCallTool(llm: ChatOpenAI) {
    const detectionSchema = z.object({
        detected: z.boolean().describe("Whether the user is ending the call"),
        confidence: z.enum(["low", "medium", "high"]).describe("Confidence level of the detection"),
        reason: z.string().describe("Explanation for the detection decision")
    });

    const structuredLLM = llm.withStructuredOutput(detectionSchema);

    return new DynamicStructuredTool({
        name: "detect_end_of_call",
        description: "Analyze if user is ending the call based on their message using LLM reasoning",
        schema: z.object({
            lastMessage: z.string().describe("The last message from the user")
        }),
        func: async ({ lastMessage }) => {
            try {
                const prompt = `Analyze if this message indicates the user is ending a conversation:
                                "${lastMessage}"

                                Consider these indicators:
                                - Goodbye phrases (bye, goodbye, see you, talk to you later, ttyl)
                                - Gratitude with closure (thanks + goodbye/bye)
                                - Explicit ending (have to go, gotta go, need to go, must go)
                                - Completion indicators (that's all, that's it, nothing else)
                                - End call phrases (end call, hang up, disconnect)
                                - Closing pleasantries (take care, be well, stay safe)

                                Analyze and return your assessment.`;

                const result = await structuredLLM.invoke([
                    new SystemMessage("You are an expert at detecting conversation endings."),
                    new HumanMessage(prompt)
                ]);

                console.log('[DetectEndOfCallTool] Analysis:', {
                    lastMessage: lastMessage.substring(0, 100),
                    detected: result.detected,
                    confidence: result.confidence,
                    reason: result.reason
                });

                return result;
            } catch (error) {
                console.error('[DetectEndOfCallTool] Error:', error);
                const endCallPatterns = [
                    /\b(goodbye|bye|good\s*bye|see\s*you|talk\s*to\s*you\s*later|ttyl)\b/i,
                    /\b(thank\s*you|thanks)\b.*\b(bye|goodbye|later)\b/i,
                    /\b(have\s*to\s*go|need\s*to\s*go|gotta\s*go|must\s*go)\b/i,
                    /\b(that'?s?\s*all|that'?s?\s*it|nothing\s*else)\b/i,
                ];

                const detected = endCallPatterns.some(pattern => pattern.test(lastMessage));

                return {
                    detected,
                    confidence: "low" as const,
                    reason: "Fallback pattern matching due to LLM error"
                };
            }
        }
    });
}

export const createDetectNearEndOfCallTool = createDetectEndOfCallTool;
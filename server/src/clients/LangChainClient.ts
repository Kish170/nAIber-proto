import { z } from "zod";
import { ChatOpenAI } from "@langchain/openai";
import { ChatPromptTemplate } from "@langchain/core/prompts";

export class LangChainClient {
    private model: ChatOpenAI
    private modelApiKey: string
    private readonly responseSchema = z.object({
		highlights: z.array(z.string()).describe("Key conversation highlights"),
		topics: z.array(z.string()).describe("Main topics discussed"),
		mood: z.string().describe("User's emotional state"),
	});

    constructor(config: string) {
        this.modelApiKey = config
        this.model = new ChatOpenAI({
            model: "gpt-4o-mini",
			temperature: 0.1,
			apiKey: this.modelApiKey,
        });
    }

    async structuredAICalls(systemMessage: string, userMessage: string) {
        try {
            const structuredLLM = this.model.withStructuredOutput(
				this.responseSchema,
				{
					strict: true, 
				}
			);
            const prompt = ChatPromptTemplate.fromMessages([
                [
                    "system",
                    systemMessage
                ],
                [
                    "human",
                    userMessage
                ]
            ])

            const chain = prompt.pipe(structuredLLM)
            const response = await chain.invoke({systemMessage, userMessage})

            return response

        } catch(error) {
            console.error("Error setting prompt:", error);
			throw new Error("Failed to execute AI request");
        }
    }
}
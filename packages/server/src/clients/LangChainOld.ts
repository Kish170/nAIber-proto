import { z } from "zod";
import { initChatModel } from "langchain/chat_models/universal";
import { HumanMessage, SystemMessage } from "@langchain/core/messages";

export class LangChainTools {
	private readonly extractionPrompt = `
			Extract key highlights from this elderly care conversation.

			Conversation: {conversation}

			Return as JSON:
			{{
			"highlights": ["highlight1", "highlight2"],
			"topics": ["topic1", "topic2"],
			"mood": "emotional state"
			}}
	`;

	private readonly responseStructure = z.object({
		highlights: z.array(z.string()).describe("Key conversation highlights"),
		topics: z.array(z.string()).describe("Main topics discussed"),
		mood: z.string().describe("User's emotional state"),
	});

	private llm?: any;

	private async initializeLLM() {
		if (!this.llm) {
			this.llm = await initChatModel("gpt-4o-mini", {
				modelProvider: "openai",
				temperature: 0.1,
			});
		}
		return this.llm;
	}

	async extractConversation(conversationTranscript: string) {
		const llm = await this.initializeLLM();

		const structuredLLM = llm.withStructuredOutput(this.responseStructure);

		const messages = [
			new SystemMessage(this.extractionPrompt),
			new HumanMessage(conversationTranscript)
		];

		const response = await structuredLLM.invoke(messages);

		return response;
	}
}

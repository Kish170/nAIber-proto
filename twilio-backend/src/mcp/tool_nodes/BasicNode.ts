import { END } from "@langchain/langgraph";
import { AIMessage, ToolMessage } from "@langchain/core/messages";
import { Runnable, RunnableConfig } from "@langchain/core/runnables";
import { AgentState } from "../../types/Types";
import { agentTools } from "../tools/BasicInfoTools";
import { ChatOpenAI } from "@langchain/openai";

const apiKey = process.env.OPENAI_API_KEY;

const agentModel = new ChatOpenAI({
    model: "gpt-4o-mini",
    temperature: 0
  });

const boundModel = agentModel.bindTools(agentTools);

export const shouldContinue = (state: typeof AgentState.State) => {
    const { messages, userId, currentStep, collectedData } = state;
    const lastMessage = messages[messages.length - 1] as AIMessage;
    // If there is no function call, then we finish
    if (!lastMessage.tool_calls || lastMessage.tool_calls.length === 0) {
        return END;
    }
    // Otherwise if there is, we continue
    return "tools";
};

// **MODIFICATION**
//
// Here we don't pass all messages to the model but rather only pass the `N` most recent. Note that this is a terribly simplistic way to handle messages meant as an illustration, and there may be other methods you may want to look into depending on your use case. We also have to make sure we don't truncate the chat history to include the tool message first, as this would cause an API error.
export const callModel = async (
    state: typeof AgentState.State,
    config?: RunnableConfig,
) => {
    const { messages, userId, currentStep, collectedData } = state;
    // const systemContext = buildSystemContext(currentStep, collectedData);
    let modelMessages = [];
    for (let i = state.messages.length - 1; i >= 0; i--) {
        modelMessages.push(state.messages[i]);
        if (modelMessages.length >= 5) {
        if (!ToolMessage.isInstance(modelMessages[modelMessages.length - 1])) {
            break;
        }
        }
    }
    modelMessages.reverse();

    const response = await boundModel.invoke(modelMessages, config);
    // We return an object, because this will get added to the existing list
    return { messages: [response] };
};
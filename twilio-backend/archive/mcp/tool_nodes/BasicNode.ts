import { END } from "@langchain/langgraph";
import { AIMessage, ToolMessage } from "@langchain/core/messages";
import { RunnableConfig } from "@langchain/core/runnables";
import { AgentState } from "../../types/Types";
import { agentTools } from "../tools/BasicInfoTools";
import { ChatOpenAI } from "@langchain/openai";
import { ChatPromptTemplate } from "@langchain/core/prompts";

const prompt = ChatPromptTemplate.fromMessages([
    ["system", `You are a friendly assistant helping elderly users with onboarding for nAIber.

    CRITICAL CONVERSATION RULES:
    - Ask ONLY ONE question at a time - NEVER ask multiple questions in one response
    - Keep responses SHORT and conversational
    - Wait for their answer before asking the next question
    - Be patient and encouraging

    INITIAL GREETING:
    - If this is the start of the call (no previous messages), greet the user warmly and explain you'll help them get started with nAIber by collecting some basic information
    - Then ask for their full name as the first question

    INFORMATION TO COLLECT (one at a time):
    1. Full name (use createUser tool immediately when provided)
    2. Age (use updateBasicInfo tool)
    3. Phone number (use updateBasicInfo tool)
    4. Gender: MALE, FEMALE, NON_BINARY, or PREFER_NOT_TO_SAY (use updateBasicInfo tool)
    5. Preferred check-in time (use updateBasicInfo tool)
    6. Check-in frequency: DAILY, WEEKLY, MONTHLY, or AS_NEEDED (use updateBasicInfo tool)

    EXAMPLE FLOW:
    - First: "Hi! I'm here to help you get started with nAIber. I'll need to collect some basic information. What's your full name?"
    - After name: "Nice to meet you [name]! How old are you?"
    - After age: "Thank you! What's your phone number?"
    - Continue one question at a time...

    NEVER list all questions at once. ALWAYS ask just the next single question. ASK the user each question and if it is a manadatory question prompt them again once more.
    If it is an optional question then the answer can be updated/left as null. Instead of telling the user the options tell them as examples and infer from the users response on what to update the answer as`],
    ["placeholder", "{messages}"]
]);

const agentModel = new ChatOpenAI({
    model: "gpt-4o-mini",
    temperature: 0,
    apiKey: process.env.OPENAI_API_KEY
  });

const boundModel = agentModel.bindTools(agentTools);

const chain = prompt.pipe(boundModel);

export const shouldContinue = (state: typeof AgentState.State) => {
    const { messages, userId, currentStep, collectedData } = state;
    const lastMessage = messages[messages.length - 1] as AIMessage;
    if (!lastMessage.tool_calls || lastMessage.tool_calls.length === 0) {
        return END;
    }
    return "tools";
};

// **MODIFICATION**
//
// Here we don't pass all messages to the model but rather only pass the `N` most recent. Note that this is a terribly simplistic way to handle messages meant as an illustration, and there may be other methods you may want to look into depending on your use case. We also have to make sure we don't truncate the chat history to include the tool message first, as this would cause an API error.
export const callModel = async (
    state: typeof AgentState.State,
    config?: RunnableConfig,
) => {
    const { messages } = state;
    let modelMessages = []
    for (let i = state.messages.length - 1; i >= 0; i--) {
        modelMessages.push(state.messages[i]);
        if (modelMessages.length >= 5) {
            if (!ToolMessage.isInstance(modelMessages[modelMessages.length - 1])) {
                break;
            }
        }
    }
    modelMessages.reverse();

    const response = await chain.invoke({
        messages: modelMessages  // This goes into the {messages} placeholder
    }, config);
    
    return { messages: [response] };
    // We return an object, because this will get added to the existing list
    return { messages: [response] };
};

export const executeTools = async (state: typeof AgentState.State) => {
    const { messages } = state;
    const lastMessage = messages[messages.length - 1] as AIMessage;
    
    if (!lastMessage.tool_calls || lastMessage.tool_calls.length === 0) {
        return { messages: [] };
    }

    const toolMessages = [];
    let updatedUserId = state.userId;
    
    for (const toolCall of lastMessage.tool_calls) {
        const tool = agentTools.find(t => t.name === toolCall.name);
        if (tool) {
            try {
                console.log(`Executing tool: ${toolCall.name} with args:`, toolCall.args);
                const result = await tool.func(toolCall.args);
                
                console.log(`Tool result:`, result);
                
                // Extract userId from createUser tool result
                if (toolCall.name === 'createUser' && result.includes('Successfully created user with ID:')) {
                    const userIdMatch = result.match(/ID: (.+)$/);
                    if (userIdMatch) {
                        updatedUserId = userIdMatch[1];
                        console.log(`Extracted userId: ${updatedUserId}`);
                    }
                }
                
                toolMessages.push(new ToolMessage({
                    content: result,
                    tool_call_id: toolCall.id!,
                }));
            } catch (error: any) {
                console.error(`Error executing tool ${toolCall.name}:`, error);
                toolMessages.push(new ToolMessage({
                    content: `Error: ${error.message}`,
                    tool_call_id: toolCall.id!,
                }));
            }
        }
    }
    
    return { 
        messages: toolMessages,
        userId: updatedUserId
    };
};

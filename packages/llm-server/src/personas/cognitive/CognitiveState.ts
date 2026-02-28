import { Annotation } from "@langchain/langgraph";
import { BaseMessage } from "@langchain/core/messages";

// TODO: Define cognitive assessment state annotations
export const CognitiveState = Annotation.Root({
    messages: Annotation<BaseMessage[]>({
        reducer: (x, y) => x.concat(y),
    }),
    userId: Annotation<string>(),
    conversationId: Annotation<string>(),
    response: Annotation<string>(),
});

export type CognitiveStateType = typeof CognitiveState.State;

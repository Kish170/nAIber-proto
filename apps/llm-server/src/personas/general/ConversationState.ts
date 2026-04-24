import { Annotation, messagesStateReducer } from '@langchain/langgraph';
import { BaseMessage } from '@langchain/core/messages';

export const ConversationState = Annotation.Root({
    messages:       Annotation<BaseMessage[]>({ reducer: messagesStateReducer, default: () => [] }),
    userId:         Annotation<string>({ reducer: (_: string, b: string) => b, default: () => '' }),
    conversationId: Annotation<string>({ reducer: (_: string, b: string) => b, default: () => '' }),
    response:       Annotation<string>({ reducer: (_: string, b: string) => b, default: () => '' }),
});

export type ConversationStateType = typeof ConversationState.State;

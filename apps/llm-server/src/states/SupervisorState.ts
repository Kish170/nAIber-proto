import { Annotation, messagesStateReducer } from '@langchain/langgraph';
import { BaseMessage } from '@langchain/core/messages';

export const SupervisorState = Annotation.Root({
    messages:              Annotation<BaseMessage[]>({ reducer: messagesStateReducer, default: () => [] }),
    userId:                Annotation<string>({ reducer: (_: string, b: string) => b, default: () => '' }),
    conversationId:        Annotation<string>({ reducer: (_: string, b: string) => b, default: () => '' }),
    callType:              Annotation<string>({ reducer: (_: string, b: string) => b, default: () => 'general' }),
    response:              Annotation<string>({ reducer: (_: string, b: string) => b, default: () => '' }),
    isHealthCheckComplete: Annotation<boolean>({ reducer: (_: boolean, b: boolean) => b, default: () => false }),
    isCognitiveComplete:   Annotation<boolean>({ reducer: (_: boolean, b: boolean) => b, default: () => false }),
});

export type SupervisorStateType = typeof SupervisorState.State;

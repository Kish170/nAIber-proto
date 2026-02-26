import { Annotation, messagesStateReducer } from '@langchain/langgraph';
import { BaseMessage } from '@langchain/core/messages';

export const SupervisorState = Annotation.Root({
    messages:              Annotation<BaseMessage[]>({ reducer: messagesStateReducer, default: () => [] }),
    userId:                Annotation<string>({ reducer: (_, b) => b, default: () => '' }),
    conversationId:        Annotation<string>({ reducer: (_, b) => b, default: () => '' }),
    callType:              Annotation<string>({ reducer: (_, b) => b, default: () => 'general' }),
    response:              Annotation<string>({ reducer: (_, b) => b, default: () => '' }),
    isHealthCheckComplete: Annotation<boolean>({ reducer: (_, b) => b, default: () => false }),
});

export type SupervisorStateType = typeof SupervisorState.State;

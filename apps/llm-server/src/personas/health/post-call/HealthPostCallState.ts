import { Annotation } from '@langchain/langgraph';

export const HealthPostCallState = Annotation.Root({
    userId:         Annotation<string>({ reducer: (_, b) => b, default: () => '' }),
    conversationId: Annotation<string>({ reducer: (_, b) => b, default: () => '' }),
    answers:        Annotation<object[]>({ reducer: (_, b) => b, default: () => [] }),
    error:          Annotation<string>({ reducer: (_, b) => b, default: () => '' }),
});

export type HealthPostCallStateType = typeof HealthPostCallState.State;

import { Annotation } from "@langchain/langgraph";
import { BaseMessage } from "@langchain/core/messages";

export type HealthQuestionTopicExtended =
    | 'SYMPTOM'
    | 'MEDICATION_SIDE_EFFECT'
    | 'SLEEP'
    | 'PAIN'
    | 'MOOD'
    | 'MOBILITY'
    | 'APPETITE'
    | 'COGNITION_SELF_REPORT'
    | 'OTHER_HEALTH'
    | 'CONDITION_STATUS'
    | 'MEDICATION_ADHERENCE'
    | 'WELLBEING';

export interface DynamicQuestion {
    id: string;
    topic: HealthQuestionTopicExtended;
    questionText: string;
    questionType: 'scale' | 'boolean' | 'text';
    relatedTo?: string;
    source: 'seed' | 'tangent_created' | 'tangent_merged';
    addedAt: number;
}

export interface CompletedQuestion {
    question: DynamicQuestion;
    windowId: string;
    disposition: 'answered' | 'refused' | 'skipped';
    completedAt: number;
}

export interface CompletedWindow {
    windowId: string;
    question: DynamicQuestion;
    messages: BaseMessage[];
    disposition: 'answered' | 'refused' | 'skipped';
    openedAt: number;
    closedAt: number;
}

export interface TurnClassification {
    intent: 'ANSWERING' | 'ASKING' | 'REFUSING';
    isOnTopic: boolean;
    readyToAdvance: boolean;
    sentiment?: 'positive' | 'neutral' | 'negative';
    engagement?: 'high' | 'low';
    tangentAction?: 'redirect' | 'merge_into_pending' | 'create_new_pending';
    tangentTargetQuestionId?: string | null;
    tangentNewTopic?: string | null;
    tangentNewQuestionText?: string | null;
}

export type OpeningPhase =
    | 'greeting'
    | 'wellbeing_asked'
    | 'poorly_probing'
    | 'ready_check'
    | 'conversation'
    | 'done';

const keep = <T>(fallback: T) => ({
    reducer: (x: T, y: T | undefined | null) => (y !== undefined && y !== null) ? y : (x !== undefined && x !== null ? x : fallback),
    default: () => fallback
});

export const HealthCheckState = Annotation.Root({
    messages: Annotation<BaseMessage[]>({
        reducer: (x: BaseMessage[], y: BaseMessage[]) => x.concat(y),
        default: () => []
    }),
    userId: Annotation<string>({
        reducer: (x: string, y: string) => y || x || '',
        default: () => ''
    }),
    conversationId: Annotation<string>({
        reducer: (x: string, y: string) => y || x || '',
        default: () => ''
    }),

    openingPhase: Annotation<OpeningPhase>(keep<OpeningPhase>('greeting')),
    openingSentiment: Annotation<'WELL' | 'POORLY' | 'AMBIGUOUS' | null>(keep<'WELL' | 'POORLY' | 'AMBIGUOUS' | null>(null)),
    openingConcern: Annotation<string | null>(keep<string | null>(null)),
    openingDisposition: Annotation<'PROCEEDED' | 'ENDED_NOT_READY' | 'REDIRECTED_GENERAL' | null>(keep<'PROCEEDED' | 'ENDED_NOT_READY' | 'REDIRECTED_GENERAL' | null>(null)),
    openingEndReason: Annotation<string | null>(keep<string | null>(null)),

    pendingQuestions: Annotation<DynamicQuestion[]>(keep<DynamicQuestion[]>([])),
    inProgressQuestion: Annotation<DynamicQuestion | null>(keep<DynamicQuestion | null>(null)),
    completedQuestions: Annotation<CompletedQuestion[]>({
        reducer: (x: CompletedQuestion[], y: CompletedQuestion[]) => x.concat(y),
        default: () => []
    }),
    tangentQueue: Annotation<DynamicQuestion[]>(keep<DynamicQuestion[]>([])),

    currentWindowId: Annotation<string | null>(keep<string | null>(null)),
    currentWindowMessages: Annotation<BaseMessage[]>(keep<BaseMessage[]>([])),
    completedWindows: Annotation<CompletedWindow[]>({
        reducer: (x: CompletedWindow[], y: CompletedWindow[]) => x.concat(y),
        default: () => []
    }),

    subQuestionCount: Annotation<number>(keep<number>(0)),

    rawAnswer: Annotation<string>(keep<string>('')),
    lastClassification: Annotation<TurnClassification | null>({
        reducer: (_x: TurnClassification | null, y: TurnClassification | null) => (y !== undefined ? y : null),
        default: () => null
    }),

    response: Annotation<string>(keep<string>('')),
    isHealthCheckComplete: Annotation<boolean>(keep<boolean>(false)),
    previousCallContext: Annotation<string>(keep<string>('')),

    openingCallLogId: Annotation<string | null>(keep<string | null>(null)),
});

export type HealthCheckStateType = typeof HealthCheckState.State;
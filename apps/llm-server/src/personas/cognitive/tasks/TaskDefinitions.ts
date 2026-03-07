export enum CognitiveTaskType {
    ORIENTATION = 'ORIENTATION',
    WORD_REGISTRATION = 'WORD_REGISTRATION',
    DIGIT_SPAN_FORWARD = 'DIGIT_SPAN_FORWARD',
    DIGIT_SPAN_REVERSE = 'DIGIT_SPAN_REVERSE',
    SERIAL_7S = 'SERIAL_7S',
    LETTER_VIGILANCE = 'LETTER_VIGILANCE',
    LETTER_FLUENCY = 'LETTER_FLUENCY',
    ABSTRACTION = 'ABSTRACTION',
    DELAYED_RECALL = 'DELAYED_RECALL',
}

export enum CognitiveDomain {
    ORIENTATION = 'ORIENTATION',
    ATTENTION_CONCENTRATION = 'ATTENTION_CONCENTRATION',
    WORKING_MEMORY = 'WORKING_MEMORY',
    DELAYED_RECALL = 'DELAYED_RECALL',
    LANGUAGE_VERBAL_FLUENCY = 'LANGUAGE_VERBAL_FLUENCY',
    ABSTRACTION_REASONING = 'ABSTRACTION_REASONING',
}

export interface TaskDefinition {
    taskType: CognitiveTaskType;
    domain: CognitiveDomain;
    position: number;
    maxScore: number | null; // null for uncapped (fluency)
}

export interface RetrievalLevel {
    word: string;
    level: 'free' | 'cued' | 'recognition' | 'not_recalled';
    score: number;
}

export interface PerseverationSignals {
    wordRepetitions: string[];
    semanticClusters: string[];
    phoneticClusters: string[];
    intrusionErrors: string[];
    priorListIntrusions: string[];
}

export interface TaskResponse {
    taskType: CognitiveTaskType;
    domain: CognitiveDomain;
    rawAnswer: string;
    rawScore: number;
    maxScore: number | null;
    latencyMs?: number;
    wordsPerMinute?: number;
    lexicalDiversity?: number;
    coherenceScore?: number;
    fillerWordCount?: number;
    intrusionErrors?: string[];
    perseverationSignals?: PerseverationSignals;
    selfCorrections?: number;
    retrievalLevels?: RetrievalLevel[];
    registrationQuality?: 'complete' | 'partial';
    usedAlternative?: boolean; // WORLD backward for serial 7s
}

export interface WellbeingResponse {
    questionIndex: number;
    question: string;
    rawAnswer: string;
    distressDetected: boolean;
}

export const WELLBEING_QUESTIONS = [
    "Before we get started, I just want to check in — how are you feeling today overall?",
    "Have you had a chance to sleep okay recently?",
    "Is there anything on your mind today, or anything that's been worrying you?",
] as const;

/**
 * Canonical 9-task sequence. Order is fixed across all sessions —
 * changing it would invalidate longitudinal comparisons.
 */
export const TASK_SEQUENCE: TaskDefinition[] = [
    {
        taskType: CognitiveTaskType.ORIENTATION,
        domain: CognitiveDomain.ORIENTATION,
        position: 1,
        maxScore: 5,
    },
    {
        taskType: CognitiveTaskType.WORD_REGISTRATION,
        domain: CognitiveDomain.DELAYED_RECALL,
        position: 2,
        maxScore: null, // not scored — encoding confirmation only
    },
    {
        taskType: CognitiveTaskType.DIGIT_SPAN_FORWARD,
        domain: CognitiveDomain.ATTENTION_CONCENTRATION,
        position: 3,
        maxScore: 5,
    },
    {
        taskType: CognitiveTaskType.DIGIT_SPAN_REVERSE,
        domain: CognitiveDomain.WORKING_MEMORY,
        position: 4,
        maxScore: 4,
    },
    {
        taskType: CognitiveTaskType.SERIAL_7S,
        domain: CognitiveDomain.ATTENTION_CONCENTRATION,
        position: 5,
        maxScore: 5,
    },
    {
        taskType: CognitiveTaskType.LETTER_VIGILANCE,
        domain: CognitiveDomain.ATTENTION_CONCENTRATION,
        position: 6,
        maxScore: 6,
    },
    {
        taskType: CognitiveTaskType.LETTER_FLUENCY,
        domain: CognitiveDomain.LANGUAGE_VERBAL_FLUENCY,
        position: 7,
        maxScore: null, // uncapped
    },
    {
        taskType: CognitiveTaskType.ABSTRACTION,
        domain: CognitiveDomain.ABSTRACTION_REASONING,
        position: 8,
        maxScore: 4,
    },
    {
        taskType: CognitiveTaskType.DELAYED_RECALL,
        domain: CognitiveDomain.DELAYED_RECALL,
        position: 9,
        maxScore: 10,
    },
];

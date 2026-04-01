export enum CognitiveTaskType {
    WELLBEING = 'WELLBEING',
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
    WELLBEING = 'WELLBEING',
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
    maxScore: number | null; // null for uncapped (fluency) or non-scored
    prompt?: string;
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
    usedAlternative?: boolean;
    skipped?: boolean;
}

export interface WellbeingResponse {
    questionIndex: number;
    question: string;
    rawAnswer: string;
    distressDetected: boolean;
}

/**
 * Canonical task sequence. Wellbeing check-in (positions 1-3) followed by
 * 9 cognitive tasks (positions 4-12). Order is fixed across all sessions —
 * changing it would invalidate longitudinal comparisons.
 */
export const TASK_SEQUENCE: TaskDefinition[] = [
    {
        taskType: CognitiveTaskType.WELLBEING,
        domain: CognitiveDomain.WELLBEING,
        position: 1,
        maxScore: null,
        prompt: "Before we get started, I just want to check in — how are you feeling today overall?",
    },
    {
        taskType: CognitiveTaskType.WELLBEING,
        domain: CognitiveDomain.WELLBEING,
        position: 2,
        maxScore: null,
        prompt: "Have you had a chance to sleep okay recently?",
    },
    {
        taskType: CognitiveTaskType.WELLBEING,
        domain: CognitiveDomain.WELLBEING,
        position: 3,
        maxScore: null,
        prompt: "Is there anything on your mind today, or anything that's been worrying you?",
    },
    {
        taskType: CognitiveTaskType.ORIENTATION,
        domain: CognitiveDomain.ORIENTATION,
        position: 4,
        maxScore: 5,
        prompt: "Can you tell me what today's date is? And what month are we in? What year? And what season would you say we're in right now?",
    },
    {
        taskType: CognitiveTaskType.WORD_REGISTRATION,
        domain: CognitiveDomain.DELAYED_RECALL,
        position: 5,
        maxScore: null, // not scored — encoding confirmation only
        prompt: "I'm going to say five words, and I'd like you to repeat them back to me when I'm done. Don't worry about remembering them for now — just repeat them after me. Ready?",
    },
    {
        taskType: CognitiveTaskType.DIGIT_SPAN_FORWARD,
        domain: CognitiveDomain.ATTENTION_CONCENTRATION,
        position: 6,
        maxScore: 5,
        prompt: "I'm going to read some numbers. When I'm done, can you repeat them back to me in the same order I said them?",
    },
    {
        taskType: CognitiveTaskType.DIGIT_SPAN_REVERSE,
        domain: CognitiveDomain.WORKING_MEMORY,
        position: 7,
        maxScore: 4,
        prompt: "This time, when I read the numbers, I'd like you to say them back to me in reverse order — so the last number first.",
    },
    {
        taskType: CognitiveTaskType.SERIAL_7S,
        domain: CognitiveDomain.ATTENTION_CONCENTRATION,
        position: 8,
        maxScore: 5,
        prompt: "I'd like you to start at 100 and keep subtracting 7. Take your time.",
    },
    // LETTER_VIGILANCE temporarily removed — requires real-time letter-tap detection
    // which adds scoring complexity not yet supported. Re-enable when MCP tool handles it.
    // {
    //     taskType: CognitiveTaskType.LETTER_VIGILANCE,
    //     domain: CognitiveDomain.ATTENTION_CONCENTRATION,
    //     position: 9,
    //     maxScore: 6,
    //     prompt: "I'm going to read a list of letters. Every time you hear the letter A, I'd like you to say 'yes' out loud.",
    // },
    {
        taskType: CognitiveTaskType.LETTER_FLUENCY,
        domain: CognitiveDomain.LANGUAGE_VERBAL_FLUENCY,
        position: 10,
        maxScore: null, 
        prompt: "Now I'd like you to say as many words as you can that begin with a certain letter. No names of people or places, and no numbers. Just regular words — as many as you can think of.",
    },
    {
        taskType: CognitiveTaskType.ABSTRACTION,
        domain: CognitiveDomain.ABSTRACTION_REASONING,
        position: 11,
        maxScore: 4,
        prompt: "I'm going to name two things, and I'd like you to tell me how they're similar — what do they have in common?",
    },
    {
        taskType: CognitiveTaskType.DELAYED_RECALL,
        domain: CognitiveDomain.DELAYED_RECALL,
        position: 12,
        maxScore: 10,
        prompt: "Earlier I mentioned five words and asked you to hold onto them. Can you remember what those words were?",
    },
];

import { Annotation } from '@langchain/langgraph';

export interface ParsedAnswer {
    id: string;
    question: string;
    category: string;
    type: string;
    relatedTo: string | null;
    answer: string | null;
    isValid: boolean;
}

export interface WellbeingData {
    overallWellbeing: number | null;
    sleepQuality: number | null;
    physicalSymptoms: string[];
    generalNotes: string | null;
    concerns: string[];
    positives: string[];
}

export interface MedicationLogEntry {
    medicationId: string;
    medicationTaken: boolean;
}

export interface ConditionLogEntry {
    conditionId: string;
    rawNotes: string | null;
    symptoms: string[];
    severity: string | null;
    changeFromBaseline: string | null;
    notableFlags: string[];
}

const keep = <T>(fallback: T): { reducer: (a: T, b: T) => T; default: () => T } => ({
    reducer: (a: T, b: T) => (b !== undefined && b !== null ? b : a !== undefined && a !== null ? a : fallback),
    default: () => fallback
});

export const HealthPostCallState = Annotation.Root({
    userId:            Annotation<string>(keep<string>('')),
    conversationId:    Annotation<string>(keep<string>('')),
    answers:           Annotation<ParsedAnswer[]>(keep<ParsedAnswer[]>([])),
    wellbeingData:     Annotation<WellbeingData | null>(keep<WellbeingData | null>(null)),
    medicationEntries: Annotation<MedicationLogEntry[]>(keep<MedicationLogEntry[]>([])),
    conditionEntries:  Annotation<ConditionLogEntry[]>(keep<ConditionLogEntry[]>([])),
    error:             Annotation<string>(keep<string>('')),
});

export type HealthPostCallStateType = typeof HealthPostCallState.State;

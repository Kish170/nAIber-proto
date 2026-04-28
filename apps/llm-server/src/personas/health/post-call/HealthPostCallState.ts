import { Annotation } from '@langchain/langgraph';
import type { CompletedWindow } from '../HealthCheckState.js';

export interface ParsedAnswer {
    id: string;
    question: string;
    topic: string;
    type: string;
    relatedTo: string | null;
    slot: string | null;
    answer: string | null;
    isValid: boolean;
    windowId: string;
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
    adherenceContext: 'specific_date' | 'general_period';
    medicationTaken: boolean | null;
    takenAt: string | null;
    periodStart: string | null;
    periodEnd: string | null;
    adherenceRating: string | null;
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
    callDate:          Annotation<string>(keep<string>('')),
    callLogId:         Annotation<string | null>(keep<string | null>(null)),

    completedWindows:  Annotation<CompletedWindow[]>(keep<CompletedWindow[]>([])),
    answers:           Annotation<ParsedAnswer[]>(keep<ParsedAnswer[]>([])),

    openingSentiment:   Annotation<'WELL' | 'POORLY' | 'AMBIGUOUS' | null>(keep<'WELL' | 'POORLY' | 'AMBIGUOUS' | null>(null)),
    openingConcern:     Annotation<string | null>(keep<string | null>(null)),
    openingDisposition: Annotation<'PROCEEDED' | 'ENDED_NOT_READY' | 'REDIRECTED_GENERAL' | null>(keep<'PROCEEDED' | 'ENDED_NOT_READY' | 'REDIRECTED_GENERAL' | null>(null)),
    openingEndReason:   Annotation<string | null>(keep<string | null>(null)),
    openingCallLogId:   Annotation<string | null>(keep<string | null>(null)),

    wellbeingData:     Annotation<WellbeingData | null>(keep<WellbeingData | null>(null)),
    medicationEntries: Annotation<MedicationLogEntry[]>(keep<MedicationLogEntry[]>([])),
    conditionEntries:  Annotation<ConditionLogEntry[]>(keep<ConditionLogEntry[]>([])),
    error:             Annotation<string>(keep<string>('')),
});

export type HealthPostCallStateType = typeof HealthPostCallState.State;
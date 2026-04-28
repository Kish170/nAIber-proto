import { randomUUID } from 'crypto';
import type { DynamicQuestion, CompletedQuestion, CompletedWindow, HealthQuestionTopicExtended } from './HealthCheckState.js';

export function createDynamicQuestion(
    topic: HealthQuestionTopicExtended,
    questionText: string,
    questionType: DynamicQuestion['questionType'],
    source: DynamicQuestion['source'],
    relatedTo?: string
): DynamicQuestion {
    return { id: randomUUID(), topic, questionText, questionType, source, relatedTo, addedAt: Date.now() };
}

export function enqueue(pending: DynamicQuestion[], q: DynamicQuestion): DynamicQuestion[] {
    if (pending.some(p => p.id === q.id)) return pending;
    return [...pending, q];
}

export function markInProgress(
    pending: DynamicQuestion[],
    id: string
): { pending: DynamicQuestion[]; inProgress: DynamicQuestion | null } {
    const idx = pending.findIndex(q => q.id === id);
    if (idx === -1) return { pending, inProgress: null };
    const inProgress = pending[idx];
    return { pending: pending.filter((_, i) => i !== idx), inProgress };
}

export function markComplete(
    inProgress: DynamicQuestion | null,
    completed: CompletedQuestion[],
    windowId: string,
    disposition: CompletedQuestion['disposition']
): { inProgress: null; completed: CompletedQuestion[] } {
    if (!inProgress) return { inProgress: null, completed };
    const record: CompletedQuestion = {
        question: inProgress,
        windowId,
        disposition,
        completedAt: Date.now()
    };
    return { inProgress: null, completed: [...completed, record] };
}

export function dropOrMerge(
    pending: DynamicQuestion[],
    existing: DynamicQuestion,
    _incoming: DynamicQuestion
): DynamicQuestion[] {
    return pending.map(q => q.id === existing.id ? { ...q, source: 'tangent_merged' } : q);
}

export function next(pending: DynamicQuestion[]): DynamicQuestion | null {
    return pending[0] ?? null;
}

export function findExistingByTopic(
    pending: DynamicQuestion[],
    topic: HealthQuestionTopicExtended,
    relatedTo?: string
): DynamicQuestion | null {
    return pending.find(q =>
        q.topic === topic && (relatedTo ? q.relatedTo === relatedTo : true)
    ) ?? null;
}

export function summarizeCompleted(completed: CompletedWindow[]): Array<{
    windowId: string;
    questionId: string;
    questionText: string;
    topic: HealthQuestionTopicExtended;
    relatedTo?: string;
    disposition: string;
}> {
    return completed.map(w => ({
        windowId: w.windowId,
        questionId: w.question.id,
        questionText: w.question.questionText,
        topic: w.question.topic,
        relatedTo: w.question.relatedTo,
        disposition: w.disposition
    }));
}
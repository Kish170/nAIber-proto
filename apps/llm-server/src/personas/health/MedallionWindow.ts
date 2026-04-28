import { randomUUID } from 'crypto';
import type { BaseMessage } from '@langchain/core/messages';
import type { DynamicQuestion, CompletedWindow } from './HealthCheckState.js';

export function createWindowId(): string {
    return randomUUID();
}

export function openWindow(question: DynamicQuestion): {
    currentWindowId: string;
    currentWindowMessages: BaseMessage[];
} {
    return {
        currentWindowId: createWindowId(),
        currentWindowMessages: []
    };
}

export function closeWindow(
    windowId: string,
    question: DynamicQuestion,
    messages: BaseMessage[],
    disposition: CompletedWindow['disposition'],
    openedAt: number
): CompletedWindow {
    return {
        windowId,
        question,
        messages,
        disposition,
        openedAt,
        closedAt: Date.now()
    };
}
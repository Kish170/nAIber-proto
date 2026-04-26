import { z } from 'zod';
import { ConversationRepository } from '@naiber/shared-data';

export const flagCallEventSchema = {
    userId: z.string().describe('Elderly profile ID (UUID)'),
    conversationId: z.string().describe('ElevenLabs conversation ID for the current call'),
    eventType: z.enum(['distress', 'confusion', 'emergency']).describe('Type of event detected'),
    description: z.string().describe('Brief description of what was observed'),
    severity: z.enum(['low', 'medium', 'high']).optional().describe('Severity level of the event'),
};

export async function flagCallEventHandler(args: {
    userId: string;
    conversationId: string;
    eventType: string;
    description: string;
    severity?: string;
}) {
    const event = await ConversationRepository.createCallEvent({
        elderlyProfileId: args.userId,
        conversationId: args.conversationId,
        eventType: args.eventType,
        description: args.description,
        severity: args.severity,
    });

    return {
        id: event.id,
        eventType: event.eventType,
        severity: event.severity ?? null,
        detectedAt: event.detectedAt,
    };
}

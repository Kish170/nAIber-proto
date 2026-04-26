import { z } from 'zod';
import { GraphQueryRepository } from '../../rag/GraphQueryRepository.js';

const graphQuery = new GraphQueryRepository();

export const getSignificantEventsSchema = {
    userId: z.string().describe('Elderly profile ID (UUID)'),
    minScore: z.number().min(1).max(10).optional().describe('Minimum importance score (1-10, default 7)'),
};

export async function getSignificantEventsHandler(args: { userId: string; minScore?: number }) {
    const highlights = await graphQuery.getSignificantHighlights(
        args.userId,
        args.minScore ?? 7,
        10
    );

    return highlights.map(h => ({
        text: h.text,
        importanceScore: h.importanceScore,
        conversationDate: h.conversationDate,
    }));
}

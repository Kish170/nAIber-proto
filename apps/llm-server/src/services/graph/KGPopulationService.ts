import cosine from 'compute-cosine-similarity';
import { traceable } from 'langsmith/traceable';
import { getConversationTopics } from '../../personas/general/ConversationHandler.js';
import { GraphRepository } from '../../repositories/GraphRepository.js';
import { PostCallStateType } from '../../personas/general/post-call/PostCallState.js';

const HIGHLIGHT_TOPIC_SIMILARITY_THRESHOLD = 0.4;

export class KGPopulationService {

    populateNodes = traceable(
        async (state: PostCallStateType): Promise<void> => {
            const repo = new GraphRepository();
            try {
                const topics = await getConversationTopics(state.userId);
                const now = new Date().toISOString();

                await repo.mergeUser({ userId: state.userId, name: '' });

                await repo.mergeConversation({
                    conversationId: state.conversationId,
                    date: state.callDate || now.split('T')[0],
                    durationMinutes: state.callDurationMinutes,
                    callType: state.callType,
                    outcome: 'completed',
                });

                if (state.summaryId && state.summary) {
                    await repo.mergeSummary({
                        id: state.summaryId,
                        text: state.summary.summaryText,
                        createdAt: now,
                    });
                }

                for (const entry of state.highlightEntries) {
                    await repo.mergeHighlight({
                        id: entry.qdrantPointId,
                        qdrantPointId: entry.qdrantPointId,
                        text: entry.text,
                        importanceScore: entry.importanceScore,
                        createdAt: now,
                    });
                }

                for (const topic of topics) {
                    await repo.mergeTopic({
                        topicId: topic.id,
                        label: topic.topicName,
                        variations: topic.variations ?? [],
                        createdAt: now,
                        lastUpdated: now,
                    });
                }

                for (const person of state.extractedPersons) {
                    await repo.mergePerson({
                        id: person.id,
                        name: person.name,
                        role: person.role,
                    });
                }

                console.log('[KGPopulationService] populateNodes complete:', JSON.stringify({
                    userId: state.userId,
                    conversationId: state.conversationId,
                    highlightCount: state.highlightEntries.length,
                    topicCount: topics.length,
                    personCount: state.extractedPersons.length,
                }));
            } finally {
                await repo.close();
            }
        },
        { name: 'kg_populate_nodes', run_type: 'chain' }
    );

    populateRelationships = traceable(
        async (state: PostCallStateType): Promise<void> => {
            if (!state.summaryId) {
                console.warn('[KGPopulationService] No summaryId — skipping relationship creation');
                return;
            }

            const repo = new GraphRepository();
            try {
                const topics = await getConversationTopics(state.userId);
                const now = new Date().toISOString();

                await repo.linkUserToConversation({
                    userId: state.userId,
                    conversationId: state.conversationId,
                });

                await repo.linkConversationToSummary({
                    conversationId: state.conversationId,
                    summaryId: state.summaryId,
                    createdAt: now,
                });

                for (const entry of state.highlightEntries) {
                    await repo.linkConversationToHighlight({
                        conversationId: state.conversationId,
                        highlightQdrantPointId: entry.qdrantPointId,
                        createdAt: now,
                    });

                    await repo.linkSummaryToHighlight({
                        summaryId: state.summaryId,
                        highlightQdrantPointId: entry.qdrantPointId,
                    });
                }

                for (const match of state.topicMatchResults) {
                    const topic = topics.find(t =>
                        match.matchedExisting
                            ? t.id === match.existingTopicId
                            : t.topicName === match.topic
                    );
                    if (!topic) continue;

                    await repo.linkSummaryToTopic({
                        summaryId: state.summaryId,
                        topicId: topic.id,
                        similarityScore: match.similarity ?? 1.0,
                    });
                }

                let highlightTopicLinksCreated = 0;
                let highlightTopicLinksSkipped = 0;
                for (const entry of state.highlightEntries) {
                    for (const topic of topics) {
                        if (!topic.topicEmbedding?.length) continue;

                        const similarity = cosine(entry.embedding, topic.topicEmbedding) ?? 0;
                        if (similarity < HIGHLIGHT_TOPIC_SIMILARITY_THRESHOLD) {
                            highlightTopicLinksSkipped++;
                            continue;
                        }

                        await repo.linkHighlightToTopic({
                            highlightId: entry.qdrantPointId,
                            topicId: topic.id,
                            similarityScore: similarity,
                        });
                        highlightTopicLinksCreated++;
                    }
                }

                let userMentionsTopicCount = 0;
                for (const topic of topics) {
                    const isDiscussed = state.topicMatchResults.some((m: { matchedExisting: boolean; existingTopicId?: string; topic: string }) =>
                        m.matchedExisting ? m.existingTopicId === topic.id : m.topic === topic.topicName
                    );
                    if (!isDiscussed) continue;

                    await repo.upsertUserMentionsTopic({
                        userId: state.userId,
                        topicId: topic.id,
                        lastSeen: now,
                        firstSeen: now,
                    });
                    userMentionsTopicCount++;
                }

                const discussedTopics = topics.filter((t: { id: string; topicName: string }) =>
                    state.topicMatchResults.some((m: { matchedExisting: boolean; existingTopicId?: string; topic: string }) =>
                        m.matchedExisting ? m.existingTopicId === t.id : m.topic === t.topicName
                    )
                );

                let topicTopicLinksCreated = 0;
                for (let i = 0; i < discussedTopics.length; i++) {
                    for (let j = i + 1; j < discussedTopics.length; j++) {
                        await repo.upsertTopicRelatedToTopic({
                            fromTopicId: discussedTopics[i].id,
                            toTopicId: discussedTopics[j].id,
                            strength: 0.0,
                            coOccurrenceCount: 1,
                        });
                        topicTopicLinksCreated++;
                    }
                }

                let personTopicLinksCreated = 0;
                for (const person of state.extractedPersons) {
                    await repo.upsertUserMentionedPerson({
                        userId: state.userId,
                        personId: person.id,
                        context: person.context,
                        lastSeen: now,
                    });

                    for (const topic of discussedTopics) {
                        await repo.upsertPersonAssociatedWithTopic({
                            personId: person.id,
                            topicId: topic.id,
                            lastSeen: now,
                        });
                        personTopicLinksCreated++;
                    }
                }

                await repo.deriveInterestedInEdges(state.userId);

                console.log('[KGPopulationService] populateRelationships complete:', JSON.stringify({
                    highlightTopicLinksCreated,
                    highlightTopicLinksSkipped,
                    highlightTopicThreshold: HIGHLIGHT_TOPIC_SIMILARITY_THRESHOLD,
                    topicTopicLinksCreated,
                    personTopicLinksCreated,
                    userMentionsTopicCount,
                }));
            } finally {
                await repo.close();
            }
        },
        { name: 'kg_populate_relationships', run_type: 'chain' }
    );
}
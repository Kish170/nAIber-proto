import { Session } from 'neo4j-driver';
import { Neo4jClient } from '../clients/Neo4jClient.js';
import type {
    UserNode,
    TopicNode,
    HighlightNode,
    SummaryNode,
    ConversationNode,
    PersonNode,
    LinkUserToConversationParams,
    LinkConversationToSummaryParams,
    LinkConversationToHighlightParams,
    LinkSummaryToHighlightParams,
    UserMentionsTopicParams,
    TopicRelatedToTopicParams,
    HighlightMentionsTopicParams,
    SummaryMentionsTopicParams,
    UserMentionedPersonParams,
    PersonAssociatedWithTopicParams,
} from '../types/graph.js';

export class GraphRepository {
    protected session: Session;

    constructor() {
        this.session = Neo4jClient.getInstance().session();
    }

    async close(): Promise<void> {
        await this.session.close();
    }

    async mergeUser(params: UserNode): Promise<void> {
        try {
            await this.session.run(
                `MERGE (u:User {userId: $userId})
                 SET u.name = $name`,
                params
            );
        } catch (error) {
            console.error('[GraphRepository] Error merging User:', error);
            throw error;
        }
    }

    async mergeTopic(params: TopicNode): Promise<void> {
        try {
            await this.session.run(
                `MERGE (t:Topic {topicId: $topicId})
                 SET t.label       = $label,
                     t.category    = $category,
                     t.variations  = $variations,
                     t.createdAt   = $createdAt,
                     t.lastUpdated = $lastUpdated`,
                params
            );
        } catch (error) {
            console.error('[GraphRepository] Error merging Topic:', error);
            throw error;
        }
    }

    async mergeHighlight(params: HighlightNode): Promise<void> {
        try {
            await this.session.run(
                `MERGE (h:Highlight {qdrantPointId: $qdrantPointId})
                 SET h.id              = $id,
                     h.text            = $text,
                     h.mood            = $mood,
                     h.importanceScore = $importanceScore,
                     h.createdAt       = $createdAt`,
                params
            );
        } catch (error) {
            console.error('[GraphRepository] Error merging Highlight:', error);
            throw error;
        }
    }

    async mergeSummary(params: SummaryNode): Promise<void> {
        try {
            await this.session.run(
                `MERGE (s:Summary {id: $id})
                 SET s.text      = $text,
                     s.createdAt = $createdAt`,
                params
            );
        } catch (error) {
            console.error('[GraphRepository] Error merging Summary:', error);
            throw error;
        }
    }

    async mergeConversation(params: ConversationNode): Promise<void> {
        try {
            await this.session.run(
                `MERGE (c:Conversation {conversationId: $conversationId})
                 SET c.startedAt = $startedAt,
                     c.endedAt   = $endedAt,
                     c.callType  = $callType,
                     c.outcome   = $outcome`,
                params
            );
        } catch (error) {
            console.error('[GraphRepository] Error merging Conversation:', error);
            throw error;
        }
    }

    async mergePerson(params: PersonNode): Promise<void> {
        try {
            await this.session.run(
                `MERGE (p:Person {id: $id})
                 SET p.name = $name,
                     p.role = $role`,
                params
            );
        } catch (error) {
            console.error('[GraphRepository] Error merging Person:', error);
            throw error;
        }
    }

    async linkUserToConversation(params: LinkUserToConversationParams): Promise<void> {
        try {
            await this.session.run(
                `MATCH (u:User {userId: $userId})
                 MATCH (c:Conversation {conversationId: $conversationId})
                 MERGE (u)-[:HAS_CONVERSATION]->(c)`,
                params
            );
        } catch (error) {
            console.error('[GraphRepository] Error linking User to Conversation:', error);
            throw error;
        }
    }

    async linkConversationToSummary(params: LinkConversationToSummaryParams): Promise<void> {
        try {
            await this.session.run(
                `MATCH (c:Conversation {conversationId: $conversationId})
                 MATCH (s:Summary {id: $summaryId})
                 MERGE (c)-[r:HAS_SUMMARY]->(s)
                 SET r.createdAt = $createdAt`,
                params
            );
        } catch (error) {
            console.error('[GraphRepository] Error linking Conversation to Summary:', error);
            throw error;
        }
    }

    async linkConversationToHighlight(params: LinkConversationToHighlightParams): Promise<void> {
        try {
            await this.session.run(
                `MATCH (c:Conversation {conversationId: $conversationId})
                 MATCH (h:Highlight {qdrantPointId: $highlightQdrantPointId})
                 MERGE (c)-[r:HAS_HIGHLIGHT]->(h)
                 SET r.createdAt = $createdAt`,
                params
            );
        } catch (error) {
            console.error('[GraphRepository] Error linking Conversation to Highlight:', error);
            throw error;
        }
    }

    async linkSummaryToTopic(params: SummaryMentionsTopicParams): Promise<void> {
        try {
            await this.session.run(
                `MATCH (s:Summary {id: $summaryId})
                 MATCH (t:Topic {topicId: $topicId})
                 MERGE (s)-[r:MENTIONS]->(t)
                 SET r.similarityScore = $similarityScore`,
                params
            );
        } catch (error) {
            console.error('[GraphRepository] Error linking Summary to Topic:', error);
            throw error;
        }
    }

    async linkHighlightToTopic(params: HighlightMentionsTopicParams): Promise<void> {
        try {
            await this.session.run(
                `MATCH (h:Highlight {qdrantPointId: $highlightId})
                 MATCH (t:Topic {topicId: $topicId})
                 MERGE (h)-[r:MENTIONS]->(t)
                 SET r.similarityScore = $similarityScore`,
                params
            );
        } catch (error) {
            console.error('[GraphRepository] Error linking Highlight to Topic:', error);
            throw error;
        }
    }

    async linkSummaryToHighlight(params: LinkSummaryToHighlightParams): Promise<void> {
        try {
            await this.session.run(
                `MATCH (s:Summary {id: $summaryId})
                 MATCH (h:Highlight {qdrantPointId: $highlightQdrantPointId})
                 MERGE (s)-[:SUMMARIZES]->(h)`,
                params
            );
        } catch (error) {
            console.error('[GraphRepository] Error linking Summary to Highlight:', error);
            throw error;
        }
    }

    async upsertUserMentionsTopic(params: UserMentionsTopicParams): Promise<void> {
        try {
            await this.session.run(
                `MATCH (u:User {userId: $userId})
                 MATCH (t:Topic {topicId: $topicId})
                 MERGE (u)-[r:MENTIONS]->(t)
                 ON CREATE SET r.count     = 1,
                               r.firstSeen = $firstSeen,
                               r.lastSeen  = $lastSeen
                 ON MATCH  SET r.count     = r.count + 1,
                               r.lastSeen  = $lastSeen`,
                params
            );
        } catch (error) {
            console.error('[GraphRepository] Error upserting User MENTIONS Topic:', error);
            throw error;
        }
    }

    async upsertTopicRelatedToTopic(params: TopicRelatedToTopicParams): Promise<void> {
        try {
            await this.session.run(
                `MATCH (a:Topic {topicId: $fromTopicId})
                 MATCH (b:Topic {topicId: $toTopicId})
                 MERGE (a)-[r:RELATED_TO]->(b)
                 SET r.strength          = $strength,
                     r.coOccurrenceCount = $coOccurrenceCount`,
                params
            );
        } catch (error) {
            console.error('[GraphRepository] Error upserting Topic RELATED_TO Topic:', error);
            throw error;
        }
    }

    async deriveInterestedInEdges(userId: string, minCount: number = 3, recencyDays: number = 30): Promise<void> {
        try {
            const cutoff = new Date(Date.now() - recencyDays * 24 * 60 * 60 * 1000).toISOString();
            await this.session.run(
                `MATCH (u:User {userId: $userId})-[m:MENTIONS]->(t:Topic)
                 WHERE m.count >= $minCount AND m.lastSeen >= $cutoff
                 MERGE (u)-[i:INTERESTED_IN]->(t)
                 SET i.strength   = toFloat(m.count) / 10.0,
                     i.count      = m.count,
                     i.derivedAt  = $derivedAt`,
                { userId, minCount, cutoff, derivedAt: new Date().toISOString() }
            );
        } catch (error) {
            console.error('[GraphRepository] Error deriving INTERESTED_IN edges:', error);
            throw error;
        }
    }

    async upsertUserMentionedPerson(params: UserMentionedPersonParams): Promise<void> {
        try {
            await this.session.run(
                `MATCH (u:User {userId: $userId})
                 MATCH (p:Person {id: $personId})
                 MERGE (u)-[r:MENTIONED]->(p)
                 ON CREATE SET r.count    = 1,
                               r.context  = $context,
                               r.lastSeen = $lastSeen
                 ON MATCH  SET r.count    = r.count + 1,
                               r.lastSeen = $lastSeen`,
                params
            );
        } catch (error) {
            console.error('[GraphRepository] Error upserting User MENTIONED Person:', error);
            throw error;
        }
    }

    async upsertPersonAssociatedWithTopic(params: PersonAssociatedWithTopicParams): Promise<void> {
        try {
            await this.session.run(
                `MATCH (p:Person {id: $personId})
                 MATCH (t:Topic {topicId: $topicId})
                 MERGE (p)-[r:ASSOCIATED_WITH]->(t)
                 ON CREATE SET r.count    = 1,
                               r.lastSeen = $lastSeen
                 ON MATCH  SET r.count    = r.count + 1,
                               r.lastSeen = $lastSeen`,
                params
            );
        } catch (error) {
            console.error('[GraphRepository] Error upserting Person ASSOCIATED_WITH Topic:', error);
            throw error;
        }
    }
}

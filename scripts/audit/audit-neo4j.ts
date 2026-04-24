/**
 * Neo4j data quality audit for a given userId.
 *
 * Usage: npx tsx scripts/audit/audit-neo4j.ts [userId]
 *   If no userId provided, finds the user with the most data.
 *
 * Prerequisites: NEO4J_URI, NEO4J_USERNAME, NEO4J_PASSWORD, DATABASE_URL in .env
 */
import 'dotenv/config';
import neo4j, { Driver } from 'neo4j-driver';
import { PrismaClient } from '../../generated/prisma/index.js';

async function findBestUserId(): Promise<string> {
    const prisma = new PrismaClient();
    try {
        const profiles = await prisma.elderlyProfile.findMany({
            include: { _count: { select: { conversationSummaries: true } } },
        });
        const best = profiles.sort((a, b) => b._count.conversationSummaries - a._count.conversationSummaries)[0];
        if (!best) throw new Error('No profiles found');
        console.log(`Auto-selected user: "${best.name}" (${best.id})\n`);
        return best.id;
    } finally {
        await prisma.$disconnect();
    }
}

async function runQuery<T>(driver: Driver, query: string, params: Record<string, any> = {}): Promise<T[]> {
    const session = driver.session({ database: process.env.NEO4J_DATABASE || 'neo4j' });
    try {
        const result = await session.run(query, params);
        return result.records.map(r => r.toObject() as T);
    } finally {
        await session.close();
    }
}

async function main() {
    const userId = process.argv[2] || await findBestUserId();

    const driver = neo4j.driver(
        process.env.NEO4J_URI || 'bolt://localhost:7687',
        neo4j.auth.basic(
            process.env.NEO4J_USERNAME || 'neo4j',
            process.env.NEO4J_PASSWORD!
        ),
        { disableLosslessIntegers: true }
    );

    try {
        console.log('=== NEO4J DATA AUDIT ===');
        console.log(`User ID: ${userId}`);
        console.log(`Neo4j URI: ${process.env.NEO4J_URI || 'bolt://localhost:7687'}\n`);

        // --- Node counts ---
        console.log('--- Node Counts ---');
        const userExists = await runQuery<{ count: number }>(driver,
            `MATCH (u:User {userId: $userId}) RETURN count(u) AS count`, { userId });
        console.log(`User node: ${userExists[0]?.count ?? 0}`);

        if ((userExists[0]?.count ?? 0) === 0) {
            console.log('\nUser node not found in Neo4j. Audit complete.');
            return;
        }

        const conversations = await runQuery<{ count: number }>(driver,
            `MATCH (u:User {userId: $userId})-[:HAS_CONVERSATION]->(c:Conversation) RETURN count(c) AS count`, { userId });
        console.log(`Conversations: ${conversations[0]?.count ?? 0}`);

        const summaries = await runQuery<{ count: number }>(driver,
            `MATCH (u:User {userId: $userId})-[:HAS_CONVERSATION]->(c)-[:HAS_SUMMARY]->(s:Summary) RETURN count(DISTINCT s) AS count`, { userId });
        console.log(`Summaries: ${summaries[0]?.count ?? 0}`);

        const highlights = await runQuery<{ count: number }>(driver,
            `MATCH (u:User {userId: $userId})-[:HAS_CONVERSATION]->(c)-[:HAS_HIGHLIGHT]->(h:Highlight) RETURN count(DISTINCT h) AS count`, { userId });
        console.log(`Highlights: ${highlights[0]?.count ?? 0}`);

        const topics = await runQuery<{ count: number }>(driver,
            `MATCH (u:User {userId: $userId})-[:MENTIONS]->(t:Topic) RETURN count(DISTINCT t) AS count`, { userId });
        console.log(`Topics (via MENTIONS): ${topics[0]?.count ?? 0}`);

        const persons = await runQuery<{ count: number }>(driver,
            `MATCH (u:User {userId: $userId})-[:MENTIONED]->(p:Person) RETURN count(DISTINCT p) AS count`, { userId });
        console.log(`Persons: ${persons[0]?.count ?? 0}`);

        // --- Topic quality ---
        console.log('\n--- Topic Quality ---');
        const topicList = await runQuery<{ label: string; topicId: string; count: number }>(driver,
            `MATCH (u:User {userId: $userId})-[r:MENTIONS]->(t:Topic)
             RETURN t.label AS label, t.topicId AS topicId, r.count AS count
             ORDER BY r.count DESC`, { userId });

        const genericPatterns = ['conversation', 'chat', 'talking', 'discussion', 'general', 'stuff', 'things'];
        const genericTopics = topicList.filter(t => genericPatterns.some(p => t.label?.toLowerCase().includes(p)));

        console.log(`Total topics: ${topicList.length}`);
        console.log(`Generic/low-quality topics: ${genericTopics.length}`);
        if (genericTopics.length > 0) {
            console.log(`  Flagged: ${genericTopics.map(t => `"${t.label}"`).join(', ')}`);
        }
        console.log('\nAll topics:');
        for (const t of topicList) {
            const flag = genericPatterns.some(p => t.label?.toLowerCase().includes(p)) ? ' ⚠ GENERIC' : '';
            console.log(`  "${t.label}" (mentions: ${t.count ?? 'N/A'})${flag}`);
        }

        // --- Person quality ---
        console.log('\n--- Person Quality ---');
        const personList = await runQuery<{ name: string; role: string | null; id: string; count: number }>(driver,
            `MATCH (u:User {userId: $userId})-[r:MENTIONED]->(p:Person)
             RETURN p.name AS name, p.role AS role, p.id AS id, r.count AS count
             ORDER BY r.count DESC`, { userId });

        const genericPersonPatterns = ['someone', 'they', 'people', 'person', 'user'];
        const genericPersons = personList.filter(p =>
            genericPersonPatterns.some(pat => p.name?.toLowerCase().includes(pat))
        );

        console.log(`Total persons: ${personList.length}`);
        console.log(`Generic/low-quality persons: ${genericPersons.length}`);
        if (genericPersons.length > 0) {
            console.log(`  Flagged: ${genericPersons.map(p => `"${p.name}"`).join(', ')}`);
        }
        console.log('\nAll persons:');
        for (const p of personList) {
            const flag = genericPersonPatterns.some(pat => p.name?.toLowerCase().includes(pat)) ? ' ⚠ GENERIC' : '';
            console.log(`  "${p.name}" (role: ${p.role ?? 'none'}, mentions: ${p.count ?? 'N/A'})${flag}`);
        }

        // --- Orphan nodes ---
        console.log('\n--- Orphan Nodes ---');
        const orphanHighlights = await runQuery<{ count: number }>(driver,
            `MATCH (u:User {userId: $userId})-[:HAS_CONVERSATION]->(c)-[:HAS_HIGHLIGHT]->(h:Highlight)
             WHERE NOT (h)-[:MENTIONS]->(:Topic)
             RETURN count(DISTINCT h) AS count`, { userId });
        console.log(`Highlights with no topic links: ${orphanHighlights[0]?.count ?? 0}`);

        const orphanTopics = await runQuery<{ count: number; labels: string[] }>(driver,
            `MATCH (u:User {userId: $userId})-[:MENTIONS]->(t:Topic)
             WHERE NOT (:Highlight)-[:MENTIONS]->(t)
             RETURN count(DISTINCT t) AS count, collect(t.label) AS labels`, { userId });
        console.log(`Topics with no highlight links: ${orphanTopics[0]?.count ?? 0}`);
        if ((orphanTopics[0]?.count ?? 0) > 0) {
            console.log(`  Labels: ${(orphanTopics[0]?.labels ?? []).join(', ')}`);
        }

        const orphanPersons = await runQuery<{ count: number; names: string[] }>(driver,
            `MATCH (u:User {userId: $userId})-[:MENTIONED]->(p:Person)
             WHERE NOT (p)-[:ASSOCIATED_WITH]->(:Topic)
             RETURN count(DISTINCT p) AS count, collect(p.name) AS names`, { userId });
        console.log(`Persons with no topic associations: ${orphanPersons[0]?.count ?? 0}`);
        if ((orphanPersons[0]?.count ?? 0) > 0) {
            console.log(`  Names: ${(orphanPersons[0]?.names ?? []).join(', ')}`);
        }

        // --- Relationship density ---
        console.log('\n--- Relationship Density ---');
        const topicRelations = await runQuery<{ count: number }>(driver,
            `MATCH (u:User {userId: $userId})-[:MENTIONS]->(t:Topic)-[r:RELATED_TO]->(t2:Topic)
             RETURN count(r) AS count`, { userId });
        console.log(`Topic-Topic RELATED_TO edges: ${topicRelations[0]?.count ?? 0}`);

        const highlightTopicLinks = await runQuery<{ count: number }>(driver,
            `MATCH (u:User {userId: $userId})-[:HAS_CONVERSATION]->(c)-[:HAS_HIGHLIGHT]->(h)-[r:MENTIONS]->(t:Topic)
             RETURN count(r) AS count`, { userId });
        console.log(`Highlight-Topic MENTIONS edges: ${highlightTopicLinks[0]?.count ?? 0}`);

        const personTopicLinks = await runQuery<{ count: number }>(driver,
            `MATCH (u:User {userId: $userId})-[:MENTIONED]->(p)-[r:ASSOCIATED_WITH]->(t:Topic)
             RETURN count(r) AS count`, { userId });
        console.log(`Person-Topic ASSOCIATED_WITH edges: ${personTopicLinks[0]?.count ?? 0}`);

        // --- Suspicious patterns ---
        console.log('\n--- Suspicious Patterns ---');
        const allRelatedTo = await runQuery<{ strength: number; coOccurrenceCount: number }>(driver,
            `MATCH (u:User {userId: $userId})-[:MENTIONS]->(t:Topic)-[r:RELATED_TO]->(t2:Topic)
             RETURN r.strength AS strength, r.coOccurrenceCount AS coOccurrenceCount`, { userId });

        const allStrength1 = allRelatedTo.every(r => r.strength === 1.0);
        console.log(`All RELATED_TO strength=1.0: ${allStrength1} (${allStrength1 ? '⚠ hardcoded — no differentiation' : 'varies'})`);

        const avgCoOccurrence = allRelatedTo.length > 0
            ? allRelatedTo.reduce((a, r) => a + (r.coOccurrenceCount ?? 0), 0) / allRelatedTo.length
            : 0;
        console.log(`Average co-occurrence count: ${avgCoOccurrence.toFixed(1)}`);

        // Check INTERESTED_IN edges (derived — should they exist?)
        const interestedIn = await runQuery<{ count: number }>(driver,
            `MATCH (u:User {userId: $userId})-[r:INTERESTED_IN]->(t:Topic)
             RETURN count(r) AS count`, { userId });
        console.log(`INTERESTED_IN edges: ${interestedIn[0]?.count ?? 0} (${(interestedIn[0]?.count ?? 0) === 0 ? '⚠ deriveInterestedInEdges never called' : 'present'})`);

        // Check highlight importanceScore distribution
        const importanceScores = await runQuery<{ score: number; count: number }>(driver,
            `MATCH (u:User {userId: $userId})-[:HAS_CONVERSATION]->(c)-[:HAS_HIGHLIGHT]->(h:Highlight)
             RETURN h.importanceScore AS score, count(*) AS count
             ORDER BY score`, { userId });
        console.log(`\nHighlight importanceScore distribution:`);
        for (const { score, count } of importanceScores) {
            console.log(`  score=${score}: ${count} highlights ${score === 1.0 ? '(⚠ all hardcoded to 1.0)' : ''}`);
        }

        console.log('\n=== AUDIT COMPLETE ===');
    } finally {
        await driver.close();
    }
}

main().catch(err => {
    console.error('Audit failed:', err);
    process.exit(1);
});
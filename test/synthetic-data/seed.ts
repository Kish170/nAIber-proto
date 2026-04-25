/**
 * Synthetic data seed script — populates Postgres, Qdrant, and Neo4j with 3 test users.
 *
 * NOTE: Calls OpenAI text-embedding-3-small for every highlight across all 3 users.
 * Estimated cost: ~120–150 embeddings × 1536 dims ≈ $0.01–0.02 (negligible).
 * DO NOT run in CI. Run manually after post-call pipeline improvements land.
 *
 * Usage: npx tsx test/synthetic-data/seed.ts
 *
 * Required env vars: OPENAI_API_KEY, DATABASE_URL, QDRANT_URL, QDRANT_API_KEY,
 *   QDRANT_COLLECTION, NEO4J_URI, NEO4J_USERNAME, NEO4J_PASSWORD, PHONE_NUMBER
 */

import 'dotenv/config';
import { randomUUID } from 'crypto';
import { PrismaClient } from '../../generated/prisma/index.js';
import { Neo4jClient } from '../../packages/shared-clients/src/Neo4jClient.js';
import { GraphRepository } from '../../apps/llm-server/src/repositories/GraphRepository.js';
import { VectorStoreClient, VectorStoreConfigs } from '../../packages/shared-clients/src/VectorStoreClient.js';
import { OpenAIEmbeddings } from '@langchain/openai';

const REQUIRED_ENV = [
    'OPENAI_API_KEY',
    'DATABASE_URL',
    'QDRANT_URL',
    'QDRANT_API_KEY',
    'QDRANT_COLLECTION',
    'NEO4J_URI',
    'NEO4J_USERNAME',
    'NEO4J_PASSWORD',
    'PHONE_NUMBER',
] as const;

for (const key of REQUIRED_ENV) {
    if (!process.env[key]) throw new Error(`Missing required env var: ${key}`);
}

const QDRANT_URL = process.env.QDRANT_URL!;
const QDRANT_API_KEY = process.env.QDRANT_API_KEY!;
const QDRANT_COLLECTION = process.env.QDRANT_COLLECTION!;

const TOPICS = {
    gardening:        { id: 'a1000000-0000-0000-0000-000000000001', label: 'gardening',        variations: ['garden work', 'planting', 'flowers', 'roses', 'yard work'],         category: 'Hobby' },
    baking:           { id: 'a1000000-0000-0000-0000-000000000002', label: 'baking',            variations: ['cookies', 'bread', 'recipes', 'cooking', 'kitchen'],                 category: 'Hobby' },
    familyVisits:     { id: 'a1000000-0000-0000-0000-000000000003', label: 'family visits',     variations: ['grandchildren', 'daughter', 'son', 'grandkids', 'family call'],      category: 'Relationships' },
    healthManagement: { id: 'a1000000-0000-0000-0000-000000000004', label: 'health management', variations: ['medications', 'doctor appointment', 'pain', 'exercise', 'blood pressure'], category: 'Health' },
    socialActivities: { id: 'a1000000-0000-0000-0000-000000000005', label: 'social activities', variations: ['bridge', 'card games', 'friends', 'club', 'community'],              category: 'Social' },
    birdWatching:     { id: 'a1000000-0000-0000-0000-000000000006', label: 'bird watching',     variations: ['birds', 'cardinal', 'wildlife', 'feeder', 'backyard'],               category: 'Hobby' },
    reading:          { id: 'a1000000-0000-0000-0000-000000000007', label: 'reading',           variations: ['books', 'novel', 'mystery', 'library', 'audiobook'],                 category: 'Hobby' },
    neighbourhood:    { id: 'a1000000-0000-0000-0000-000000000008', label: 'neighbourhood',     variations: ['neighbour', 'local area', 'street', 'community events'],             category: 'Social' },
    music:            { id: 'a1000000-0000-0000-0000-000000000009', label: 'music',             variations: ['radio', 'songs', 'classical', 'concert', 'listening'],               category: 'Hobby' },
    weather:          { id: 'a1000000-0000-0000-0000-000000000010', label: 'weather',           variations: ['seasons', 'rain', 'cold', 'sunshine', 'temperature'],                category: 'General' },
    cooking:          { id: 'a1000000-0000-0000-0000-000000000011', label: 'cooking',           variations: ['meals', 'recipe', 'dinner', 'soup', 'comfort food'],                 category: 'Hobby' },
    memoryHealth:     { id: 'a1000000-0000-0000-0000-000000000012', label: 'memory health',     variations: ['remembering', 'forgetfulness', 'mental sharpness', 'brain exercise'], category: 'Health' },
} as const;

type TopicKey = keyof typeof TOPICS;

interface ConversationDef {
    convId: string;
    callSid: string;
    daysAgo: number;
    durationMinutes: number;
    topics: TopicKey[];
    summary: string;
    highlights: { text: string; importanceScore: number }[];
    persons: { name: string; role: string; context: string; topicKeys: TopicKey[] }[];
}

interface UserDef {
    name: string;
    age: number;
    phone: string;
    gender: 'MALE' | 'FEMALE';
    educationLevel: string;
    interests: string[];
    dislikes: string[];
    callFrequency: string;
    healthConditions: { condition: string; severity: string; notes: string }[];
    medications: { name: string; dosage: string; notes: string; prn?: boolean }[];
    caregiver: { name: string; email: string; phone: string; relationship: string };
    conversations: ConversationDef[];
}

// ---------------------------------------------------------------------------
// Margaret Thompson
// ---------------------------------------------------------------------------

const MARGARET: UserDef = {
    name: 'Margaret Thompson',
    age: 72,
    phone: process.env.PHONE_NUMBER!,
    gender: 'FEMALE',
    educationLevel: 'SECONDARY_OR_HIGH_SCHOOL',
    interests: ['Gardening', 'Baking cookies', 'Watching birds', 'Reading mystery novels', 'Talking with grandchildren', 'Playing bridge with friends'],
    dislikes: ['Cold weather', 'Loud noises', 'Fast-paced action movies', 'Spicy food'],
    callFrequency: 'DAILY',
    healthConditions: [
        { condition: 'Type 2 Diabetes',  severity: 'Moderate', notes: 'Well-controlled with medication and diet' },
        { condition: 'Hypertension',      severity: 'Mild',     notes: 'Controlled with medication' },
        { condition: 'Osteoarthritis',    severity: 'Moderate', notes: 'Primarily affects knees and hands' },
    ],
    medications: [
        { name: 'Metformin',   dosage: '500mg',    notes: 'For diabetes management. Take with meals.' },
        { name: 'Lisinopril',  dosage: '10mg',     notes: 'For blood pressure. Take in the morning.' },
        { name: 'Vitamin D3',  dosage: '2000 IU',  notes: 'Supplement for bone health' },
        { name: 'Ibuprofen',   dosage: '200mg',    notes: 'For arthritis pain, as needed', prn: true },
    ],
    caregiver: { name: 'Sarah Thompson', email: 'sarah.thompson@email.com', phone: '+1234567890', relationship: 'DAUGHTER' },
    conversations: [
        {
            convId: 'conv_mg_001', callSid: 'CA_mg_001', daysAgo: 28, durationMinutes: 8,
            topics: ['gardening', 'weather'],
            summary: 'Margaret spent the morning pruning rose bushes despite the cold. Her hands were aching from the arthritis, but she was determined to get the garden ready for spring. She mentioned rain expected later in the week and was worried about her new seedlings.',
            highlights: [
                { text: 'Spent the morning pruning the rose bushes despite the cold, hands aching more than usual', importanceScore: 0.9 },
                { text: 'Rain expected this week — worried about the new seedlings getting waterlogged', importanceScore: 0.7 },
            ],
            persons: [],
        },
        {
            convId: 'conv_mg_002', callSid: 'CA_mg_002', daysAgo: 26, durationMinutes: 9,
            topics: ['baking', 'familyVisits'],
            summary: 'Margaret baked lemon shortbread with granddaughter Emily over video call. Emily measured the flour herself for the first time. Sarah called afterward to say Emily was still talking about it at dinner. A warm and emotionally significant call.',
            highlights: [
                { text: 'Baked lemon shortbread with granddaughter Emily over video call — Emily measured the flour herself', importanceScore: 1.0 },
                { text: 'Sarah called after to say Emily kept talking about baking all evening', importanceScore: 1.0 },
            ],
            persons: [
                { name: 'Emily', role: 'granddaughter', context: 'Baked lemon shortbread with granddaughter Emily over video call — Emily measured the flour herself', topicKeys: ['baking', 'familyVisits'] },
                { name: 'Sarah', role: 'daughter', context: 'Sarah called after to say Emily kept talking about baking all evening', topicKeys: ['familyVisits'] },
            ],
        },
        {
            convId: 'conv_mg_003', callSid: 'CA_mg_003', daysAgo: 24, durationMinutes: 7,
            topics: ['birdWatching', 'gardening'],
            summary: 'Margaret spotted a pair of goldfinches at her new bird feeder for the first time. She was delighted. Her neighbour Tom also brought over some compost for the vegetable patch, which she appreciated greatly.',
            highlights: [
                { text: 'First spotted a pair of goldfinches at the new feeder — had not seen them since last spring', importanceScore: 0.8 },
                { text: 'Tom next door brought over some compost for the vegetable patch', importanceScore: 1.0 },
            ],
            persons: [
                { name: 'Tom', role: 'neighbour', context: 'Tom next door brought over some compost for the vegetable patch', topicKeys: ['gardening'] },
            ],
        },
        {
            convId: 'conv_mg_004', callSid: 'CA_mg_004', daysAgo: 22, durationMinutes: 10,
            topics: ['healthManagement', 'socialActivities'],
            summary: 'Dr. Patel reviewed Margaret\'s blood pressure at her check-up — down to 128/82, the best reading in two years. She was very pleased. In the evening she went to her bridge game with the Tuesday group, which ran long and she stayed for tea.',
            highlights: [
                { text: 'Dr. Patel reviewed blood pressure readings — down to 128/82, best in two years', importanceScore: 1.0 },
                { text: 'Bridge game with the Tuesday group went long, stayed for tea afterward', importanceScore: 0.8 },
            ],
            persons: [
                { name: 'Dr. Patel', role: 'physician', context: 'Dr. Patel reviewed blood pressure readings — down to 128/82, best in two years', topicKeys: ['healthManagement'] },
            ],
        },
        {
            convId: 'conv_mg_005', callSid: 'CA_mg_005', daysAgo: 20, durationMinutes: 8,
            topics: ['gardening', 'birdWatching', 'weather'],
            summary: 'Margaret planted dahlia tubers earlier than usual because of the mild April weather. While planting, she spotted a female cardinal at the feeder and mentioned that Tom would be pleased to hear about it. A relaxed and contented call.',
            highlights: [
                { text: 'Planted the dahlia tubers earlier than usual because the weather has been unusually mild this April', importanceScore: 0.8 },
                { text: 'Spotted a female cardinal feeding while planting — Tom would be pleased to know', importanceScore: 1.0 },
            ],
            persons: [],
        },
        {
            convId: 'conv_mg_006', callSid: 'CA_mg_006', daysAgo: 18, durationMinutes: 9,
            topics: ['baking', 'familyVisits'],
            summary: 'Margaret doubled a shortbread recipe for Emily\'s school fundraiser — her first time doubling it. Sarah is driving Emily over next Saturday to help decorate the biscuits together. Margaret sounded excited and purposeful.',
            highlights: [
                { text: 'Made a batch of shortbread for Emily\'s school fundraiser — doubled the recipe for the first time', importanceScore: 0.9 },
                { text: 'Sarah driving Emily over next Saturday to help decorate the biscuits', importanceScore: 1.0 },
            ],
            persons: [
                { name: 'Sarah', role: 'daughter', context: 'Sarah driving Emily over next Saturday to help decorate the biscuits', topicKeys: ['familyVisits', 'baking'] },
                { name: 'Emily', role: 'granddaughter', context: 'Made a batch of shortbread for Emily\'s school fundraiser — doubled the recipe for the first time', topicKeys: ['baking', 'familyVisits'] },
            ],
        },
        {
            convId: 'conv_mg_007', callSid: 'CA_mg_007', daysAgo: 16, durationMinutes: 7,
            topics: ['healthManagement', 'gardening'],
            summary: 'Margaret had an arthritis flare after two hours of weeding and had to take ibuprofen mid-afternoon. Her fingers were visibly swollen. Dr. Patel had suggested lighter gardening gloves with grip support, which she plans to order.',
            highlights: [
                { text: 'Arthritis flare after two hours weeding — had to take ibuprofen mid-afternoon, fingers swollen', importanceScore: 0.9 },
                { text: 'Dr. Patel suggested lighter gardening gloves with grip support for the hands', importanceScore: 1.0 },
            ],
            persons: [
                { name: 'Dr. Patel', role: 'physician', context: 'Dr. Patel suggested lighter gardening gloves with grip support for the hands', topicKeys: ['healthManagement', 'gardening'] },
            ],
        },
        {
            convId: 'conv_mg_008', callSid: 'CA_mg_008', daysAgo: 14, durationMinutes: 8,
            topics: ['reading', 'socialActivities'],
            summary: 'Margaret finished a new Tana French novel in three days and declared it her best since The Likeness. She recommended it to her bridge club and three of the ladies are already starting it this week. Looking forward to a group discussion.',
            highlights: [
                { text: 'Finished the new Tana French novel in three days — best ending she has written since The Likeness', importanceScore: 0.8 },
                { text: 'Recommended it to the bridge club, three of the ladies are starting it this week', importanceScore: 0.9 },
            ],
            persons: [],
        },
        {
            convId: 'conv_mg_009', callSid: 'CA_mg_009', daysAgo: 12, durationMinutes: 7,
            topics: ['gardening', 'birdWatching'],
            summary: 'The goldfinches are back at the feeder every morning — Margaret counts six or seven at peak. She also moved the compost bin closer to the raised bed, making it much easier for Tom to help fill. Cheerful and outdoorsy call.',
            highlights: [
                { text: 'The goldfinches are back at the feeder every morning — counts six or seven at peak', importanceScore: 0.8 },
                { text: 'Moved the compost bin closer to the raised bed, much easier for Tom to help fill', importanceScore: 1.0 },
            ],
            persons: [
                { name: 'Tom', role: 'neighbour', context: 'Moved the compost bin closer to the raised bed, much easier for Tom to help fill', topicKeys: ['gardening'] },
            ],
        },
        {
            convId: 'conv_mg_010', callSid: 'CA_mg_010', daysAgo: 10, durationMinutes: 10,
            topics: ['baking', 'familyVisits', 'healthManagement'],
            summary: 'Emily helped make scones and handled the rolling herself. Margaret\'s knees meant she could not stand long, so she used the perching stool her physiotherapist recommended — it made a real difference. Emily was proud of herself.',
            highlights: [
                { text: 'Granddaughter Emily helped make scones, handled the rolling herself — Margaret\'s knees meant she could not stand long', importanceScore: 1.0 },
                { text: 'Used the perching stool from the physio — made a real difference standing at the counter', importanceScore: 0.9 },
            ],
            persons: [
                { name: 'Emily', role: 'granddaughter', context: 'Granddaughter Emily helped make scones, handled the rolling herself — Margaret\'s knees meant she could not stand long', topicKeys: ['baking', 'familyVisits'] },
            ],
        },
        {
            convId: 'conv_mg_011', callSid: 'CA_mg_011', daysAgo: 8, durationMinutes: 8,
            topics: ['socialActivities', 'reading'],
            summary: 'Margaret lent the Tana French book to the bridge group — four of them are reading it now and they plan a group discussion next month. She also won three rounds at bridge. Her partner Frances played brilliantly.',
            highlights: [
                { text: 'Lent Tana French book to the bridge group — four of them reading it now, plan a group discussion', importanceScore: 0.9 },
                { text: 'Won three rounds at bridge — partner Frances played brilliantly', importanceScore: 0.8 },
            ],
            persons: [],
        },
        {
            convId: 'conv_mg_012', callSid: 'CA_mg_012', daysAgo: 6, durationMinutes: 7,
            topics: ['healthManagement', 'neighbourhood'],
            summary: 'Blood pressure crept back up slightly. Margaret has not been sleeping well with the warmer nights. Tom mentioned that the new family on the street has a dog that barks at the birds, which is an annoyance.',
            highlights: [
                { text: 'Blood pressure back up slightly — not sleeping well with the warmer nights', importanceScore: 0.9 },
                { text: 'Tom mentioned the new family on the street has a dog that barks at the birds', importanceScore: 0.7 },
            ],
            persons: [
                { name: 'Tom', role: 'neighbour', context: 'Tom mentioned the new family on the street has a dog that barks at the birds', topicKeys: ['neighbourhood'] },
            ],
        },
        {
            convId: 'conv_mg_013', callSid: 'CA_mg_013', daysAgo: 3, durationMinutes: 9,
            topics: ['gardening', 'baking'],
            summary: 'Margaret harvested the first radishes of the season and brought a bag in for Sarah. She also made cucumber sandwiches with cream cheese and garden cucumbers — everything grown herself. Felt accomplished and self-sufficient.',
            highlights: [
                { text: 'Harvested the first radishes of the season — brought a bag in for Sarah', importanceScore: 0.8 },
                { text: 'Made cucumber sandwiches with cream cheese and garden cucumbers — everything from the garden', importanceScore: 0.9 },
            ],
            persons: [
                { name: 'Sarah', role: 'daughter', context: 'Harvested the first radishes of the season — brought a bag in for Sarah', topicKeys: ['familyVisits', 'gardening'] },
            ],
        },
        {
            convId: 'conv_mg_014', callSid: 'CA_mg_014', daysAgo: 1, durationMinutes: 8,
            topics: ['birdWatching', 'familyVisits'],
            summary: 'Emily visited and they watched the goldfinches from the kitchen window together for twenty minutes. Emily asked whether goldfinches always return to the same feeder and wants to look it up. A warm and connected visit.',
            highlights: [
                { text: 'Emily visited and they watched the goldfinches together from the kitchen window for twenty minutes', importanceScore: 1.0 },
                { text: 'Emily asked if goldfinches always come back to the same feeder — wants to look it up', importanceScore: 0.9 },
            ],
            persons: [
                { name: 'Emily', role: 'granddaughter', context: 'Emily visited and they watched the goldfinches together from the kitchen window for twenty minutes', topicKeys: ['birdWatching', 'familyVisits'] },
            ],
        },
    ],
};

// ---------------------------------------------------------------------------
// Harold Chen
// ---------------------------------------------------------------------------

const HAROLD: UserDef = {
    name: 'Harold Chen',
    age: 78,
    phone: '+15550000002',
    gender: 'MALE',
    educationLevel: 'BACHELORS_DEGREE',
    interests: ['Classical music', 'Reading', 'Neighbourhood walks', 'Technology', 'Family calls'],
    dislikes: ['Loud environments', 'Rushed conversations', 'Spicy food'],
    callFrequency: 'WEEKLY',
    healthConditions: [
        { condition: 'Congestive Heart Failure', severity: 'Mild',     notes: 'Recently discharged, on fluid restriction and low-sodium diet' },
        { condition: 'Type 2 Diabetes',          severity: 'Moderate', notes: 'Managed with Metformin' },
        { condition: 'Hearing Loss',              severity: 'Mild',     notes: 'Wears hearing aids; prefers slower speech' },
    ],
    medications: [
        { name: 'Furosemide', dosage: '40mg',  notes: 'Diuretic for fluid retention. Take in the morning.' },
        { name: 'Metformin',  dosage: '500mg', notes: 'For diabetes management. Take with meals.' },
        { name: 'Aspirin',    dosage: '75mg',  notes: 'Daily low-dose for cardiovascular protection.' },
    ],
    caregiver: { name: 'David Chen', email: 'david.chen@email.com', phone: '+15550000012', relationship: 'SON' },
    conversations: [
        {
            convId: 'conv_hc_001', callSid: 'CA_hc_001', daysAgo: 26, durationMinutes: 12,
            topics: ['healthManagement', 'familyVisits'],
            summary: 'David visited Harold after his post-discharge check-up — first time seeing him since the hospital admission. Dr. Kim confirmed the fluid retention has cleared and the sodium restriction still needs to continue. Harold sounded relieved and glad for the company.',
            highlights: [
                { text: 'David visited after hospital discharge check-up — first time seeing him since the admission', importanceScore: 1.0 },
                { text: 'Dr. Kim confirmed fluid retention has cleared, sodium restriction still needed', importanceScore: 1.0 },
            ],
            persons: [
                { name: 'David', role: 'son', context: 'David visited after hospital discharge check-up — first time seeing him since the admission', topicKeys: ['familyVisits', 'healthManagement'] },
                { name: 'Dr. Kim', role: 'cardiologist', context: 'Dr. Kim confirmed fluid retention has cleared, sodium restriction still needed', topicKeys: ['healthManagement'] },
            ],
        },
        {
            convId: 'conv_hc_002', callSid: 'CA_hc_002', daysAgo: 24, durationMinutes: 10,
            topics: ['music', 'reading'],
            summary: 'Harold has been listening to Brahms piano concertos on the speakers his late wife Grace chose — still the best purchase they ever made, he says. He is also reading a biography of Tesla and finds the engineering precision reminiscent of his own career.',
            highlights: [
                { text: 'Playing Brahms piano concertos on the good speakers Grace chose — still the best purchase they made', importanceScore: 1.0 },
                { text: 'Reading a biography of Tesla — engineering precision in every chapter reminds Harold of his own work', importanceScore: 0.9 },
            ],
            persons: [
                { name: 'Grace', role: 'late wife', context: 'Playing Brahms piano concertos on the good speakers Grace chose — still the best purchase they made', topicKeys: ['music'] },
            ],
        },
        {
            convId: 'conv_hc_003', callSid: 'CA_hc_003', daysAgo: 22, durationMinutes: 9,
            topics: ['neighbourhood', 'cooking'],
            summary: 'Mrs. Rodriguez from the floor brought Harold a chicken soup — the first time she has cooked for him since he moved in. Harold made his own version the next day, adding lentils the way Grace used to. He sounded touched and a little nostalgic.',
            highlights: [
                { text: 'Mrs. Rodriguez brought over a chicken soup — first time she has cooked for him since he moved to the floor', importanceScore: 1.0 },
                { text: 'Made his own version the next day, added lentils the way Grace used to', importanceScore: 1.0 },
            ],
            persons: [
                { name: 'Mrs. Rodriguez', role: 'neighbour', context: 'Mrs. Rodriguez brought over a chicken soup — first time she has cooked for him since he moved to the floor', topicKeys: ['neighbourhood', 'cooking'] },
                { name: 'Grace', role: 'late wife', context: 'Made his own version the next day, added lentils the way Grace used to', topicKeys: ['cooking'] },
            ],
        },
        {
            convId: 'conv_hc_004', callSid: 'CA_hc_004', daysAgo: 20, durationMinutes: 9,
            topics: ['music', 'healthManagement'],
            summary: 'Harold missed the Tuesday radio concert because of a cardiology appointment and was frustrated about the clash. His heart rate has been steady with no palpitations since the Furosemide dose was adjusted. Dr. Kim is pleased with progress.',
            highlights: [
                { text: 'Missed the Tuesday radio concert because of a cardiology appointment — frustrated about the timing', importanceScore: 0.9 },
                { text: 'Heart rate has been steady, no palpitations since adjusting the Furosemide dose', importanceScore: 0.9 },
            ],
            persons: [
                { name: 'Dr. Kim', role: 'cardiologist', context: 'Heart rate has been steady, no palpitations since adjusting the Furosemide dose', topicKeys: ['healthManagement'] },
            ],
        },
        {
            convId: 'conv_hc_005', callSid: 'CA_hc_005', daysAgo: 18, durationMinutes: 8,
            topics: ['reading', 'gardening'],
            summary: 'Harold finished the Tesla biography and started a history of the electric grid, taking notes in the margins as he goes. He also helped Mrs. Rodriguez carry her pot plants in before a cold snap — the first physical task he has done in weeks.',
            highlights: [
                { text: 'Finished the Tesla biography and started a history of the electric grid — Harold took notes in the margin', importanceScore: 0.8 },
                { text: 'Helped Mrs. Rodriguez carry her pot plants in before the cold snap — first physical task in weeks', importanceScore: 0.9 },
            ],
            persons: [
                { name: 'Mrs. Rodriguez', role: 'neighbour', context: 'Helped Mrs. Rodriguez carry her pot plants in before the cold snap — first physical task in weeks', topicKeys: ['gardening', 'neighbourhood'] },
            ],
        },
        {
            convId: 'conv_hc_006', callSid: 'CA_hc_006', daysAgo: 16, durationMinutes: 10,
            topics: ['music', 'reading'],
            summary: 'Harold discovered a 1981 recording of Glenn Gould playing the Goldberg Variations and listened through it three times. David sent him a novel about a retired engineer and Harold is sceptical it will be technically accurate but will give it a go.',
            highlights: [
                { text: 'Discovered a recording of Gould playing the Goldberg Variations from 1981 — listened three times through', importanceScore: 0.9 },
                { text: 'David sent over a copy of a novel about a retired engineer — Harold not sure it will be accurate', importanceScore: 0.8 },
            ],
            persons: [
                { name: 'David', role: 'son', context: 'David sent over a copy of a novel about a retired engineer — Harold not sure it will be accurate', topicKeys: ['familyVisits', 'reading'] },
            ],
        },
        {
            convId: 'conv_hc_007', callSid: 'CA_hc_007', daysAgo: 14, durationMinutes: 9,
            topics: ['healthManagement', 'neighbourhood'],
            summary: 'Harold walked to the corner shop for the first time since discharge, stopping three times to rest on the way back. He saw the new development going up where the old hardware store used to be and felt a bit sad about it.',
            highlights: [
                { text: 'Walked to the corner shop for the first time since discharge — three stops to rest on the way back', importanceScore: 0.9 },
                { text: 'Saw the new development going up where the old hardware store was — a bit sad about it', importanceScore: 0.7 },
            ],
            persons: [],
        },
        {
            convId: 'conv_hc_008', callSid: 'CA_hc_008', daysAgo: 12, durationMinutes: 10,
            topics: ['cooking', 'familyVisits'],
            summary: 'David came for Sunday dinner and Harold cooked the lamb chops Grace used to make for birthdays. David stayed to wash up and they watched the evening news together. Harold described it as the best evening he has had in months.',
            highlights: [
                { text: 'David came for Sunday dinner — Harold made the lamb chops Grace used to do for birthdays', importanceScore: 1.0 },
                { text: 'David stayed to wash up and they watched the evening news together', importanceScore: 0.9 },
            ],
            persons: [
                { name: 'David', role: 'son', context: 'David came for Sunday dinner — Harold made the lamb chops Grace used to do for birthdays', topicKeys: ['cooking', 'familyVisits'] },
                { name: 'Grace', role: 'late wife', context: 'Harold made the lamb chops Grace used to do for birthdays', topicKeys: ['cooking'] },
            ],
        },
        {
            convId: 'conv_hc_009', callSid: 'CA_hc_009', daysAgo: 10, durationMinutes: 11,
            topics: ['music', 'neighbourhood'],
            summary: 'A new upstairs neighbour plays piano and Harold introduced himself — she is studying at the conservatoire. They played a short duet on her keyboard, the first time Harold has played since Grace passed. He sounded moved and slightly surprised by himself.',
            highlights: [
                { text: 'New upstairs neighbour plays piano — Harold knocked to introduce himself, she is studying at the conservatoire', importanceScore: 1.0 },
                { text: 'They played a short duet on her keyboard, first time Harold has played since Grace passed', importanceScore: 1.0 },
            ],
            persons: [
                { name: 'Grace', role: 'late wife', context: 'They played a short duet on her keyboard, first time Harold has played since Grace passed', topicKeys: ['music'] },
            ],
        },
        {
            convId: 'conv_hc_010', callSid: 'CA_hc_010', daysAgo: 8, durationMinutes: 9,
            topics: ['reading', 'music'],
            summary: 'Harold has started reading sheet music along to recordings and finds he can still read it after all these years. He is planning to work through a Duke Ellington biography next — a new direction into jazz.',
            highlights: [
                { text: 'Started reading sheet music along to the recordings — finds he can still read it even after all these years', importanceScore: 0.9 },
                { text: 'Working through a biography of Duke Ellington next — jazz is a new direction', importanceScore: 0.8 },
            ],
            persons: [],
        },
        {
            convId: 'conv_hc_011', callSid: 'CA_hc_011', daysAgo: 6, durationMinutes: 10,
            topics: ['healthManagement', 'familyVisits'],
            summary: 'Six-week post-discharge check with Dr. Kim — readings are good and exercise tolerance is improving. David also booked a weekend away for the two of them in May, the first trip since Harold\'s hospitalisation. Harold was clearly looking forward to it.',
            highlights: [
                { text: 'Six-week post-discharge check — Dr. Kim happy with the readings, exercise tolerance improving', importanceScore: 1.0 },
                { text: 'David booked a weekend away for the two of them in May — first trip since the hospital', importanceScore: 1.0 },
            ],
            persons: [
                { name: 'Dr. Kim', role: 'cardiologist', context: 'Six-week post-discharge check — Dr. Kim happy with the readings, exercise tolerance improving', topicKeys: ['healthManagement'] },
                { name: 'David', role: 'son', context: 'David booked a weekend away for the two of them in May — first trip since the hospital', topicKeys: ['familyVisits'] },
            ],
        },
        {
            convId: 'conv_hc_012', callSid: 'CA_hc_012', daysAgo: 4, durationMinutes: 8,
            topics: ['neighbourhood', 'cooking'],
            summary: 'Building management issued a notice about lift maintenance and Harold organised a group message for his floor so no one was caught off guard. He also cooked a pot of lentil soup to share with Mrs. Rodriguez during the outage.',
            highlights: [
                { text: 'Building management held a notice about lift maintenance — Harold organised a group message for his floor', importanceScore: 0.9 },
                { text: 'Cooked a pot of lentil soup to share with Mrs. Rodriguez during the lift outage', importanceScore: 0.9 },
            ],
            persons: [
                { name: 'Mrs. Rodriguez', role: 'neighbour', context: 'Cooked a pot of lentil soup to share with Mrs. Rodriguez during the lift outage', topicKeys: ['cooking', 'neighbourhood'] },
            ],
        },
        {
            convId: 'conv_hc_013', callSid: 'CA_hc_013', daysAgo: 2, durationMinutes: 7,
            topics: ['gardening', 'music'],
            summary: 'Harold offered to water the communal plants on his landing since he passes them daily. He has been listening to Ellington while watering — describing it as gardening becoming a new slow hobby for him. Gentle and reflective call.',
            highlights: [
                { text: 'Offered to water the communal plants on the landing since he passes them daily', importanceScore: 0.7 },
                { text: 'Listening to Ellington while he waters — gardening as a new slow hobby', importanceScore: 0.8 },
            ],
            persons: [],
        },
    ],
};

// ---------------------------------------------------------------------------
// Dorothy Walsh
// ---------------------------------------------------------------------------

const DOROTHY: UserDef = {
    name: 'Dorothy Walsh',
    age: 68,
    phone: '+15550000003',
    gender: 'FEMALE',
    educationLevel: 'BACHELORS_DEGREE',
    interests: ['Community events', 'Baking', 'Bird watching', 'Walking', 'Knitting', 'Health advocacy'],
    dislikes: ['Inactivity', 'Being patronised', 'Processed food'],
    callFrequency: 'DAILY',
    healthConditions: [
        { condition: 'Mild Arthritis',    severity: 'Mild',     notes: 'Mainly in hands and knees; managed with paracetamol PRN' },
        { condition: 'High Cholesterol',  severity: 'Moderate', notes: 'Started Atorvastatin; monitoring monthly' },
        { condition: 'Situational Anxiety', severity: 'Mild',   notes: 'Post-bereavement; improving with social engagement' },
    ],
    medications: [
        { name: 'Atorvastatin',  dosage: '20mg',  notes: 'For high cholesterol. Take in the evening.' },
        { name: 'Paracetamol',   dosage: '500mg', notes: 'For arthritis pain, as needed', prn: true },
    ],
    caregiver: { name: 'Michael Walsh', email: 'michael.walsh@email.com', phone: '+15550000013', relationship: 'SON' },
    conversations: [
        {
            convId: 'conv_dw_001', callSid: 'CA_dw_001', daysAgo: 24, durationMinutes: 11,
            topics: ['healthManagement', 'socialActivities'],
            summary: 'Dorothy\'s first full week back at the community centre since her husband Frank passed. Patricia from the book club made sure she had company the whole time. Her GP appointment confirmed cholesterol is still elevated and she is starting Atorvastatin this week.',
            highlights: [
                { text: 'First full week back at the community centre since Frank passed — Patricia made sure she had company the whole time', importanceScore: 1.0 },
                { text: 'GP appointment confirmed cholesterol still elevated, starting Atorvastatin this week', importanceScore: 1.0 },
            ],
            persons: [
                { name: 'Frank', role: 'late husband', context: 'First full week back at the community centre since Frank passed — Patricia made sure she had company the whole time', topicKeys: ['socialActivities'] },
                { name: 'Patricia', role: 'friend', context: 'Patricia made sure she had company the whole time at the community centre', topicKeys: ['socialActivities'] },
            ],
        },
        {
            convId: 'conv_dw_002', callSid: 'CA_dw_002', daysAgo: 22, durationMinutes: 9,
            topics: ['neighbourhood', 'baking'],
            summary: 'Dorothy made a Victoria sponge for the street\'s informal spring gathering and twelve people came. Linda organised the tables and decorations. It was the first time the cul-de-sac had gathered since Christmas and it felt like a proper community again.',
            highlights: [
                { text: 'Made Victoria sponge for the street\'s informal spring gathering — twelve people came, almost ran out', importanceScore: 0.9 },
                { text: 'Linda organised the tables and decorations — first time the cul-de-sac has gathered since Christmas', importanceScore: 1.0 },
            ],
            persons: [
                { name: 'Linda', role: 'neighbour', context: 'Linda organised the tables and decorations — first time the cul-de-sac has gathered since Christmas', topicKeys: ['neighbourhood', 'socialActivities'] },
            ],
        },
        {
            convId: 'conv_dw_003', callSid: 'CA_dw_003', daysAgo: 20, durationMinutes: 8,
            topics: ['healthManagement', 'memoryHealth'],
            summary: 'Dorothy forgot a GP appointment for the first time in her nursing career. She called ahead and rebooked but was unsettled by it. She has now set three phone alarms and a paper diary entry for every appointment — determined not to let it happen again.',
            highlights: [
                { text: 'Forgot a GP appointment for the first time in her nursing career — called ahead but still unsettled by it', importanceScore: 0.9 },
                { text: 'Set three phone alarms and a paper diary entry for next appointment — determined not to repeat it', importanceScore: 0.8 },
            ],
            persons: [],
        },
        {
            convId: 'conv_dw_004', callSid: 'CA_dw_004', daysAgo: 18, durationMinutes: 10,
            topics: ['socialActivities', 'baking'],
            summary: 'Patricia\'s book club combined with a baking session and Dorothy brought her shortbread. Everyone asked for the recipe. The group voted to do a monthly themed bake — Dorothy described it as social glue forming around something practical and fun.',
            highlights: [
                { text: 'Patricia\'s book club combined with a baking session — Dorothy brought her shortbread, everyone asked for the recipe', importanceScore: 1.0 },
                { text: 'Group voted to do a monthly theme bake — social glue is forming around it', importanceScore: 0.9 },
            ],
            persons: [
                { name: 'Patricia', role: 'friend', context: 'Patricia\'s book club combined with a baking session — Dorothy brought her shortbread, everyone asked for the recipe', topicKeys: ['socialActivities', 'baking'] },
            ],
        },
        {
            convId: 'conv_dw_005', callSid: 'CA_dw_005', daysAgo: 16, durationMinutes: 9,
            topics: ['birdWatching', 'neighbourhood'],
            summary: 'A heron appeared in next door\'s pond for the first time and both Linda and Dorothy watched it from the fence. Linda said it has been visiting for three years. Dorothy reflected that she had never noticed it before Frank died — she is paying more attention now.',
            highlights: [
                { text: 'Spotted a heron standing in next door\'s pond for the first time — both Linda and Dorothy watched from the fence', importanceScore: 1.0 },
                { text: 'Linda says the heron has been visiting for three years — Dorothy never noticed before Frank died', importanceScore: 0.9 },
            ],
            persons: [
                { name: 'Linda', role: 'neighbour', context: 'Linda says the heron has been visiting for three years — Dorothy never noticed before Frank died', topicKeys: ['birdWatching', 'neighbourhood'] },
                { name: 'Frank', role: 'late husband', context: 'Dorothy never noticed before Frank died', topicKeys: ['birdWatching'] },
            ],
        },
        {
            convId: 'conv_dw_006', callSid: 'CA_dw_006', daysAgo: 14, durationMinutes: 10,
            topics: ['healthManagement', 'socialActivities'],
            summary: 'Cholesterol retest showed a drop from 6.8 to 5.9 in three weeks — the Atorvastatin is working quickly. Dorothy told Patricia and the book club and they celebrated with champagne at Friday\'s session. A genuinely joyful call.',
            highlights: [
                { text: 'Cholesterol retest — down from 6.8 to 5.9 in three weeks, Atorvastatin working quickly', importanceScore: 1.0 },
                { text: 'Told Patricia and the book club about the result — they celebrated with champagne at Friday\'s session', importanceScore: 1.0 },
            ],
            persons: [
                { name: 'Patricia', role: 'friend', context: 'Told Patricia and the book club about the result — they celebrated with champagne at Friday\'s session', topicKeys: ['socialActivities', 'healthManagement'] },
                { name: 'Dr. Chen', role: 'GP', context: 'Cholesterol retest — down from 6.8 to 5.9 in three weeks, Atorvastatin working quickly', topicKeys: ['healthManagement'] },
            ],
        },
        {
            convId: 'conv_dw_007', callSid: 'CA_dw_007', daysAgo: 12, durationMinutes: 9,
            topics: ['gardening', 'memoryHealth'],
            summary: 'Dorothy tried planting bulbs in the front border — the first time she has gardened alone since Frank always did it. She could not remember the names of several plants and took photos of the packaging to look them up later. A bittersweet milestone.',
            highlights: [
                { text: 'Tried planting bulbs in the front border — first time gardening alone since Frank always did it', importanceScore: 0.9 },
                { text: 'Could not remember the names of several plants, took photos of the packaging to look up later', importanceScore: 0.8 },
            ],
            persons: [
                { name: 'Frank', role: 'late husband', context: 'Tried planting bulbs in the front border — first time gardening alone since Frank always did it', topicKeys: ['gardening'] },
            ],
        },
        {
            convId: 'conv_dw_008', callSid: 'CA_dw_008', daysAgo: 10, durationMinutes: 10,
            topics: ['baking', 'familyVisits'],
            summary: 'Michael visited and they baked fruit scones together — he remembered the recipe from childhood. He told Dorothy he had noticed she seemed more settled than at Christmas. Hearing that meant a great deal to her and she became emotional briefly.',
            highlights: [
                { text: 'Michael visited and they baked fruit scones together — he remembered the recipe from childhood', importanceScore: 1.0 },
                { text: 'Michael said he noticed she seemed more settled than at Christmas — it meant a great deal to hear', importanceScore: 1.0 },
            ],
            persons: [
                { name: 'Michael', role: 'son', context: 'Michael visited and they baked fruit scones together — he remembered the recipe from childhood', topicKeys: ['baking', 'familyVisits'] },
            ],
        },
        {
            convId: 'conv_dw_009', callSid: 'CA_dw_009', daysAgo: 8, durationMinutes: 9,
            topics: ['neighbourhood', 'socialActivities'],
            summary: 'Linda invited Dorothy to join the volunteer litter-pick group on Saturdays and she signed up immediately. The first session covered the park and the canal path with nine people. Dorothy was energised by it — felt useful and connected.',
            highlights: [
                { text: 'Linda invited Dorothy to join the volunteer litter-pick group on Saturdays — she signed up immediately', importanceScore: 1.0 },
                { text: 'First volunteer session: nine people, covered the park and the canal path', importanceScore: 0.8 },
            ],
            persons: [
                { name: 'Linda', role: 'neighbour', context: 'Linda invited Dorothy to join the volunteer litter-pick group on Saturdays — she signed up immediately', topicKeys: ['neighbourhood', 'socialActivities'] },
            ],
        },
        {
            convId: 'conv_dw_010', callSid: 'CA_dw_010', daysAgo: 6, durationMinutes: 9,
            topics: ['healthManagement', 'birdWatching'],
            summary: 'Dr. Chen reviewed the Atorvastatin and flagged the St John\'s Wort Dorothy had been taking — interaction risk and asked her to stop immediately. She sat in the garden afterward watching the wood pigeons with a cup of tea. Calm despite the news.',
            highlights: [
                { text: 'Dr. Chen reviewed the Atorvastatin and flagged the St John\'s Wort — asked her to stop immediately, interaction risk', importanceScore: 1.0 },
                { text: 'Sitting in the garden with a cup of tea watching the wood pigeons — peaceful despite the news about the tablets', importanceScore: 0.9 },
            ],
            persons: [
                { name: 'Dr. Chen', role: 'GP', context: 'Dr. Chen reviewed the Atorvastatin and flagged the St John\'s Wort — asked her to stop immediately, interaction risk', topicKeys: ['healthManagement'] },
            ],
        },
        {
            convId: 'conv_dw_011', callSid: 'CA_dw_011', daysAgo: 3, durationMinutes: 11,
            topics: ['socialActivities', 'baking', 'familyVisits'],
            summary: 'Patricia\'s birthday: Dorothy made a three-layer lemon cake for the first time and it worked. Michael called to say he had heard from Patricia how well Dorothy had been doing. She was proud — of the cake, and of herself.',
            highlights: [
                { text: 'Patricia\'s birthday: Dorothy made a three-layer lemon cake — first time attempting it, it worked', importanceScore: 1.0 },
                { text: 'Michael called to say he had heard from Patricia how well Dorothy had been doing — proud', importanceScore: 1.0 },
            ],
            persons: [
                { name: 'Patricia', role: 'friend', context: 'Patricia\'s birthday: Dorothy made a three-layer lemon cake — first time attempting it, it worked', topicKeys: ['socialActivities', 'baking'] },
                { name: 'Michael', role: 'son', context: 'Michael called to say he had heard from Patricia how well Dorothy had been doing — proud', topicKeys: ['familyVisits'] },
            ],
        },
        {
            convId: 'conv_dw_012', callSid: 'CA_dw_012', daysAgo: 0, durationMinutes: 9,
            topics: ['memoryHealth', 'healthManagement'],
            summary: 'Following the St John\'s Wort incident, Dorothy set up a weekly medication tracker — wants to be rigorous now given her nursing background. Dr. Chen said her self-awareness and management approach were exactly right. She felt validated and purposeful.',
            highlights: [
                { text: 'Set up a weekly medication tracker following the St John\'s Wort incident — wants to be rigorous now', importanceScore: 0.9 },
                { text: 'Dr. Chen said her awareness and self-management were exactly right for someone with her background', importanceScore: 1.0 },
            ],
            persons: [
                { name: 'Dr. Chen', role: 'GP', context: 'Dr. Chen said her awareness and self-management were exactly right for someone with her background', topicKeys: ['healthManagement', 'memoryHealth'] },
            ],
        },
    ],
};

const ALL_USERS: UserDef[] = [MARGARET, HAROLD, DOROTHY];

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const prisma = new PrismaClient();

const now = new Date();
const daysAgo = (d: number) => new Date(now.getTime() - d * 24 * 60 * 60 * 1000);

async function generateEmbedding(text: string, embeddingModel: OpenAIEmbeddings): Promise<number[]> {
    return embeddingModel.embedQuery(text);
}

async function qdrantDeleteUser(userId: string): Promise<void> {
    const res = await fetch(`${QDRANT_URL}/collections/${QDRANT_COLLECTION}/points/delete`, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            ...(QDRANT_API_KEY ? { 'api-key': QDRANT_API_KEY } : {}),
        },
        body: JSON.stringify({
            filter: { must: [{ key: 'metadata.userId', match: { value: userId } }] },
        }),
    });
    if (!res.ok) {
        const text = await res.text();
        console.warn(`[Qdrant] delete for userId=${userId} returned ${res.status}: ${text}`);
    }
}

async function neo4jWipeUser(session: any, userId: string): Promise<void> {
    await session.run(
        `MATCH (u:User {userId: $userId})
         OPTIONAL MATCH (u)-[:HAS_CONVERSATION]->(c:Conversation)
         OPTIONAL MATCH (c)-[:HAS_SUMMARY]->(s:Summary)
         OPTIONAL MATCH (c)-[:HAS_HIGHLIGHT]->(h:Highlight)
         DETACH DELETE u, c, s, h`,
        { userId }
    );
}

async function neo4jWipeOrphanTopicsAndPersons(session: any): Promise<void> {
    await session.run(`MATCH (t:Topic) WHERE NOT (t)<-[:MENTIONS]-() DELETE t`);
    await session.run(`MATCH (p:Person) WHERE NOT ()<-[:MENTIONED]-(p) DELETE p`);
}

// Pre-compute pairwise co-occurrence counts across all conversations for a user
function computeCoOccurrences(conversations: ConversationDef[]): Map<string, number> {
    const counts = new Map<string, number>();
    for (const conv of conversations) {
        const keys = [...new Set(conv.topics)] as TopicKey[];
        for (let i = 0; i < keys.length; i++) {
            for (let j = i + 1; j < keys.length; j++) {
                const [a, b] = [TOPICS[keys[i]].id, TOPICS[keys[j]].id].sort();
                const key = `${a}|${b}`;
                counts.set(key, (counts.get(key) ?? 0) + 1);
            }
        }
    }
    return counts;
}

function coOccurrenceStrength(count: number): number {
    if (count >= 5) return 1.0;
    if (count >= 3) return 0.6;
    if (count >= 2) return 0.4;
    return 0.2;
}

async function seedUser(
    user: UserDef,
    vectorStore: VectorStoreClient,
    graphRepo: GraphRepository,
    embeddingModel: OpenAIEmbeddings
): Promise<{ userId: string; qdrantPoints: number; neo4jNodes: number }> {
    console.log(`\n  [Postgres] Creating profile: ${user.name}`);

    // Caregiver auth user
    const authUser = await prisma.user.create({
        data: { name: user.caregiver.name, email: user.caregiver.email },
    });

    // Elderly profile
    const profile = await prisma.elderlyProfile.create({
        data: {
            name: user.name,
            age: user.age,
            phone: user.phone,
            gender: user.gender,
            educationLevel: user.educationLevel as any,
            interests: user.interests,
            dislikes: user.dislikes,
            callFrequency: user.callFrequency as any,
            preferredCallTime: new Date('1970-01-01T14:00:00Z'),
            isFirstCall: false,
            enableHealthCheckIns: true,
            lastCallAt: daysAgo(user.conversations[user.conversations.length - 1].daysAgo),

            emergencyContact: {
                create: {
                    name: user.caregiver.name,
                    phone: user.caregiver.phone,
                    email: user.caregiver.email,
                    relationship: user.caregiver.relationship as any,
                    smsEnabled: true,
                    notifyOnMissedCalls: true,
                },
            },

            healthConditions: {
                create: user.healthConditions.map(hc => ({
                    condition: hc.condition,
                    severity: hc.severity,
                    notes: hc.notes,
                    isActive: true,
                })),
            },

            medications: {
                create: user.medications.map(m => ({
                    name: m.name,
                    dosage: m.dosage,
                    frequency: m.prn ? { prn: true } : { timesPerDay: 1 },
                    notes: m.notes,
                    isActive: true,
                })),
            },
        },
    });

    const userId = profile.id;
    console.log(`  [Postgres] Profile created: ${userId}`);

    // Caregiver profile
    await prisma.caregiverProfile.create({
        data: {
            authUserId: authUser.id,
            name: user.caregiver.name,
            phone: user.caregiver.phone,
            relationship: user.caregiver.relationship as any,
            managedUsers: {
                create: { elderlyProfileId: userId, isPrimary: true, status: 'ACTIVE' },
            },
        },
    });

    // Postgres topic rows (per-user, with real embeddings)
    const usedTopicKeys = [...new Set(user.conversations.flatMap(c => c.topics))];
    const postgresTopics: Record<string, string> = {}; // topicKey → Postgres topic ID

    console.log(`  [Postgres] Creating ${usedTopicKeys.length} topics with embeddings...`);
    for (const key of usedTopicKeys) {
        const t = TOPICS[key as TopicKey];
        const embedding = await generateEmbedding(t.label, embeddingModel);
        const topic = await prisma.conversationTopic.create({
            data: {
                elderlyProfileId: userId,
                topicName: t.label,
                variations: [...t.variations],
                category: t.category,
                topicEmbedding: embedding,
            },
        });
        postgresTopics[key] = topic.id;
    }

    // Neo4j User node
    await graphRepo.mergeUser({ userId, name: user.name });

    // Shared Neo4j Topic nodes (MERGE — safe to call per user)
    for (const key of usedTopicKeys) {
        const t = TOPICS[key as TopicKey];
        await graphRepo.mergeTopic({
            topicId: t.id,
            label: t.label,
            variations: [...t.variations],
            createdAt: now.toISOString(),
            lastUpdated: now.toISOString(),
        });
    }

    // Compute co-occurrences upfront for RELATED_TO strengths
    const coOccurrences = computeCoOccurrences(user.conversations);

    // Process each conversation
    let totalQdrantPoints = 0;

    for (const conv of user.conversations) {
        const convDate = daysAgo(conv.daysAgo);
        const convDateStr = convDate.toISOString().split('T')[0];
        const summaryId = randomUUID();

        // --- Postgres: CallLog ---
        const callLog = await prisma.callLog.create({
            data: {
                elderlyProfileId: userId,
                callType: 'GENERAL',
                scheduledTime: convDate,
                endTime: new Date(convDate.getTime() + conv.durationMinutes * 60 * 1000),
                status: 'COMPLETED',
                outcome: 'COMPLETED',
                checkInCompleted: true,
                twilioCallSid: conv.callSid,
                elevenlabsConversationId: conv.convId,
            },
        });

        // --- Postgres: ConversationSummary ---
        const pgSummary = await prisma.conversationSummary.create({
            data: {
                elderlyProfileId: userId,
                conversationId: conv.convId,
                callLogId: callLog.id,
                summaryText: conv.summary,
                durationMinutes: conv.durationMinutes,
                topicsDiscussed: conv.topics.map(k => TOPICS[k as TopicKey].label),
                keyHighlights: conv.highlights.map(h => h.text),
                createdAt: convDate,
            },
        });

        // --- Postgres: TopicReferences ---
        await prisma.conversationTopicReference.createMany({
            data: conv.topics.map(k => ({
                conversationSummaryId: pgSummary.id,
                conversationTopicId: postgresTopics[k],
            })),
        });

        // --- Qdrant: embed & store highlights ---
        const highlightEntries: { text: string; embedding: number[]; id: string; importanceScore: number }[] = [];
        for (const h of conv.highlights) {
            const embedding = await generateEmbedding(h.text, embeddingModel);
            highlightEntries.push({ text: h.text, embedding, id: randomUUID(), importanceScore: h.importanceScore });
        }

        await vectorStore.addMemoriesWithIds(
            highlightEntries.map(e => ({ text: e.text, embedding: e.embedding, id: e.id })),
            { userId, conversationId: conv.convId, createdAt: convDate.toISOString(), summaryId }
        );
        totalQdrantPoints += highlightEntries.length;

        // --- Neo4j: Conversation + Summary nodes ---
        await graphRepo.mergeConversation({
            conversationId: conv.convId,
            date: convDateStr,
            durationMinutes: conv.durationMinutes,
            callType: 'general',
            outcome: 'completed',
        });
        await graphRepo.mergeSummary({ id: summaryId, text: conv.summary, createdAt: convDate.toISOString() });

        // --- Neo4j: Highlight nodes ---
        for (const h of highlightEntries) {
            await graphRepo.mergeHighlight({
                id: randomUUID(),
                qdrantPointId: h.id,
                text: h.text,
                importanceScore: h.importanceScore,
                createdAt: convDate.toISOString(),
            });
        }

        // --- Neo4j: Person nodes ---
        const personIds: Record<string, string> = {};
        for (const p of conv.persons) {
            const personId = randomUUID();
            personIds[p.name] = personId;
            await graphRepo.mergePerson({ id: personId, name: p.name, role: p.role });
        }

        // --- Neo4j: Structural edges ---
        await graphRepo.linkUserToConversation({ userId, conversationId: conv.convId });
        await graphRepo.linkConversationToSummary({ conversationId: conv.convId, summaryId, createdAt: convDate.toISOString() });

        for (const h of highlightEntries) {
            await graphRepo.linkConversationToHighlight({
                conversationId: conv.convId,
                highlightQdrantPointId: h.id,
                createdAt: convDate.toISOString(),
            });
            await graphRepo.linkSummaryToHighlight({ summaryId, highlightQdrantPointId: h.id });
        }

        // --- Neo4j: Summary → Topic edges ---
        for (const topicKey of conv.topics) {
            const topicId = TOPICS[topicKey as TopicKey].id;
            await graphRepo.linkSummaryToTopic({ summaryId, topicId, similarityScore: 0.85 });
        }

        // --- Neo4j: Highlight → Topic edges (each highlight linked to all topics in the conversation) ---
        for (const h of highlightEntries) {
            for (const topicKey of conv.topics) {
                const topicId = TOPICS[topicKey as TopicKey].id;
                await graphRepo.linkHighlightToTopic({ highlightId: h.id, topicId, similarityScore: 0.75 });
            }
        }

        // --- Neo4j: User → Topic MENTIONS (incremental) ---
        for (const topicKey of conv.topics) {
            const topicId = TOPICS[topicKey as TopicKey].id;
            await graphRepo.upsertUserMentionsTopic({
                userId,
                topicId,
                firstSeen: convDate.toISOString(),
                lastSeen: convDate.toISOString(),
            });
        }

        // --- Neo4j: Person edges ---
        for (const p of conv.persons) {
            const personId = personIds[p.name];
            await graphRepo.upsertUserMentionedPerson({
                userId,
                personId,
                context: p.context,
                lastSeen: convDate.toISOString(),
            });
            for (const topicKey of p.topicKeys) {
                const topicId = TOPICS[topicKey as TopicKey].id;
                await graphRepo.upsertPersonAssociatedWithTopic({
                    personId,
                    topicId,
                    lastSeen: convDate.toISOString(),
                });
            }
        }
    }

    // --- Neo4j: RELATED_TO edges with co-occurrence-weighted strength ---
    console.log(`  [Neo4j] Writing RELATED_TO edges...`);
    const neo4jSession = (graphRepo as any).session;
    for (const [pairKey, count] of coOccurrences.entries()) {
        const [fromId, toId] = pairKey.split('|');
        const strength = coOccurrenceStrength(count);
        await neo4jSession.run(
            `MATCH (a:Topic {topicId: $fromId})
             MATCH (b:Topic {topicId: $toId})
             MERGE (a)-[r:RELATED_TO]->(b)
             SET r.coOccurrenceCount = $count, r.strength = $strength
             MERGE (b)-[r2:RELATED_TO]->(a)
             SET r2.coOccurrenceCount = $count, r2.strength = $strength`,
            { fromId, toId, count, strength }
        );
    }

    // --- Neo4j: Derive INTERESTED_IN edges ---
    console.log(`  [Neo4j] Deriving INTERESTED_IN edges...`);
    await graphRepo.deriveInterestedInEdges(userId);

    const interestedInResult = await neo4jSession.run(
        `MATCH (u:User {userId: $userId})-[i:INTERESTED_IN]->(t:Topic) RETURN t.label AS label, i.strength AS strength ORDER BY i.strength DESC`,
        { userId }
    );
    const interestedIn = interestedInResult.records.map((r: any) => `${r.get('label')} (${Number(r.get('strength')).toFixed(1)})`);
    console.log(`  [Neo4j] INTERESTED_IN: ${interestedIn.join(', ')}`);

    return { userId, qdrantPoints: totalQdrantPoints, neo4jNodes: 1 };
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main() {
    console.log('\n=== nAIber Synthetic Data Seed ===\n');

    // Initialise clients
    Neo4jClient.getInstance({
        uri: process.env.NEO4J_URI!,
        username: process.env.NEO4J_USERNAME!,
        password: process.env.NEO4J_PASSWORD!,
        database: process.env.NEO4J_DATABASE,
    });
    await Neo4jClient.getInstance().verifyConnectivity();

    const embeddingModel = new OpenAIEmbeddings({
        apiKey: process.env.OPENAI_API_KEY!,
        model: 'text-embedding-3-small',
    });

    const vectorStoreConfig: VectorStoreConfigs = {
        baseUrl: QDRANT_URL,
        apiKey: QDRANT_API_KEY,
        collectionName: QDRANT_COLLECTION,
    };
    const vectorStore = new VectorStoreClient(vectorStoreConfig, embeddingModel);

    const graphRepo = new GraphRepository();

    // -------------------------------------------------------------------------
    // Step 1: Wipe Postgres (global deleteMany in FK order)
    // -------------------------------------------------------------------------
    console.log('--- Step 1: Wiping Postgres ---');
    await prisma.trustedContactSubmission.deleteMany({});
    await prisma.trustedContact.deleteMany({});
    await prisma.notification.deleteMany({});
    await prisma.cognitiveBaseline.deleteMany({});
    await prisma.cognitiveTestResult.deleteMany({});
    await prisma.healthCheckLog.deleteMany({});
    await prisma.conversationTopicReference.deleteMany({});
    await prisma.conversationSummary.deleteMany({});
    await prisma.conversationTopic.deleteMany({});
    await prisma.callLog.deleteMany({});
    await prisma.medicationCondition.deleteMany({});
    await prisma.userMedication.deleteMany({});
    await prisma.userHealthCondition.deleteMany({});
    await prisma.emergencyContact.deleteMany({});
    await prisma.caregiverUserLink.deleteMany({});
    await prisma.caregiverProfile.deleteMany({});
    await prisma.elderlyProfile.deleteMany({});
    await prisma.account.deleteMany({});
    await prisma.session.deleteMany({});
    await prisma.user.deleteMany({});
    console.log('Postgres wiped.');

    // -------------------------------------------------------------------------
    // Step 2: Wipe Neo4j (need existing user IDs — wipe all users then orphans)
    // -------------------------------------------------------------------------
    console.log('\n--- Step 2: Wiping Neo4j ---');
    const neo4jSession = (graphRepo as any).session;

    // Wipe by known seed phone numbers / patterns — simpler to just wipe all
    // Delete all User nodes and their subgraphs from prior seed runs
    await neo4jSession.run(
        `MATCH (u:User)
         OPTIONAL MATCH (u)-[:HAS_CONVERSATION]->(c:Conversation)
         OPTIONAL MATCH (c)-[:HAS_SUMMARY]->(s:Summary)
         OPTIONAL MATCH (c)-[:HAS_HIGHLIGHT]->(h:Highlight)
         DETACH DELETE u, c, s, h`
    );
    await neo4jWipeOrphanTopicsAndPersons(neo4jSession);
    console.log('Neo4j wiped.');

    // -------------------------------------------------------------------------
    // Step 3: Wipe Qdrant (by phone-derived userId — not known yet, wipe all conv_ points)
    // -------------------------------------------------------------------------
    console.log('\n--- Step 3: Wiping Qdrant ---');
    // We don't know the new UUIDs yet. Delete by conversationId prefix pattern is not
    // supported in Qdrant, so we scroll all points and delete by known conv IDs.
    const allConvIds = ALL_USERS.flatMap(u => u.conversations.map(c => c.convId));
    // Delete by conversationId field in metadata
    for (const convId of allConvIds) {
        await fetch(`${QDRANT_URL}/collections/${QDRANT_COLLECTION}/points/delete`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', ...(QDRANT_API_KEY ? { 'api-key': QDRANT_API_KEY } : {}) },
            body: JSON.stringify({ filter: { must: [{ key: 'metadata.conversationId', match: { value: convId } }] } }),
        });
    }
    console.log('Qdrant wiped (by conversationId).');

    // -------------------------------------------------------------------------
    // Step 4: Seed each user
    // -------------------------------------------------------------------------
    console.log('\n--- Step 4: Seeding users ---');
    const results: { name: string; userId: string; qdrantPoints: number }[] = [];

    for (const user of ALL_USERS) {
        console.log(`\nSeeding ${user.name}...`);
        const { userId, qdrantPoints } = await seedUser(user, vectorStore, graphRepo, embeddingModel);
        results.push({ name: user.name, userId, qdrantPoints });
    }

    // -------------------------------------------------------------------------
    // Summary
    // -------------------------------------------------------------------------
    console.log('\n\n=== Seed Complete ===\n');
    console.log('User'.padEnd(25) + 'Postgres ID'.padEnd(40) + 'Qdrant Points');
    console.log('-'.repeat(80));
    for (const r of results) {
        console.log(r.name.padEnd(25) + r.userId.padEnd(40) + r.qdrantPoints);
    }
    console.log('');
    console.log(`Verify with:`);
    console.log(`  npx tsx scripts/audit/audit-qdrant.ts <userId>`);
    console.log(`  npx tsx scripts/audit/audit-neo4j.ts <userId>`);
    console.log(`  npx tsx scripts/audit/audit-cross-reference.ts`);

    await graphRepo.close();
    await Neo4jClient.getInstance().closeDriver();
    await prisma.$disconnect();
}

main().catch(e => {
    console.error('Seed failed:', e);
    process.exit(1);
});
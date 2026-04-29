import 'dotenv/config';
import { randomUUID } from 'crypto';
import { PrismaClient } from '../generated/prisma/index.js';
import { Neo4jClient, VectorStoreClient, type VectorStoreConfigs } from '@naiber/shared-clients';
import { GraphRepository } from '../apps/llm-server/src/repositories/GraphRepository.js';
import { OpenAIEmbeddings } from '@langchain/openai';

const prisma = new PrismaClient();

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
  'DEMO_CAREGIVER_EMAIL'
] as const;

for (const key of REQUIRED_ENV) {
  if (!process.env[key]) {
    console.error(`Missing required env var: ${key}`);
    process.exit(1);
  }
}

const now = new Date();
const daysAgo = (d: number) => new Date(now.getTime() - d * 24 * 60 * 60 * 1000);

const QDRANT_URL = process.env.QDRANT_URL!;
const QDRANT_API_KEY = process.env.QDRANT_API_KEY!;
const QDRANT_COLLECTION = process.env.QDRANT_COLLECTION!;

type TopicKey =
  | 'gardening'
  | 'baking'
  | 'familyVisits'
  | 'healthManagement'
  | 'socialActivities'
  | 'birdWatching'
  | 'reading'
  | 'neighbourhood'
  | 'music'
  | 'weather'
  | 'cooking'
  | 'memoryHealth';

const TOPICS: Record<
  TopicKey,
  { label: string; variations: string[]; category: string }
> = {
  gardening: { label: 'gardening', variations: ['garden work', 'planting', 'flowers'], category: 'Hobby' },
  baking: { label: 'baking', variations: ['cookies', 'recipes', 'kitchen'], category: 'Hobby' },
  familyVisits: { label: 'family visits', variations: ['grandchildren', 'daughter', 'son'], category: 'Relationships' },
  healthManagement: { label: 'health management', variations: ['medications', 'pain', 'blood pressure'], category: 'Health' },
  socialActivities: { label: 'social activities', variations: ['bridge', 'friends', 'community'], category: 'Social' },
  birdWatching: { label: 'bird watching', variations: ['birds', 'feeder', 'backyard'], category: 'Hobby' },
  reading: { label: 'reading', variations: ['books', 'novel', 'library'], category: 'Hobby' },
  neighbourhood: { label: 'neighbourhood', variations: ['neighbour', 'street', 'events'], category: 'Social' },
  music: { label: 'music', variations: ['songs', 'classical', 'radio'], category: 'Hobby' },
  weather: { label: 'weather', variations: ['rain', 'sunshine', 'temperature'], category: 'General' },
  cooking: { label: 'cooking', variations: ['meals', 'soup', 'dinner'], category: 'Hobby' },
  memoryHealth: { label: 'memory health', variations: ['forgetfulness', 'remembering', 'mental sharpness'], category: 'Health' }
};

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

interface HealthDef {
  id: string;
  daysAgo: number;
  wellbeing: number;
  sleep: number;
  symptoms: string[];
  concerns: string[];
  positives: string[];
}

interface CognitiveDef {
  id: string;
  daysAgo: number;
  stabilityIndex: number;
  delayedRecall: number;
}

interface UserDef {
  slug: 'mg' | 'hc' | 'dw';
  name: string;
  age: number;
  phone: string;
  gender: 'MALE' | 'FEMALE';
  educationLevel: string;
  interests: string[];
  dislikes: string[];
  callFrequency: 'DAILY' | 'WEEKLY';
  caregiver: { name: string; email: string; phone: string; relationship: string };
  conditions: { condition: string; severity: string; notes: string; diagnosedAt: string }[];
  medications: { name: string; dosage: string; notes: string; prn?: boolean }[];
  trustedContact: { relationship: 'DAUGHTER' | 'SON'; contactFrequency: 'DAILY' | 'WEEKLY' };
  iadl: { shopping: number; transportation: number; totalScore: number };
  selfReport: { forgetfulness: number; conversation: number; repetition: number; total: number };
  conversations: ConversationDef[];
  healthCalls: HealthDef[];
  cognitiveCalls: CognitiveDef[];
}

function makeConversations(prefix: string, days: number[], coreTopics: TopicKey[], personName: string): ConversationDef[] {
  return days.map((d, i) => ({
    convId: `conv_${prefix}_${String(i + 1).padStart(3, '0')}`,
    callSid: `CA_${prefix}_${String(i + 1).padStart(3, '0')}`,
    daysAgo: d,
    durationMinutes: 7 + (i % 4),
    topics: [coreTopics[i % coreTopics.length], coreTopics[(i + 1) % coreTopics.length]],
    summary: `Conversation ${i + 1} focused on ${coreTopics[i % coreTopics.length]} and daily life updates. The discussion remained coherent and emotionally positive, with continuity from prior calls.`,
    highlights: [
      { text: `Key update from call ${i + 1}: meaningful activity and social engagement remained steady.`, importanceScore: 0.85 },
      { text: `Follow-up mention from call ${i + 1}: ongoing routine, health awareness, and family context.`, importanceScore: 0.8 }
    ],
    persons: i % 2 === 0
      ? [{ name: personName, role: 'family', context: `${personName} was referenced in planning and emotional support context.`, topicKeys: ['familyVisits'] }]
      : []
  }));
}

const USERS: UserDef[] = [
  {
    slug: 'mg',
    name: 'Margaret Thompson',
    age: 72,
    phone: process.env.PHONE_NUMBER!,
    gender: 'FEMALE',
    educationLevel: 'SECONDARY_OR_HIGH_SCHOOL',
    interests: ['Gardening', 'Baking cookies', 'Watching birds', 'Reading mystery novels', 'Talking with grandchildren', 'Playing bridge with friends'],
    dislikes: ['Cold weather', 'Loud noises', 'Fast-paced action movies', 'Spicy food'],
    callFrequency: 'DAILY',
    caregiver: { name: 'Sarah Thompson', email: process.env.DEMO_CAREGIVER_EMAIL!, phone: '+1234567890', relationship: 'DAUGHTER' },
    conditions: [
      { condition: 'Type 2 Diabetes', severity: 'Moderate', notes: 'Well-controlled with medication and diet', diagnosedAt: '2015-03-15' },
      { condition: 'Hypertension', severity: 'Mild', notes: 'Controlled with medication', diagnosedAt: '2012-06-20' },
      { condition: 'Osteoarthritis', severity: 'Moderate', notes: 'Primarily affects knees and hands', diagnosedAt: '2018-09-10' }
    ],
    medications: [
      { name: 'Metformin', dosage: '500mg', notes: 'For diabetes management. Take with meals.' },
      { name: 'Lisinopril', dosage: '10mg', notes: 'For blood pressure. Take in the morning.' },
      { name: 'Vitamin D3', dosage: '2000 IU', notes: 'Supplement for bone health' },
      { name: 'Ibuprofen', dosage: '200mg', notes: 'For arthritis pain, as needed', prn: true }
    ],
    trustedContact: { relationship: 'DAUGHTER', contactFrequency: 'DAILY' },
    iadl: { shopping: 0, transportation: 1, totalScore: 7 },
    selfReport: { forgetfulness: 2, conversation: 1, repetition: 1, total: 4 },
    conversations: makeConversations('mg', [28, 26, 24, 22, 20, 18, 16, 14, 12, 10, 8, 6, 3, 1], ['gardening', 'baking', 'birdWatching', 'familyVisits', 'healthManagement', 'socialActivities'], 'Emily'),
    healthCalls: [
      { id: '001', daysAgo: 25, wellbeing: 7, sleep: 6, symptoms: ['mild knee pain'], concerns: ['blood pressure fluctuation'], positives: ['medications mostly on track'] },
      { id: '002', daysAgo: 19, wellbeing: 6, sleep: 5, symptoms: ['knee pain', 'fatigue'], concerns: ['arthritis flare'], positives: ['family support'] },
      { id: '003', daysAgo: 13, wellbeing: 7, sleep: 6, symptoms: ['mild stiffness'], concerns: ['monitoring blood sugar'], positives: ['better mobility'] },
      { id: '004', daysAgo: 7, wellbeing: 8, sleep: 7, symptoms: ['minor morning stiffness'], concerns: ['none significant'], positives: ['feeling active'] }
    ],
    cognitiveCalls: [
      { id: '001', daysAgo: 27, stabilityIndex: 0.82, delayedRecall: 0.64 },
      { id: '002', daysAgo: 21, stabilityIndex: 0.79, delayedRecall: 0.6 },
      { id: '003', daysAgo: 15, stabilityIndex: 0.75, delayedRecall: 0.56 },
      { id: '004', daysAgo: 9, stabilityIndex: 0.71, delayedRecall: 0.52 },
      { id: '005', daysAgo: 4, stabilityIndex: 0.68, delayedRecall: 0.5 }
    ]
  },
  {
    slug: 'hc',
    name: 'Harold Chen',
    age: 78,
    phone: '+15550000002',
    gender: 'MALE',
    educationLevel: 'BACHELORS_OR_EQUIVALENT',
    interests: ['Classical music', 'Reading', 'Neighbourhood walks', 'Technology', 'Family calls'],
    dislikes: ['Loud environments', 'Rushed conversations', 'Spicy food'],
    callFrequency: 'WEEKLY',
    caregiver: { name: 'David Chen', email: 'david.chen@email.com', phone: '+15550000012', relationship: 'SON' },
    conditions: [
      { condition: 'Congestive Heart Failure', severity: 'Moderate', notes: 'On fluid restriction and low-sodium diet', diagnosedAt: '2024-12-01' },
      { condition: 'Type 2 Diabetes', severity: 'Moderate', notes: 'Managed with Metformin', diagnosedAt: '2019-05-09' },
      { condition: 'Limited Mobility', severity: 'Mild', notes: 'Needs pacing during walks', diagnosedAt: '2025-02-20' }
    ],
    medications: [
      { name: 'Furosemide', dosage: '40mg', notes: 'Diuretic for fluid retention. Take in the morning.' },
      { name: 'Metformin', dosage: '500mg', notes: 'For diabetes management. Take with meals.' },
      { name: 'Aspirin', dosage: '75mg', notes: 'Daily low-dose for cardiovascular protection.' }
    ],
    trustedContact: { relationship: 'SON', contactFrequency: 'WEEKLY' },
    iadl: { shopping: 0, transportation: 0, totalScore: 6 },
    selfReport: { forgetfulness: 2, conversation: 2, repetition: 1, total: 5 },
    conversations: makeConversations('hc', [26, 24, 22, 20, 18, 16, 14, 12, 10, 8, 6, 4, 2], ['healthManagement', 'music', 'reading', 'neighbourhood', 'familyVisits', 'cooking'], 'David'),
    healthCalls: [
      { id: '001', daysAgo: 25, wellbeing: 7, sleep: 6, symptoms: ['mild breathlessness'], concerns: ['fluid balance'], positives: ['improved routine'] },
      { id: '002', daysAgo: 19, wellbeing: 6, sleep: 5, symptoms: ['fatigue', 'lower stamina'], concerns: ['reduced activity'], positives: ['caregiver check-ins'] },
      { id: '003', daysAgo: 13, wellbeing: 7, sleep: 6, symptoms: ['mild fatigue'], concerns: ['monitor CHF signs'], positives: ['walking tolerance improving'] },
      { id: '004', daysAgo: 7, wellbeing: 8, sleep: 7, symptoms: ['minimal symptoms'], concerns: ['none urgent'], positives: ['good medication adherence'] }
    ],
    cognitiveCalls: [
      { id: '001', daysAgo: 23, stabilityIndex: 0.78, delayedRecall: 0.61 },
      { id: '002', daysAgo: 17, stabilityIndex: 0.76, delayedRecall: 0.58 },
      { id: '003', daysAgo: 11, stabilityIndex: 0.73, delayedRecall: 0.54 },
      { id: '004', daysAgo: 5, stabilityIndex: 0.7, delayedRecall: 0.5 },
      { id: '005', daysAgo: 1, stabilityIndex: 0.67, delayedRecall: 0.47 }
    ]
  },
  {
    slug: 'dw',
    name: 'Dorothy Walsh',
    age: 68,
    phone: '+15550000003',
    gender: 'FEMALE',
    educationLevel: 'BACHELORS_OR_EQUIVALENT',
    interests: ['Community events', 'Baking', 'Bird watching', 'Walking', 'Health advocacy'],
    dislikes: ['Inactivity', 'Being patronised', 'Processed food'],
    callFrequency: 'DAILY',
    caregiver: { name: 'Michael Walsh', email: 'michael.walsh@email.com', phone: '+15550000013', relationship: 'SON' },
    conditions: [
      { condition: 'Mild Arthritis', severity: 'Mild', notes: 'Mostly in hands and knees', diagnosedAt: '2020-03-14' },
      { condition: 'High Cholesterol', severity: 'Moderate', notes: 'Monitoring monthly', diagnosedAt: '2025-01-10' },
      { condition: 'Situational Anxiety', severity: 'Mild', notes: 'Improving with social engagement', diagnosedAt: '2024-11-01' }
    ],
    medications: [
      { name: 'Atorvastatin', dosage: '20mg', notes: 'For high cholesterol. Take in the evening.' },
      { name: 'Paracetamol', dosage: '500mg', notes: 'For arthritis pain, as needed', prn: true }
    ],
    trustedContact: { relationship: 'SON', contactFrequency: 'WEEKLY' },
    iadl: { shopping: 1, transportation: 1, totalScore: 8 },
    selfReport: { forgetfulness: 2, conversation: 1, repetition: 2, total: 5 },
    conversations: makeConversations('dw', [24, 22, 20, 18, 16, 14, 12, 10, 8, 6, 3, 0], ['socialActivities', 'baking', 'healthManagement', 'memoryHealth', 'birdWatching', 'familyVisits'], 'Michael'),
    healthCalls: [
      { id: '001', daysAgo: 23, wellbeing: 7, sleep: 6, symptoms: ['mild hand pain'], concerns: ['cholesterol management'], positives: ['active schedule'] },
      { id: '002', daysAgo: 17, wellbeing: 6, sleep: 5, symptoms: ['knee stiffness'], concerns: ['sleep disruption'], positives: ['community support'] },
      { id: '003', daysAgo: 11, wellbeing: 7, sleep: 6, symptoms: ['occasional hand pain'], concerns: ['none urgent'], positives: ['improving sleep'] },
      { id: '004', daysAgo: 5, wellbeing: 8, sleep: 7, symptoms: ['minimal symptoms'], concerns: ['routine check'], positives: ['feeling energized'] }
    ],
    cognitiveCalls: [
      { id: '001', daysAgo: 21, stabilityIndex: 0.85, delayedRecall: 0.69 },
      { id: '002', daysAgo: 15, stabilityIndex: 0.83, delayedRecall: 0.65 },
      { id: '003', daysAgo: 9, stabilityIndex: 0.8, delayedRecall: 0.62 },
      { id: '004', daysAgo: 4, stabilityIndex: 0.78, delayedRecall: 0.59 },
      { id: '005', daysAgo: 1, stabilityIndex: 0.75, delayedRecall: 0.56 }
    ]
  }
];

function tokenizeWords(text: string): string[] {
  return (text.toLowerCase().match(/[a-z']+/g) ?? []).filter(Boolean);
}

function lexicalMetrics(text: string): { ttr: number; mtld: number } {
  const words = tokenizeWords(text);
  const uniq = new Set(words);
  const ttr = words.length ? uniq.size / words.length : 0;
  const mtld = words.length ? Math.max(5, (words.length / Math.max(1, 1 - ttr)) / 10) : 0;
  return { ttr: Number(ttr.toFixed(2)), mtld: Number(mtld.toFixed(1)) };
}

function syntacticMetrics(text: string): { mlu: number; clausesPerSentence: number } {
  const sentences = text.split(/[.!?]+/).map((s) => s.trim()).filter(Boolean);
  const words = tokenizeWords(text);
  const mlu = sentences.length ? words.length / sentences.length : 0;
  const clauseMarkers = (text.match(/\b(and|but|because|which|that|while|although)\b/gi) ?? []).length;
  const clausesPerSentence = sentences.length ? (sentences.length + clauseMarkers) / sentences.length : 0;
  return { mlu: Number(mlu.toFixed(1)), clausesPerSentence: Number(clausesPerSentence.toFixed(1)) };
}

function disfluencyMetrics(text: string, durationMinutes: number): { perMinute: number } {
  const fillers = (text.match(/\b(um|uh|like|you know)\b/gi) ?? []).length;
  const perMinute = durationMinutes > 0 ? fillers / durationMinutes : 0;
  return { perMinute: Number(perMinute.toFixed(1)) };
}

function buildDomainScores(delayedRecall: number, attention: number): Record<string, { raw: number; maxPossible: number; normalized: number }> {
  return {
    orientation: { raw: 4, maxPossible: 4, normalized: 1 },
    attentionConcentration: { raw: Math.round(attention * 10), maxPossible: 10, normalized: attention },
    workingMemory: { raw: Math.round((attention + 0.05) * 6), maxPossible: 6, normalized: Number((attention + 0.05).toFixed(2)) },
    delayedRecall: { raw: Math.round(delayedRecall * 15), maxPossible: 15, normalized: delayedRecall },
    languageVerbalFluency: { raw: Math.round((attention + 0.1) * 20), maxPossible: 20, normalized: Number((attention + 0.1).toFixed(2)) },
    abstractionReasoning: { raw: 3, maxPossible: 4, normalized: 0.75 }
  };
}

async function generateEmbedding(text: string, embeddingModel: OpenAIEmbeddings): Promise<number[]> {
  return embeddingModel.embedQuery(text);
}

async function getSemanticCoherence(text: string, embeddingModel: OpenAIEmbeddings): Promise<{ cosineSimilarity: number }> {
  const parts = text.split(/[.!?]+/).map((s) => s.trim()).filter(Boolean);
  if (parts.length < 2) return { cosineSimilarity: 0 };
  const vectors = await Promise.all(parts.slice(0, 3).map((p) => generateEmbedding(p, embeddingModel)));
  let pairScores = 0;
  let pairCount = 0;
  for (let i = 0; i < vectors.length - 1; i++) {
    const a = vectors[i];
    const b = vectors[i + 1];
    let dot = 0;
    let na = 0;
    let nb = 0;
    for (let j = 0; j < a.length; j++) {
      dot += a[j] * b[j];
      na += a[j] * a[j];
      nb += b[j] * b[j];
    }
    pairScores += dot / (Math.sqrt(na) * Math.sqrt(nb));
    pairCount++;
  }
  return { cosineSimilarity: Number((pairScores / Math.max(1, pairCount)).toFixed(2)) };
}

function signalSufficiency(callType: 'GENERAL' | 'HEALTH_CHECK' | 'COGNITIVE', signalType: string): boolean {
  if (callType === 'GENERAL') return true;
  if (callType === 'HEALTH_CHECK') return signalType !== 'LEXICAL_DIVERSITY' && signalType !== 'SYNTACTIC_COMPLEXITY';
  return signalType === 'DISFLUENCY_RATE' || signalType === 'RESPONSE_LATENCY';
}

async function writeIndirectSignals(input: {
  elderlyProfileId: string;
  callLogId: string;
  conversationId: string;
  callType: 'GENERAL' | 'HEALTH_CHECK' | 'COGNITIVE';
  text: string;
  durationMinutes: number;
  embeddingModel: OpenAIEmbeddings;
}) {
  const lexical = lexicalMetrics(input.text);
  const syntax = syntacticMetrics(input.text);
  const semantic = await getSemanticCoherence(input.text, input.embeddingModel);
  const disfluency = disfluencyMetrics(input.text, input.durationMinutes);
  const responseLatency = { avgSeconds: Number((1.5 + Math.random() * 2).toFixed(1)) };

  const signals = [
    { signalType: 'LEXICAL_DIVERSITY', rawValue: lexical },
    { signalType: 'SYNTACTIC_COMPLEXITY', rawValue: syntax },
    { signalType: 'SEMANTIC_COHERENCE', rawValue: semantic },
    { signalType: 'DISFLUENCY_RATE', rawValue: disfluency },
    { signalType: 'RESPONSE_LATENCY', rawValue: responseLatency }
  ];

  for (const sig of signals) {
    const sufficiencyMet = signalSufficiency(input.callType, sig.signalType);
    await prisma.indirectSignal.create({
      data: {
        elderlyProfileId: input.elderlyProfileId,
        callLogId: input.callLogId,
        conversationId: input.conversationId,
        callType: input.callType,
        signalType: sig.signalType as
          | 'LEXICAL_DIVERSITY'
          | 'SYNTACTIC_COMPLEXITY'
          | 'SEMANTIC_COHERENCE'
          | 'DISFLUENCY_RATE'
          | 'RESPONSE_LATENCY',
        rawValue: sig.rawValue,
        confidence: sufficiencyMet ? 1 : 0,
        confounders: [],
        provenance: { method: 'transcript_analysis', model: 'rule_based_v1' },
        sufficiencyMet,
        insufficiencyReason: sufficiencyMet ? null : 'structured_call_insufficient_natural_language'
      }
    });
  }
}

function mapSeverity(severity: string): 'MILD' | 'MODERATE' | 'SEVERE' | 'UNKNOWN' {
  const s = severity.toLowerCase();
  if (s.includes('mild')) return 'MILD';
  if (s.includes('moderate')) return 'MODERATE';
  if (s.includes('severe')) return 'SEVERE';
  return 'UNKNOWN';
}

async function seedUser(user: UserDef, vectorStore: VectorStoreClient, graphRepo: GraphRepository, embeddingModel: OpenAIEmbeddings) {
  const authUser = await prisma.user.create({
    data: { name: user.caregiver.name, email: user.caregiver.email }
  });

  const elderlyProfile = await prisma.elderlyProfile.create({
    data: {
      name: user.name,
      age: user.age,
      phone: user.phone,
      gender: user.gender,
      educationLevel: user.educationLevel as
        | 'SECONDARY_OR_HIGH_SCHOOL'
        | 'BACHELORS_OR_EQUIVALENT',
      interests: user.interests,
      dislikes: user.dislikes,
      callFrequency: user.callFrequency,
      preferredCallTime: new Date('1970-01-01T14:00:00Z'),
      isFirstCall: false,
      enableHealthCheckIns: true,
      lastCallAt: daysAgo(1),
      emergencyContact: {
        create: {
          name: user.caregiver.name,
          phone: user.caregiver.phone,
          email: user.caregiver.email,
          relationship: user.caregiver.relationship,
          smsEnabled: true,
          notifyOnMissedCalls: true
        }
      },
      healthConditions: {
        create: user.conditions.map((c) => ({
          condition: c.condition,
          severity: c.severity,
          diagnosedAt: new Date(c.diagnosedAt),
          notes: c.notes,
          isActive: true
        }))
      },
      medications: {
        create: user.medications.map((m) => ({
          name: m.name,
          dosage: m.dosage,
          frequency: m.prn ? { prn: true } : { timesPerDay: 1 },
          notes: m.notes,
          isActive: true
        }))
      }
    }
  });

  await prisma.caregiverProfile.create({
    data: {
      authUserId: authUser.id,
      name: user.caregiver.name,
      phone: user.caregiver.phone,
      relationship: user.caregiver.relationship as 'DAUGHTER' | 'SON',
      managedUsers: {
        create: {
          elderlyProfileId: elderlyProfile.id,
          isPrimary: true,
          status: 'ACTIVE'
        }
      }
    }
  });

  const conditions = await prisma.userHealthCondition.findMany({ where: { elderlyProfileId: elderlyProfile.id } });
  const medications = await prisma.userMedication.findMany({ where: { elderlyProfileId: elderlyProfile.id } });

  for (const med of medications) {
    const matched = conditions.find((c) =>
      med.name.toLowerCase().includes('metformin') ? c.condition.toLowerCase().includes('diabetes')
        : med.name.toLowerCase().includes('lisinopril') || med.name.toLowerCase().includes('furosemide') || med.name.toLowerCase().includes('aspirin')
          ? c.condition.toLowerCase().includes('hypertension') || c.condition.toLowerCase().includes('heart')
          : med.name.toLowerCase().includes('ibuprofen') || med.name.toLowerCase().includes('paracetamol')
            ? c.condition.toLowerCase().includes('arthritis')
            : med.name.toLowerCase().includes('atorvastatin')
              ? c.condition.toLowerCase().includes('cholesterol')
              : false
    );
    if (matched) {
      await prisma.medicationCondition.upsert({
        where: {
          medicationId_healthConditionId: {
            medicationId: med.id,
            healthConditionId: matched.id
          }
        },
        create: {
          medicationId: med.id,
          healthConditionId: matched.id
        },
        update: {}
      });
    }
  }

  const trustedContact = await prisma.trustedContact.create({
    data: {
      elderlyProfileId: elderlyProfile.id,
      name: user.caregiver.name,
      relationship: user.trustedContact.relationship,
      knownDurationYears: 25,
      contactFrequency: user.trustedContact.contactFrequency,
      reliabilityTier: 'HIGH',
      isPrimary: true,
      informantConcernIndex: 2.94,
      weightedInformantIndex: 2.65
    }
  });

  await prisma.trustedContactSubmission.create({
    data: {
      trustedContactId: trustedContact.id,
      submissionType: 'ONBOARDING',
      structuredResponses: {
        memory_recent_events: 3,
        recalling_conversations: 3,
        remembering_locations: 3,
        adapting_routine: 3
      },
      rawScore: 47,
      informantConcernIndex: 2.94
    }
  });

  await prisma.trustedContact.update({
    where: { id: trustedContact.id },
    data: { weightedInformantIndex: 2.65 }
  });

  await prisma.iadlAssessment.create({
    data: {
      elderlyProfileId: elderlyProfile.id,
      trustedContactId: trustedContact.id,
      source: 'ONBOARDING',
      telephoneUse: 1,
      shopping: user.iadl.shopping,
      foodPreparation: 1,
      housekeeping: 1,
      laundry: 1,
      transportation: user.iadl.transportation,
      medicationManagement: 1,
      finances: 1,
      totalScore: user.iadl.totalScore
    }
  });

  await prisma.cognitiveSelfReport.create({
    data: {
      elderlyProfileId: elderlyProfile.id,
      source: 'ONBOARDING',
      forgetfulnessFrequency: user.selfReport.forgetfulness,
      conversationDifficultyFrequency: user.selfReport.conversation,
      repetitionFrequency: user.selfReport.repetition,
      totalConcernScore: user.selfReport.total
    }
  });

  const usedTopicKeys = Array.from(new Set(user.conversations.flatMap((c) => c.topics)));
  const topicIdByKey: Record<string, string> = {};

  await graphRepo.mergeUser({ userId: elderlyProfile.id, name: user.name });

  for (const key of usedTopicKeys) {
    const topic = TOPICS[key];
    const topicEmbedding = await generateEmbedding(topic.label, embeddingModel);
    const createdTopic = await prisma.conversationTopic.create({
      data: {
        elderlyProfileId: elderlyProfile.id,
        topicName: topic.label,
        variations: topic.variations,
        category: topic.category,
        topicEmbedding
      }
    });
    topicIdByKey[key] = createdTopic.id;
    await graphRepo.mergeTopic({
      topicId: createdTopic.id,
      label: topic.label,
      variations: topic.variations,
      createdAt: now.toISOString(),
      lastUpdated: now.toISOString()
    });
  }

  for (const conv of user.conversations) {
    const startedAt = daysAgo(conv.daysAgo);
    const callLog = await prisma.callLog.create({
      data: {
        elderlyProfileId: elderlyProfile.id,
        callType: 'GENERAL',
        scheduledTime: startedAt,
        endTime: new Date(startedAt.getTime() + conv.durationMinutes * 60 * 1000),
        status: 'COMPLETED',
        outcome: 'COMPLETED',
        checkInCompleted: true,
        twilioCallSid: conv.callSid,
        elevenlabsConversationId: conv.convId
      }
    });

    const summary = await prisma.conversationSummary.create({
      data: {
        elderlyProfileId: elderlyProfile.id,
        conversationId: conv.convId,
        callLogId: callLog.id,
        summaryText: conv.summary,
        durationMinutes: conv.durationMinutes,
        topicsDiscussed: conv.topics.map((t) => TOPICS[t].label),
        keyHighlights: conv.highlights.map((h) => h.text),
        createdAt: startedAt
      }
    });

    await prisma.conversationTopicReference.createMany({
      data: conv.topics.map((t) => ({
        conversationSummaryId: summary.id,
        conversationTopicId: topicIdByKey[t]
      }))
    });

    const highlightEntries: { id: string; text: string; embedding: number[]; importanceScore: number }[] = [];
    for (const highlight of conv.highlights) {
      highlightEntries.push({
        id: randomUUID(),
        text: highlight.text,
        embedding: await generateEmbedding(highlight.text, embeddingModel),
        importanceScore: highlight.importanceScore
      });
    }

    await vectorStore.addMemoriesWithIds(
      highlightEntries.map((h) => ({ id: h.id, text: h.text, embedding: h.embedding })),
      { userId: elderlyProfile.id, conversationId: conv.convId, createdAt: startedAt.toISOString(), summaryId: summary.id }
    );

    await graphRepo.mergeConversation({
      conversationId: conv.convId,
      date: startedAt.toISOString().split('T')[0],
      durationMinutes: conv.durationMinutes,
      callType: 'general',
      outcome: 'completed'
    });
    await graphRepo.mergeSummary({ id: summary.id, text: conv.summary, createdAt: startedAt.toISOString() });
    await graphRepo.linkUserToConversation({ userId: elderlyProfile.id, conversationId: conv.convId });
    await graphRepo.linkConversationToSummary({ conversationId: conv.convId, summaryId: summary.id, createdAt: startedAt.toISOString() });

    for (const h of highlightEntries) {
      await graphRepo.mergeHighlight({
        id: randomUUID(),
        qdrantPointId: h.id,
        text: h.text,
        importanceScore: h.importanceScore,
        createdAt: startedAt.toISOString()
      });
      await graphRepo.linkConversationToHighlight({
        conversationId: conv.convId,
        highlightQdrantPointId: h.id,
        createdAt: startedAt.toISOString()
      });
      await graphRepo.linkSummaryToHighlight({ summaryId: summary.id, highlightQdrantPointId: h.id });
    }

    for (const t of conv.topics) {
      const topicId = topicIdByKey[t];
      await graphRepo.linkSummaryToTopic({ summaryId: summary.id, topicId, similarityScore: 0.85 });
      await graphRepo.upsertUserMentionsTopic({
        userId: elderlyProfile.id,
        topicId,
        firstSeen: startedAt.toISOString(),
        lastSeen: startedAt.toISOString()
      });
      for (const h of highlightEntries) {
        await graphRepo.linkHighlightToTopic({ highlightId: h.id, topicId, similarityScore: 0.75 });
      }
    }

    for (const p of conv.persons) {
      const personId = randomUUID();
      await graphRepo.mergePerson({ id: personId, name: p.name, role: p.role });
      await graphRepo.upsertUserMentionedPerson({
        userId: elderlyProfile.id,
        personId,
        context: p.context,
        lastSeen: startedAt.toISOString()
      });
      for (const topicKey of p.topicKeys) {
        await graphRepo.upsertPersonAssociatedWithTopic({
          personId,
          topicId: topicIdByKey[topicKey],
          lastSeen: startedAt.toISOString()
        });
      }
    }

    await writeIndirectSignals({
      elderlyProfileId: elderlyProfile.id,
      callLogId: callLog.id,
      conversationId: conv.convId,
      callType: 'GENERAL',
      text: conv.summary,
      durationMinutes: conv.durationMinutes,
      embeddingModel
    });
  }

  await graphRepo.deriveInterestedInEdges(elderlyProfile.id);

  const healthRows: {
    wellbeing: number;
    sleep: number;
    symptoms: string[];
    medStats: Record<string, { taken: number; total: number }>;
    conditionState: Record<string, { severity: 'MILD' | 'MODERATE' | 'SEVERE' | 'UNKNOWN'; change: 'IMPROVED' | 'STABLE' | 'WORSE' | 'UNKNOWN' }>;
  }[] = [];

  for (let i = 0; i < user.healthCalls.length; i++) {
    const hc = user.healthCalls[i];
    const conversationId = `health_${user.slug}_${hc.id}`;
    const startedAt = daysAgo(hc.daysAgo);
    const callLog = await prisma.callLog.create({
      data: {
        elderlyProfileId: elderlyProfile.id,
        callType: 'HEALTH_CHECK',
        scheduledTime: startedAt,
        endTime: new Date(startedAt.getTime() + 7 * 60 * 1000),
        status: 'COMPLETED',
        outcome: 'COMPLETED',
        checkInCompleted: true,
        twilioCallSid: `CA_health_${user.slug}_${hc.id}`,
        elevenlabsConversationId: conversationId
      }
    });

    const answers = [
      { id: 'general_wellbeing', answer: `Overall wellbeing ${hc.wellbeing}/10` },
      { id: 'pain_level', answer: hc.symptoms.join(', ') },
      { id: 'sleep_quality', answer: `Sleep quality ${hc.sleep}/10` },
      { id: 'appetite', answer: 'Appetite stable' },
      { id: 'medication_adherence', answer: 'Mostly yes' },
      { id: 'mood', answer: 'Calm and engaged' }
    ];

    const healthCheckLog = await prisma.healthCheckLog.create({
      data: {
        elderlyProfileId: elderlyProfile.id,
        conversationId,
        callLogId: callLog.id,
        answers
      }
    });

    await prisma.wellbeingLog.create({
      data: {
        healthCheckLogId: healthCheckLog.id,
        elderlyProfileId: elderlyProfile.id,
        conversationId,
        overallWellbeing: hc.wellbeing,
        sleepQuality: hc.sleep,
        physicalSymptoms: hc.symptoms,
        concerns: hc.concerns,
        positives: hc.positives,
        generalNotes: `Trend point ${i + 1} for ${user.name}`
      }
    });

    const medStats: Record<string, { taken: number; total: number }> = {};
    for (const med of medications) {
      const isPrn = Boolean((med.frequency as { prn?: boolean })?.prn);
      const medicationTaken = isPrn ? i !== 1 : true;
      await prisma.medicationLog.create({
        data: {
          healthCheckLogId: healthCheckLog.id,
          elderlyProfileId: elderlyProfile.id,
          conversationId,
          medicationId: med.id,
          medicationTaken,
          notes: medicationTaken ? 'Taken as expected' : 'Occasionally skipped PRN medication',
          adherenceContext: 'specific_date',
          takenAt: startedAt
        }
      });
      medStats[med.id] = { taken: medicationTaken ? 1 : 0, total: 1 };
    }

    const conditionState: Record<string, { severity: 'MILD' | 'MODERATE' | 'SEVERE' | 'UNKNOWN'; change: 'IMPROVED' | 'STABLE' | 'WORSE' | 'UNKNOWN' }> = {};
    for (const condition of conditions) {
      const change =
        i === 0 ? 'STABLE'
          : i === 1 ? 'WORSE'
            : i === 2 ? 'IMPROVED'
              : 'IMPROVED';
      const severity = mapSeverity(condition.severity ?? 'unknown');
      await prisma.healthConditionLog.create({
        data: {
          healthCheckLogId: healthCheckLog.id,
          elderlyProfileId: elderlyProfile.id,
          conversationId,
          conditionId: condition.id,
          rawNotes: `${condition.condition} monitored during call ${i + 1}`,
          symptoms: hc.symptoms,
          severity,
          changeFromBaseline: change,
          notableFlags: change === 'WORSE' ? ['temporary_worsening'] : []
        }
      });
      conditionState[condition.id] = { severity, change };
    }

    healthRows.push({ wellbeing: hc.wellbeing, sleep: hc.sleep, symptoms: hc.symptoms, medStats, conditionState });

    await writeIndirectSignals({
      elderlyProfileId: elderlyProfile.id,
      callLogId: callLog.id,
      conversationId,
      callType: 'HEALTH_CHECK',
      text: `Health call discussing symptoms: ${hc.symptoms.join(', ')} and concerns: ${hc.concerns.join(', ')}`,
      durationMinutes: 7,
      embeddingModel
    });
  }

  const avgWellbeing = healthRows.reduce((sum, r) => sum + r.wellbeing, 0) / healthRows.length;
  const avgSleep = healthRows.reduce((sum, r) => sum + r.sleep, 0) / healthRows.length;

  const healthBaseline = await prisma.healthBaseline.upsert({
    where: { elderlyProfileId: elderlyProfile.id },
    create: {
      elderlyProfileId: elderlyProfile.id,
      callsIncluded: healthRows.length,
      avgWellbeing,
      avgSleepQuality: avgSleep
    },
    update: {
      callsIncluded: healthRows.length,
      avgWellbeing,
      avgSleepQuality: avgSleep,
      computedAt: new Date()
    }
  });

  await prisma.healthBaselineSymptom.deleteMany({ where: { baselineId: healthBaseline.id } });
  await prisma.healthBaselineMedication.deleteMany({ where: { baselineId: healthBaseline.id } });
  await prisma.healthBaselineCondition.deleteMany({ where: { baselineId: healthBaseline.id } });

  const symptomCounts = new Map<string, number>();
  for (const row of healthRows) {
    for (const symptom of row.symptoms) {
      symptomCounts.set(symptom, (symptomCounts.get(symptom) ?? 0) + 1);
    }
  }
  await prisma.healthBaselineSymptom.createMany({
    data: Array.from(symptomCounts.entries()).map(([symptom, count]) => ({
      baselineId: healthBaseline.id,
      symptom,
      count
    }))
  });

  const medicationAgg = medications.map((med) => {
    let takenCount = 0;
    let totalCount = 0;
    for (const row of healthRows) {
      const stat = row.medStats[med.id];
      takenCount += stat?.taken ?? 0;
      totalCount += stat?.total ?? 0;
    }
    const adherenceRate = totalCount ? Math.round((takenCount / totalCount) * 100) : 0;
    return { medicationId: med.id, medicationName: med.name, takenCount, totalCount, adherenceRate };
  });
  await prisma.healthBaselineMedication.createMany({
    data: medicationAgg.map((m) => ({ baselineId: healthBaseline.id, ...m }))
  });

  const latestHealthRow = healthRows[healthRows.length - 1];
  await prisma.healthBaselineCondition.createMany({
    data: conditions.map((condition) => ({
      baselineId: healthBaseline.id,
      conditionId: condition.id,
      conditionName: condition.condition,
      latestSeverity: latestHealthRow.conditionState[condition.id]?.severity ?? 'UNKNOWN',
      latestChange: latestHealthRow.conditionState[condition.id]?.change ?? 'UNKNOWN'
    }))
  });

  const cognitiveSessions: Record<string, { normalized: number }>[] = [];
  for (let i = 0; i < user.cognitiveCalls.length; i++) {
    const cg = user.cognitiveCalls[i];
    const conversationId = `cognitive_${user.slug}_${cg.id}`;
    const startedAt = daysAgo(cg.daysAgo);
    const callLog = await prisma.callLog.create({
      data: {
        elderlyProfileId: elderlyProfile.id,
        callType: 'COGNITIVE',
        scheduledTime: startedAt,
        endTime: new Date(startedAt.getTime() + 10 * 60 * 1000),
        status: 'COMPLETED',
        outcome: 'COMPLETED',
        checkInCompleted: true,
        twilioCallSid: `CA_cognitive_${user.slug}_${cg.id}`,
        elevenlabsConversationId: conversationId
      }
    });

    const attention = Number((Math.max(0.58, cg.stabilityIndex - 0.08)).toFixed(2));
    const domainScores = buildDomainScores(cg.delayedRecall, attention);
    const taskResponses = [
      { taskId: 'ORIENTATION', correct: true, score: 1, notes: 'oriented' },
      { taskId: 'WORD_REGISTRATION', correct: true, score: 1, notes: 'registered words' },
      { taskId: 'DIGIT_FORWARD', correct: i < 4, score: i < 4 ? 1 : 0, notes: 'attention span' },
      { taskId: 'DIGIT_REVERSE', correct: i < 3, score: i < 3 ? 1 : 0, notes: 'working memory' },
      { taskId: 'SERIAL_7S', correct: i < 3, score: i < 3 ? 1 : 0, notes: 'subtraction task' },
      { taskId: 'LETTER_VIGILANCE', correct: true, score: 1, notes: 'vigilance stable' },
      { taskId: 'LETTER_FLUENCY', correct: true, score: 1, notes: 'language fluency mild variation' },
      { taskId: 'ABSTRACTION', correct: true, score: 1, notes: 'abstraction stable' },
      { taskId: 'DELAYED_RECALL', correct: cg.delayedRecall > 0.55, score: cg.delayedRecall > 0.55 ? 1 : 0, notes: 'primary declining domain' }
    ];

    await prisma.cognitiveTestResult.create({
      data: {
        elderlyProfileId: elderlyProfile.id,
        conversationId,
        callLogId: callLog.id,
        source: 'voice',
        modality: 'phone_call',
        sessionIndex: i + 1,
        wordListUsed: ['A', 'B', 'C'][i % 3],
        digitSetUsed: [3, 4, 5][i % 3],
        letterUsed: ['A', 'B', 'C'][i % 3],
        abstractionSetUsed: i % 3,
        vigilanceSetUsed: i % 3,
        domainScores,
        taskResponses,
        stabilityIndex: cg.stabilityIndex,
        isPartial: false,
        distressDetected: false,
        completedAt: startedAt
      }
    });

    const normalizedDomainScores: Record<string, { normalized: number }> = {};
    for (const [domainKey, domainValue] of Object.entries(domainScores)) {
      normalizedDomainScores[domainKey] = { normalized: domainValue.normalized };
    }
    cognitiveSessions.push(normalizedDomainScores);

    await writeIndirectSignals({
      elderlyProfileId: elderlyProfile.id,
      callLogId: callLog.id,
      conversationId,
      callType: 'COGNITIVE',
      text: `Cognitive structured task session ${i + 1}, delayed recall trend monitored.`,
      durationMinutes: 10,
      embeddingModel
    });
  }

  const domainNames = ['orientation', 'attentionConcentration', 'workingMemory', 'delayedRecall', 'languageVerbalFluency', 'abstractionReasoning'];
  const domainAverages: Record<string, number> = {};
  for (const domainName of domainNames) {
    let sum = 0;
    for (const session of cognitiveSessions) {
      sum += session[domainName].normalized;
    }
    domainAverages[domainName] = Number((sum / cognitiveSessions.length).toFixed(3));
  }

  await prisma.cognitiveBaseline.create({
    data: {
      elderlyProfileId: elderlyProfile.id,
      featureVector: domainAverages,
      rawValues: cognitiveSessions,
      domainBaselines: domainAverages,
      version: 1,
      callsIncluded: user.cognitiveCalls.length,
      baselineLocked: false
    }
  });

  await prisma.notification.createMany({
    data: [
      {
        elderlyProfileId: elderlyProfile.id,
        type: 'HEALTH_CONCERN',
        status: 'DELIVERED',
        title: 'Recall-domain decline detected',
        body: `${user.name}'s delayed-recall score dropped 14% over the last 14 days`,
        createdAt: daysAgo(3)
      },
      {
        elderlyProfileId: elderlyProfile.id,
        type: 'MISSED_CALLS',
        status: 'DELIVERED',
        title: 'Missed call',
        body: `${user.name} did not answer the scheduled call`,
        createdAt: daysAgo(5)
      }
    ]
  });

  return elderlyProfile.id;
}

async function wipeQdrant() {
  const convIds = USERS.flatMap((u) => [
    ...u.conversations.map((c) => c.convId),
    ...u.healthCalls.map((h) => `health_${u.slug}_${h.id}`),
    ...u.cognitiveCalls.map((c) => `cognitive_${u.slug}_${c.id}`)
  ]);

  for (const convId of convIds) {
    const res = await fetch(`${QDRANT_URL}/collections/${QDRANT_COLLECTION}/points/delete`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(QDRANT_API_KEY ? { 'api-key': QDRANT_API_KEY } : {})
      },
      body: JSON.stringify({
        filter: {
          must: [{ key: 'metadata.conversationId', match: { value: convId } }]
        }
      })
    });
    if (!res.ok) {
      const text = await res.text();
      console.warn(`[Qdrant] Failed deleting conversationId ${convId}: ${text}`);
    }
  }
}

async function wipeNeo4j(graphRepo: GraphRepository) {
  const session = (graphRepo as unknown as { session: { run: (q: string) => Promise<void> } }).session;
  await session.run(
    `MATCH (u:User)
     OPTIONAL MATCH (u)-[:HAS_CONVERSATION]->(c:Conversation)
     OPTIONAL MATCH (c)-[:HAS_SUMMARY]->(s:Summary)
     OPTIONAL MATCH (c)-[:HAS_HIGHLIGHT]->(h:Highlight)
     DETACH DELETE u, c, s, h`
  );
  await session.run(`MATCH (t:Topic) WHERE NOT (t)<-[:MENTIONS]-() DETACH DELETE t`);
  await session.run(`MATCH (p:Person) WHERE NOT ()<-[:MENTIONED]-(p) DETACH DELETE p`);
}

async function wipePostgres() {
  await prisma.indirectSignal.deleteMany({});
  await prisma.iadlAssessment.deleteMany({});
  await prisma.cognitiveSelfReport.deleteMany({});
  await prisma.wellbeingLog.deleteMany({});
  await prisma.medicationLog.deleteMany({});
  await prisma.healthConditionLog.deleteMany({});
  await prisma.healthBaselineSymptom.deleteMany({});
  await prisma.healthBaselineMedication.deleteMany({});
  await prisma.healthBaselineCondition.deleteMany({});
  await prisma.healthBaseline.deleteMany({});
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
  await prisma.callEvent.deleteMany({});
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
}

async function main() {
  console.log('Starting demo seed...');
  Neo4jClient.getInstance({
    uri: process.env.NEO4J_URI!,
    username: process.env.NEO4J_USERNAME!,
    password: process.env.NEO4J_PASSWORD!,
    database: process.env.NEO4J_DATABASE
  });
  await Neo4jClient.getInstance().verifyConnectivity();

  const embeddingModel = new OpenAIEmbeddings({
    apiKey: process.env.OPENAI_API_KEY!,
    model: 'text-embedding-3-small'
  });
  const vectorStoreConfig: VectorStoreConfigs = {
    baseUrl: process.env.QDRANT_URL!,
    apiKey: process.env.QDRANT_API_KEY!,
    collectionName: process.env.QDRANT_COLLECTION!
  };
  const vectorStore = new VectorStoreClient(vectorStoreConfig, embeddingModel);
  const graphRepo = new GraphRepository();

  await wipePostgres();
  await wipeNeo4j(graphRepo);
  await wipeQdrant();

  const seededUserIds: string[] = [];
  for (const user of USERS) {
    const id = await seedUser(user, vectorStore, graphRepo, embeddingModel);
    seededUserIds.push(id);
  }

  console.log('Seed complete.');
  console.log(`Seeded users: ${seededUserIds.join(', ')}`);

  await graphRepo.close();
  await Neo4jClient.getInstance().closeDriver();
  await prisma.$disconnect();
}

main().catch(async (error) => {
  console.error('Seed failed:', error);
  await prisma.$disconnect();
  process.exit(1);
});

import { PrismaClient } from '../generated/prisma/index.js';

const prisma = new PrismaClient();

async function main() {
  const phoneNumber = process.env.PHONE_NUMBER;

  if (!phoneNumber) {
    throw new Error('PHONE_NUMBER environment variable is required');
  }

  console.log(`Creating test user with phone number: ${phoneNumber}`);

  await prisma.user.deleteMany({
    where: { phone: phoneNumber }
  });

  const user = await prisma.user.create({
    data: {
      name: 'Margaret Thompson',
      age: 72,
      phone: phoneNumber,
      gender: 'FEMALE',
      interests: [
        'Gardening',
        'Baking cookies',
        'Watching birds',
        'Reading mystery novels',
        'Talking with grandchildren',
        'Playing bridge with friends'
      ],
      dislikes: [
        'Cold weather',
        'Loud noises',
        'Fast-paced action movies',
        'Spicy food'
      ],
      callFrequency: 'DAILY',
      preferredCallTime: new Date('1970-01-01T14:00:00Z'), 
      isFirstCall: false,
      lastCallAt: new Date(Date.now() - 1 * 24 * 60 * 60 * 1000), 

      emergencyContact: {
        create: {
          name: 'Sarah Thompson',
          phone: '+1234567890',
          email: 'sarah.thompson@email.com',
          relationship: 'DAUGHTER',
          smsEnabled: true,
          notifyOnMissedCalls: true
        }
      },

      healthConditions: {
        create: [
          {
            condition: 'Type 2 Diabetes',
            severity: 'Moderate',
            diagnosedAt: new Date('2015-03-15'),
            notes: 'Well-controlled with medication and diet',
            isActive: true
          },
          {
            condition: 'Hypertension',
            severity: 'Mild',
            diagnosedAt: new Date('2012-06-20'),
            notes: 'Controlled with medication',
            isActive: true
          },
          {
            condition: 'Osteoarthritis',
            severity: 'Moderate',
            diagnosedAt: new Date('2018-09-10'),
            notes: 'Primarily affects knees and hands',
            isActive: true
          }
        ]
      },

      medications: {
        create: [
          {
            name: 'Metformin',
            dosage: '500mg',
            frequency: 'Twice daily with meals',
            startedAt: new Date('2015-03-15'),
            notes: 'For diabetes management',
            isActive: true
          },
          {
            name: 'Lisinopril',
            dosage: '10mg',
            frequency: 'Once daily in the morning',
            startedAt: new Date('2012-06-20'),
            notes: 'For blood pressure',
            isActive: true
          },
          {
            name: 'Vitamin D3',
            dosage: '2000 IU',
            frequency: 'Once daily',
            startedAt: new Date('2020-01-01'),
            notes: 'Supplement for bone health',
            isActive: true
          },
          {
            name: 'Ibuprofen',
            dosage: '200mg',
            frequency: 'As needed for pain',
            notes: 'For arthritis pain, not daily',
            isActive: true
          }
        ]
      },

      conversationSummaries: {
        create: [
          {
            conversationId: 'conv_sample_001',
            summaryText: 'Margaret shared that she had a lovely day in her garden, planting some new roses. She mentioned feeling a bit tired due to her arthritis acting up with the weather change. She talked about baking cookies with her granddaughter over video call.',
            durationMinutes: 8,
            topicsDiscussed: ['Gardening', 'Family time', 'Arthritis pain', 'Baking'],
            keyHighlights: [
              'Planted new roses in the garden',
              'Arthritis pain increased with weather change',
              'Video call with granddaughter to bake cookies together'
            ],
            createdAt: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000)
          },
          {
            conversationId: 'conv_sample_002',
            summaryText: 'Margaret discussed her upcoming bridge game with friends and expressed excitement about it. She mentioned taking her medication regularly and feeling generally well. Brief discussion about a mystery novel she is reading.',
            durationMinutes: 6,
            topicsDiscussed: ['Bridge game', 'Social activities', 'Medication adherence', 'Reading'],
            keyHighlights: [
              'Looking forward to bridge game on Friday',
              'Taking all medications as prescribed',
              'Reading a new Agatha Christie novel'
            ],
            createdAt: new Date(Date.now() - 1 * 24 * 60 * 60 * 1000) 
          }
        ]
      },

      conversationTopics: {
        create: [
          {
            topicName: 'Gardening',
            variations: ['gardening', 'garden work', 'planting flowers', 'roses'],
            category: 'Hobby',
            topicEmbedding: Array(1536).fill(0).map(() => Math.random() - 0.5), 
          },
          {
            topicName: 'Family time',
            variations: ['family', 'grandchildren', 'daughter', 'video calls with family'],
            category: 'Relationships',
            topicEmbedding: Array(1536).fill(0).map(() => Math.random() - 0.5), 
          },
          {
            topicName: 'Arthritis pain',
            variations: ['arthritis', 'joint pain', 'knee pain', 'hand pain'],
            category: 'Health',
            topicEmbedding: Array(1536).fill(0).map(() => Math.random() - 0.5), 
          },
          {
            topicName: 'Baking',
            variations: ['baking', 'cookies', 'baking with grandkids'],
            category: 'Hobby',
            topicEmbedding: Array(1536).fill(0).map(() => Math.random() - 0.5),
          },
          {
            topicName: 'Social activities',
            variations: ['bridge game', 'friends', 'social gatherings'],
            category: 'Social',
            topicEmbedding: Array(1536).fill(0).map(() => Math.random() - 0.5),
          }
        ]
      }
    }
  });

  const summaries = await prisma.conversationSummary.findMany({
    where: { userId: user.id }
  });

  const topics = await prisma.conversationTopic.findMany({
    where: { userId: user.id }
  });

  const firstSummary = summaries.find(s => s.conversationId === 'conv_sample_001');
  if (firstSummary) {
    const gardeningTopic = topics.find(t => t.topicName === 'Gardening');
    const familyTopic = topics.find(t => t.topicName === 'Family time');
    const arthritisTopic = topics.find(t => t.topicName === 'Arthritis pain');
    const bakingTopic = topics.find(t => t.topicName === 'Baking');

    if (gardeningTopic && familyTopic && arthritisTopic && bakingTopic) {
      await prisma.conversationTopicReference.createMany({
        data: [
          {
            conversationSummaryId: firstSummary.id,
            conversationTopicId: gardeningTopic.id
          },
          {
            conversationSummaryId: firstSummary.id,
            conversationTopicId: familyTopic.id
          },
          {
            conversationSummaryId: firstSummary.id,
            conversationTopicId: arthritisTopic.id
          },
          {
            conversationSummaryId: firstSummary.id,
            conversationTopicId: bakingTopic.id
          }
        ]
      });
    }
  }

  const secondSummary = summaries.find(s => s.conversationId === 'conv_sample_002');
  if (secondSummary) {
    const socialTopic = topics.find(t => t.topicName === 'Social activities');

    if (socialTopic) {
      await prisma.conversationTopicReference.create({
        data: {
          conversationSummaryId: secondSummary.id,
          conversationTopicId: socialTopic.id
        }
      });
    }
  }

  console.log('✅ Test user created successfully!');
  console.log(`User ID: ${user.id}`);
  console.log(`Name: ${user.name}`);
  console.log(`Phone: ${user.phone}`);
  console.log(`Is First Call: ${user.isFirstCall}`);
  console.log('\nUser profile includes:');
  console.log('- Emergency contact (daughter Sarah)');
  console.log('- 3 health conditions');
  console.log('- 4 medications');
  console.log('- 2 conversation summaries (no CallLog entries)');
  console.log('- 5 conversation topics with embeddings');
  console.log('- Topic references linking conversations to topics');
  console.log('\nReady for testing PostCallController!');
}

main()
  .catch((e) => {
    console.error('Error seeding database:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });

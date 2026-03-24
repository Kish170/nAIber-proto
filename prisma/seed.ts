import { PrismaClient } from '../generated/prisma/index.js';

const prisma = new PrismaClient();

async function main() {
  const phoneNumber = process.env.PHONE_NUMBER;

  if (!phoneNumber) {
    throw new Error('PHONE_NUMBER environment variable is required');
  }

  console.log(`Creating test data with phone number: ${phoneNumber}`);

  // Clean up in dependency order
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

  // --- Auth User (caregiver) ---
  const authUser = await prisma.user.create({
    data: {
      name: 'Sarah Thompson',
      email: 'sarah.thompson@email.com',
    }
  });

  // --- Elderly Profile ---
  const elderlyProfile = await prisma.elderlyProfile.create({
    data: {
      name: 'Margaret Thompson',
      age: 72,
      phone: phoneNumber,
      gender: 'FEMALE',
      educationLevel: 'SECONDARY_OR_HIGH_SCHOOL',
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
      enableHealthCheckIns: true,
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
      }
    }
  });

  // --- Caregiver Profile ---
  const caregiver = await prisma.caregiverProfile.create({
    data: {
      authUserId: authUser.id,
      name: 'Sarah Thompson',
      phone: '+1234567890',
      relationship: 'DAUGHTER',
      managedUsers: {
        create: {
          elderlyProfileId: elderlyProfile.id,
          isPrimary: true,
          status: 'ACTIVE',
        }
      }
    }
  });

  // --- Call Logs (mix of general, health, cognitive) ---
  const now = new Date();
  const daysAgo = (d: number) => new Date(now.getTime() - d * 24 * 60 * 60 * 1000);

  const callLog1 = await prisma.callLog.create({
    data: {
      elderlyProfileId: elderlyProfile.id,
      callType: 'GENERAL',
      scheduledTime: daysAgo(5),
      endTime: new Date(daysAgo(5).getTime() + 8 * 60 * 1000),
      status: 'COMPLETED',
      outcome: 'COMPLETED',
      checkInCompleted: true,
      twilioCallSid: 'CA_seed_001',
      elevenlabsConversationId: 'conv_seed_001',
    }
  });

  const callLog2 = await prisma.callLog.create({
    data: {
      elderlyProfileId: elderlyProfile.id,
      callType: 'GENERAL',
      scheduledTime: daysAgo(4),
      endTime: new Date(daysAgo(4).getTime() + 6 * 60 * 1000),
      status: 'COMPLETED',
      outcome: 'COMPLETED',
      checkInCompleted: true,
      twilioCallSid: 'CA_seed_002',
      elevenlabsConversationId: 'conv_seed_002',
    }
  });

  const callLog3 = await prisma.callLog.create({
    data: {
      elderlyProfileId: elderlyProfile.id,
      callType: 'HEALTH_CHECK',
      scheduledTime: daysAgo(3),
      endTime: new Date(daysAgo(3).getTime() + 5 * 60 * 1000),
      status: 'COMPLETED',
      outcome: 'COMPLETED',
      checkInCompleted: true,
      twilioCallSid: 'CA_seed_003',
      elevenlabsConversationId: 'conv_seed_003',
    }
  });

  const callLog4 = await prisma.callLog.create({
    data: {
      elderlyProfileId: elderlyProfile.id,
      callType: 'GENERAL',
      scheduledTime: daysAgo(2),
      endTime: new Date(daysAgo(2).getTime() + 7 * 60 * 1000),
      status: 'COMPLETED',
      outcome: 'COMPLETED',
      checkInCompleted: true,
      twilioCallSid: 'CA_seed_004',
      elevenlabsConversationId: 'conv_seed_004',
    }
  });

  const callLog5 = await prisma.callLog.create({
    data: {
      elderlyProfileId: elderlyProfile.id,
      callType: 'COGNITIVE',
      scheduledTime: daysAgo(1),
      endTime: new Date(daysAgo(1).getTime() + 12 * 60 * 1000),
      status: 'COMPLETED',
      outcome: 'COMPLETED',
      checkInCompleted: true,
      twilioCallSid: 'CA_seed_005',
      elevenlabsConversationId: 'conv_seed_005',
    }
  });

  // Missed call
  await prisma.callLog.create({
    data: {
      elderlyProfileId: elderlyProfile.id,
      callType: 'GENERAL',
      scheduledTime: daysAgo(6),
      status: 'FAILED',
      outcome: 'NO_ANSWER',
      noAnswerCount: 3,
      retryCount: 2,
      checkInCompleted: false,
      twilioCallSid: 'CA_seed_000',
    }
  });

  // --- Conversation Summaries (linked to call logs) ---
  const summary1 = await prisma.conversationSummary.create({
    data: {
      elderlyProfileId: elderlyProfile.id,
      conversationId: 'conv_seed_001',
      callLogId: callLog1.id,
      summaryText: 'Margaret shared that she had a lovely day in her garden, planting some new roses. She mentioned feeling a bit tired due to her arthritis acting up with the weather change. She talked about baking cookies with her granddaughter over video call.',
      durationMinutes: 8,
      topicsDiscussed: ['Gardening', 'Family time', 'Arthritis pain', 'Baking'],
      keyHighlights: [
        'Planted new roses in the garden',
        'Arthritis pain increased with weather change',
        'Video call with granddaughter to bake cookies together'
      ],
      createdAt: daysAgo(5)
    }
  });

  const summary2 = await prisma.conversationSummary.create({
    data: {
      elderlyProfileId: elderlyProfile.id,
      conversationId: 'conv_seed_002',
      callLogId: callLog2.id,
      summaryText: 'Margaret discussed her upcoming bridge game with friends and expressed excitement about it. She mentioned taking her medication regularly and feeling generally well. Brief discussion about a mystery novel she is reading.',
      durationMinutes: 6,
      topicsDiscussed: ['Bridge game', 'Social activities', 'Medication adherence', 'Reading'],
      keyHighlights: [
        'Looking forward to bridge game on Friday',
        'Taking all medications as prescribed',
        'Reading a new Agatha Christie novel'
      ],
      createdAt: daysAgo(4)
    }
  });

  await prisma.conversationSummary.create({
    data: {
      elderlyProfileId: elderlyProfile.id,
      conversationId: 'conv_seed_004',
      callLogId: callLog4.id,
      summaryText: 'Margaret talked about watching the birds in her backyard and mentioned she saw a cardinal for the first time this spring. She also shared that her granddaughter is visiting next weekend and they plan to bake together.',
      durationMinutes: 7,
      topicsDiscussed: ['Bird watching', 'Family visits', 'Baking'],
      keyHighlights: [
        'First cardinal sighting of the spring',
        'Granddaughter visiting next weekend',
        'Planning baking session together'
      ],
      createdAt: daysAgo(2)
    }
  });

  // --- Conversation Topics ---
  const topicGardening = await prisma.conversationTopic.create({
    data: {
      elderlyProfileId: elderlyProfile.id,
      topicName: 'Gardening',
      variations: ['gardening', 'garden work', 'planting flowers', 'roses'],
      category: 'Hobby',
      topicEmbedding: Array(1536).fill(0).map(() => Math.random() - 0.5),
    }
  });

  const topicFamily = await prisma.conversationTopic.create({
    data: {
      elderlyProfileId: elderlyProfile.id,
      topicName: 'Family time',
      variations: ['family', 'grandchildren', 'daughter', 'video calls with family'],
      category: 'Relationships',
      topicEmbedding: Array(1536).fill(0).map(() => Math.random() - 0.5),
    }
  });

  const topicArthritis = await prisma.conversationTopic.create({
    data: {
      elderlyProfileId: elderlyProfile.id,
      topicName: 'Arthritis pain',
      variations: ['arthritis', 'joint pain', 'knee pain', 'hand pain'],
      category: 'Health',
      topicEmbedding: Array(1536).fill(0).map(() => Math.random() - 0.5),
    }
  });

  const topicBaking = await prisma.conversationTopic.create({
    data: {
      elderlyProfileId: elderlyProfile.id,
      topicName: 'Baking',
      variations: ['baking', 'cookies', 'baking with grandkids'],
      category: 'Hobby',
      topicEmbedding: Array(1536).fill(0).map(() => Math.random() - 0.5),
    }
  });

  const topicSocial = await prisma.conversationTopic.create({
    data: {
      elderlyProfileId: elderlyProfile.id,
      topicName: 'Social activities',
      variations: ['bridge game', 'friends', 'social gatherings'],
      category: 'Social',
      topicEmbedding: Array(1536).fill(0).map(() => Math.random() - 0.5),
    }
  });

  // --- Topic References ---
  await prisma.conversationTopicReference.createMany({
    data: [
      { conversationSummaryId: summary1.id, conversationTopicId: topicGardening.id },
      { conversationSummaryId: summary1.id, conversationTopicId: topicFamily.id },
      { conversationSummaryId: summary1.id, conversationTopicId: topicArthritis.id },
      { conversationSummaryId: summary1.id, conversationTopicId: topicBaking.id },
      { conversationSummaryId: summary2.id, conversationTopicId: topicSocial.id },
    ]
  });

  // --- Health Check Log ---
  await prisma.healthCheckLog.create({
    data: {
      elderlyProfileId: elderlyProfile.id,
      conversationId: 'conv_seed_003',
      callLogId: callLog3.id,
      answers: [
        { id: 'general_wellbeing', question: 'How have you been feeling overall lately?', category: 'general', type: 'open', answer: 'Pretty good, a bit tired some days', isValid: true },
        { id: 'pain_level', question: 'Have you had any new or worsening pain?', category: 'pain', type: 'open', answer: 'My knees have been aching more with the cold', isValid: true },
        { id: 'sleep_quality', question: 'How has your sleep been?', category: 'sleep', type: 'open', answer: 'I sleep okay, usually wake up once or twice', isValid: true },
        { id: 'appetite', question: 'How is your appetite?', category: 'nutrition', type: 'open', answer: 'Good, I have been eating well', isValid: true },
        { id: 'medication_adherence', question: 'Have you been taking all your medications as prescribed?', category: 'medication', type: 'yes_no', answer: 'Yes', isValid: true },
        { id: 'mood', question: 'How would you describe your mood recently?', category: 'mental_health', type: 'open', answer: 'Generally happy, looking forward to seeing family', isValid: true },
      ],
      createdAt: daysAgo(3)
    }
  });

  // --- Cognitive Test Result ---
  const cognitiveResult = await prisma.cognitiveTestResult.create({
    data: {
      elderlyProfileId: elderlyProfile.id,
      conversationId: 'conv_seed_005',
      callLogId: callLog5.id,
      source: 'voice',
      modality: 'phone_call',
      sessionIndex: 0,
      wordListUsed: 'A',
      digitSetUsed: 0,
      letterUsed: 'F',
      abstractionSetUsed: 0,
      vigilanceSetUsed: 0,
      domainScores: {
        orientation: { raw: 4, maxPossible: 4, normalized: 1.0 },
        attentionConcentration: { raw: 7, maxPossible: 10, normalized: 0.7 },
        workingMemory: { raw: 4, maxPossible: 6, normalized: 0.67 },
        delayedRecall: { raw: 8, maxPossible: 15, normalized: 0.53 },
        languageVerbalFluency: { raw: 12, maxPossible: 20, normalized: 0.6 },
        abstractionReasoning: { raw: 3, maxPossible: 4, normalized: 0.75 },
      },
      taskResponses: [
        { taskType: 'ORIENTATION', domain: 'orientation', rawAnswer: 'March 19, March, 2026, spring', score: 4, maxScore: 4 },
        { taskType: 'WORD_REGISTRATION', domain: 'working_memory', rawAnswer: 'face velvet church daisy red', score: 5, maxScore: 5 },
        { taskType: 'DIGIT_SPAN_FORWARD', domain: 'attention_concentration', rawAnswer: '2 1 8 5 4', score: 3, maxScore: 5 },
        { taskType: 'DIGIT_SPAN_REVERSE', domain: 'attention_concentration', rawAnswer: '5 9 2', score: 2, maxScore: 5 },
        { taskType: 'SERIAL_7S', domain: 'attention_concentration', rawAnswer: '93 86 79 72 65', score: 5, maxScore: 5 },
        { taskType: 'LETTER_VIGILANCE', domain: 'attention_concentration', rawAnswer: 'yes count: 7', score: 2, maxScore: 2 },
        { taskType: 'LETTER_FLUENCY', domain: 'language_verbal_fluency', rawAnswer: 'fish farm flag friend fun flower fruit fly fence fork front', score: 12, maxScore: 20 },
        { taskType: 'ABSTRACTION', domain: 'abstraction_reasoning', rawAnswer: 'both fruit, both animals, both things you wear', score: 3, maxScore: 4 },
        { taskType: 'DELAYED_RECALL', domain: 'delayed_recall', rawAnswer: 'face church red', score: 3, maxScore: 5 },
      ],
      stabilityIndex: 0.71,
      isPartial: false,
      wellbeingCheckResponses: [
        { questionIndex: 0, question: 'How are you feeling today?', rawAnswer: 'I feel good today, thank you', distressDetected: false },
        { questionIndex: 1, question: 'Did you sleep well last night?', rawAnswer: 'Yes I slept quite well actually', distressDetected: false },
      ],
      distressDetected: false,
      completedAt: daysAgo(1)
    }
  });

  // --- Cognitive Baseline ---
  await prisma.cognitiveBaseline.create({
    data: {
      elderlyProfileId: elderlyProfile.id,
      featureVector: {
        orientation: 1.0,
        attentionConcentration: 0.7,
        workingMemory: 0.67,
        delayedRecall: 0.53,
        languageVerbalFluency: 0.6,
        abstractionReasoning: 0.75,
      },
      rawValues: {
        orientation: { raw: 4, maxPossible: 4, normalized: 1.0 },
        attentionConcentration: { raw: 7, maxPossible: 10, normalized: 0.7 },
        workingMemory: { raw: 4, maxPossible: 6, normalized: 0.67 },
        delayedRecall: { raw: 8, maxPossible: 15, normalized: 0.53 },
        languageVerbalFluency: { raw: 12, maxPossible: 20, normalized: 0.6 },
        abstractionReasoning: { raw: 3, maxPossible: 4, normalized: 0.75 },
      },
      domainBaselines: {
        orientation: 1.0,
        attentionConcentration: 0.7,
        workingMemory: 0.67,
        delayedRecall: 0.53,
        languageVerbalFluency: 0.6,
        abstractionReasoning: 0.75,
      },
      version: 1,
    }
  });

  // --- Trusted Contact + Submission (IQCODE) ---
  const trustedContact = await prisma.trustedContact.create({
    data: {
      elderlyProfileId: elderlyProfile.id,
      name: 'Sarah Thompson',
      relationship: 'DAUGHTER',
      knownDurationYears: 45,
      contactFrequency: 'WEEKLY',
      reliabilityTier: 'HIGH',
      informantConcernIndex: 2.8,
      weightedInformantIndex: 2.8,
    }
  });

  await prisma.trustedContactSubmission.create({
    data: {
      trustedContactId: trustedContact.id,
      submissionType: 'ONBOARDING',
      structuredResponses: {
        'remembering_things_happened_recently': 3,
        'recalling_conversations_few_days_later': 3,
        'remembering_what_day_and_month': 3,
        'remembering_where_things_kept': 3,
        'remembering_where_find_things_different_place': 3,
        'adjusting_to_change_in_routine': 3,
        'knowing_how_to_work_familiar_machines': 2,
        'learning_new_gadget_or_machine': 2,
        'learning_new_things_in_general': 3,
        'following_story_book_or_tv': 3,
        'making_decisions_on_everyday_matters': 3,
        'handling_money_for_shopping': 3,
        'handling_financial_matters': 3,
        'handling_other_everyday_arithmetic': 3,
        'using_intelligence_to_understand': 3,
        'using_reasoning': 3,
      },
      rawScore: 47,
      informantConcernIndex: 2.94,
      createdAt: daysAgo(10)
    }
  });

  // --- Notifications ---
  await prisma.notification.createMany({
    data: [
      {
        elderlyProfileId: elderlyProfile.id,
        type: 'MISSED_CALLS',
        status: 'DELIVERED',
        title: 'Missed call',
        body: 'Margaret did not answer her scheduled call today. 3 attempts were made.',
        metadata: { callLogId: 'CA_seed_000', attempts: 3 },
        createdAt: daysAgo(6),
      },
      {
        elderlyProfileId: elderlyProfile.id,
        type: 'WEEKLY_SUMMARY',
        status: 'PENDING',
        title: 'Weekly summary',
        body: 'Margaret completed 5 of 6 scheduled calls this week. Overall mood positive. Arthritis pain noted during one call.',
        metadata: { weekOf: daysAgo(7).toISOString(), completionRate: 0.83 },
        createdAt: daysAgo(0),
      },
    ]
  });

  // --- Medication-Condition Links ---
  const conditions = await prisma.userHealthCondition.findMany({
    where: { elderlyProfileId: elderlyProfile.id }
  });
  const medications = await prisma.userMedication.findMany({
    where: { elderlyProfileId: elderlyProfile.id }
  });

  const diabetes = conditions.find(c => c.condition === 'Type 2 Diabetes');
  const hypertension = conditions.find(c => c.condition === 'Hypertension');
  const arthritis = conditions.find(c => c.condition === 'Osteoarthritis');
  const metformin = medications.find(m => m.name === 'Metformin');
  const lisinopril = medications.find(m => m.name === 'Lisinopril');
  const ibuprofen = medications.find(m => m.name === 'Ibuprofen');

  if (diabetes && metformin) {
    await prisma.medicationCondition.create({
      data: { medicationId: metformin.id, healthConditionId: diabetes.id }
    });
  }
  if (hypertension && lisinopril) {
    await prisma.medicationCondition.create({
      data: { medicationId: lisinopril.id, healthConditionId: hypertension.id }
    });
  }
  if (arthritis && ibuprofen) {
    await prisma.medicationCondition.create({
      data: { medicationId: ibuprofen.id, healthConditionId: arthritis.id }
    });
  }

  console.log('\nTest data created successfully!');
  console.log(`\nElderly Profile: ${elderlyProfile.name} (${elderlyProfile.id})`);
  console.log(`Phone: ${elderlyProfile.phone}`);
  console.log(`Caregiver: ${caregiver.name} (${authUser.email})`);
  console.log('\nSeeded data:');
  console.log('- 1 elderly profile with 3 conditions, 4 medications, 3 medication-condition links');
  console.log('- 1 emergency contact');
  console.log('- 1 caregiver profile linked as primary');
  console.log('- 6 call logs (4 general, 1 health check, 1 cognitive, 1 missed)');
  console.log('- 3 conversation summaries with topic references');
  console.log('- 5 conversation topics with random embeddings');
  console.log('- 1 health check log with 6 answers');
  console.log('- 1 cognitive test result with 9 task responses + baseline');
  console.log('- 1 trusted contact with 1 IQCODE submission');
  console.log('- 2 notifications (1 missed call, 1 weekly summary)');
}

main()
  .catch((e) => {
    console.error('Error seeding database:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });

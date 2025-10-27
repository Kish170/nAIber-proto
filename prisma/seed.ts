import { PrismaClient } from '../generated/prisma/index.js';

const prisma = new PrismaClient();

async function main() {
  const phoneNumber = process.env.PHONE_NUMBER;

  if (!phoneNumber) {
    throw new Error('PHONE_NUMBER environment variable is required');
  }

  console.log(`Creating test user with phone number: ${phoneNumber}`);

  // Delete existing user if exists
  await prisma.user.deleteMany({
    where: { phone: phoneNumber }
  });

  // Create user with comprehensive test data
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
      preferredCallTime: new Date('1970-01-01T14:00:00Z'), // 2 PM
      isFirstCall: true,

      // Emergency Contact
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

      // Health Conditions
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

      // Medications
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

      // No conversation topics yet - first call
      // No conversation summaries yet - first call
    }
  });

  console.log('✅ Test user created successfully!');
  console.log(`User ID: ${user.id}`);
  console.log(`Name: ${user.name}`);
  console.log(`Phone: ${user.phone}`);
  console.log(`Is First Call: ${user.isFirstCall}`);
  console.log('\nUser profile includes:');
  console.log('- Emergency contact (daughter Sarah)');
  console.log('- 3 health conditions');
  console.log('- 4 medications');
  console.log('\nReady for first check-in call!');
}

main()
  .catch((e) => {
    console.error('Error seeding database:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });

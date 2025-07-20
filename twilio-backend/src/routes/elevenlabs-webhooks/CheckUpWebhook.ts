// import express from 'express';
// import { BasicInfoCRUD } from '../../CRUD/BasicInfo';
// import { EmergencyContactCRUD } from '../../CRUD/EmergencyContact';
// import { HealthConditionsCRUD } from '../../CRUD/HealthConditions';
// import { MedicationCRUD } from '../../CRUD/Medication';
// import { Gender, CheckInFrequency, Relationship, HealthCategory, Severity, MedicationCategory, MedicationFrequency, PrismaClient } from '../../../../generated/prisma';

// const router = express.Router();
// const basicInfoCRUD = new BasicInfoCRUD();
// const emergencyContactCRUD = new EmergencyContactCRUD();
// const healthConditionsCRUD = new HealthConditionsCRUD();
// const medicationCRUD = new MedicationCRUD();
// const prismaClient = new PrismaClient();

// router.use((req, res, next) => {
//   res.header('Access-Control-Allow-Origin', '*');
//   res.header('Access-Control-Allow-Methods', 'POST, OPTIONS');
//   res.header('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  
//   if (req.method === 'OPTIONS') {
//     res.sendStatus(200);
//     return;
//   }
//   next();
// });

// const validateRequest = (req: express.Request, res: express.Response, next: express.NextFunction) => {
//   const { function_name, parameters, conversation_id } = req.body;
  
//   if (!function_name || !parameters || !conversation_id) {
//     return res.status(400).json({
//       success: false,
//       error: 'Missing required fields: function_name, parameters, conversation_id',
//       message: 'Invalid request format'
//     });
//   }
  
//   next();
// };

// router.post('/elevenlabs-webhook', validateRequest, async (req, res) => {
//   const { function_name, parameters, conversation_id } = req.body;
  
//   console.log(`ElevenLabs webhook called: ${function_name}`, {
//     parameters,
//     conversation_id,
//     conversation_id_type: typeof conversation_id,
//     conversation_id_value: JSON.stringify(conversation_id)
//   });

//   try {
//     let result;
    
//     switch (function_name) {
//       case 'create_user':
//         result = await handleCreateUser(parameters, conversation_id);
//         break;
        
//       case 'save_user_data':
//         result = await handleSaveUserData(parameters, conversation_id);
//         break;
        
//       case 'create_emergency_contact':
//         result = await handleCreateEmergencyContact(parameters, conversation_id);
//         break;
        
//       case 'check_missing_info':
//         result = await handleCheckMissingInfo(parameters);
//         break;
        
//       case 'add_health_condition':
//         result = await handleAddHealthCondition(parameters, conversation_id);
//         break;
        
//       case 'get_user_health_conditions':
//         result = await handleGetUserHealthConditions(parameters);
//         break;
        
//       case 'add_medication':
//         result = await handleAddMedication(parameters, conversation_id);
//         break;
        
//       case 'get_user_medications':
//         result = await handleGetUserMedications(parameters);
//         break;
        
//       default:
//         return res.status(400).json({
//           success: false,
//           error: `Unknown function: ${function_name}`,
//           message: 'Function not supported'
//         });
//     }
    
//     console.log(`Function ${function_name} completed successfully:`, result);
//     res.json(result);
    
//   } catch (error: any) {
//     console.error(`Error in ${function_name}:`, error);
//     res.status(500).json({
//       success: false,
//       error: error.message,
//       message: 'An error occurred while processing your request'
//     });
//   }
// });

// async function handleCreateUser(parameters: any, conversationID: string) {
//   const { fullName } = parameters;
  
//   if (!fullName || !conversationID) {
//     throw new Error('fullName and conversationID is required');
//   }
  
//   const user = await basicInfoCRUD.createUser({ fullName, conversationID });
  
//   return {
//     success: true,
//     message: `Successfully created user profile for ${fullName}`,
//     data: {
//       userId: user.id,
//       fullName: user.fullName,
//       conversationID: user.conversationID
//     }
//   };
// }

// async function handleSaveUserData(parameters: any, conversationID: string) {
//   const { field, value } = parameters;
  
//   if (!field || value === undefined || !conversationID) {
//     throw new Error('field, value, and userId are required');
//   }
  
//   let processedValue = value;
  
//   if (field === 'gender') {
//     const validGenders = ['MALE', 'FEMALE', 'NON_BINARY', 'PREFER_NOT_TO_SAY'];
//     const upperValue = value.toString().toUpperCase();
//     if (!validGenders.includes(upperValue)) {
//       throw new Error(`Invalid gender. Must be one of: ${validGenders.join(', ')}`);
//     }
//     processedValue = upperValue as Gender;
//   }
  
//   if (field === 'checkInFrequency') {
//     const validFrequencies = ['DAILY', 'WEEKLY', 'MONTHLY', 'AS_NEEDED'];
//     const upperValue = value.toString().toUpperCase();
//     if (!validFrequencies.includes(upperValue)) {
//       throw new Error(`Invalid check-in frequency. Must be one of: ${validFrequencies.join(', ')}`);
//     }
//     processedValue = upperValue as CheckInFrequency;
//   }
  
//   if (field === 'age') {
//     processedValue = parseInt(value);
//     if (isNaN(processedValue) || processedValue < 0 || processedValue > 150) {
//       throw new Error('Age must be a valid number between 0 and 150');
//     }
//   }
  
//   await basicInfoCRUD.updateUser(field, processedValue, conversationID);
  
//   return {
//     success: true,
//     message: `Successfully updated ${field}`,
//     data: {
//       field,
//       value: processedValue,
//       conversationID
//     }
//   };
// }

// async function handleCreateEmergencyContact(parameters: any, conversationID: string) {
//   const { name, phoneNumber, relationship, email, isPrimary, address, notes } = parameters;
//   const userId = await basicInfoCRUD.getUserID(conversationID)
  
//   if (!name || !phoneNumber || !relationship || !userId) {
//     throw new Error('name, phoneNumber, relationship, and userId are required');
//   }
  
//   const validRelationships = ['SPOUSE', 'DAUGHTER', 'SON', 'SIBLING', 'FRIEND', 'NURSE', 'DOCTOR', 'CAREGIVER', 'OTHER'];
//   const upperRelationship = relationship.toString().toUpperCase();
//   if (!validRelationships.includes(upperRelationship)) {
//     throw new Error(`Invalid relationship. Must be one of: ${validRelationships.join(', ')}`);
//   }
  
//   const emergencyContact = await emergencyContactCRUD.createEmergencyContact({
//       name,
//       phoneNumber,
//       relationship: upperRelationship as Relationship,
//       userId,
//       email: email || undefined,
//       isPrimary: isPrimary || false,
//       address: address || undefined,
//       notes: notes || undefined
//     });
  
//   return {
//     success: true,
//     message: `Successfully added ${name} as emergency contact`,
//     data: {
//       contactId: emergencyContact.id,
//       name: emergencyContact.name,
//       phoneNumber: emergencyContact.phoneNumber,
//       relationship: emergencyContact.relationship
//     }
//   };
// }

// async function handleCheckMissingInfo(parameters: any) {
//   const { userId } = parameters;
  
//   if (!userId) {
//     throw new Error('userId is required');
//   }
  
//   const user = await prismaClient.user.findUnique({
//     where: { id: userId },
//     include: {
//       emergencyContacts: true
//     }
//   });
  
//   if (!user) {
//     throw new Error('User not found');
//   }
  
//   const missingFields = [];
//   const requiredFields = [
//     { field: 'fullName', value: user.fullName },
//     { field: 'age', value: user.age },
//     { field: 'phoneNumber', value: user.phoneNumber },
//     { field: 'gender', value: user.gender },
//     { field: 'preferredCheckInTime', value: user.preferredCheckInTime },
//     { field: 'checkInFrequency', value: user.checkInFrequency }
//   ];
  
//   requiredFields.forEach(({ field, value }) => {
//     if (!value) {
//       missingFields.push(field);
//     }
//   });
  
//   const hasEmergencyContact = user.emergencyContacts.length > 0;
//   if (!hasEmergencyContact) {
//     missingFields.push('emergencyContact');
//   }
  
//   return {
//     success: true,
//     message: missingFields.length === 0 ? 'All required information is complete' : `Missing ${missingFields.length} required fields`,
//     data: {
//       missingFields,
//       isComplete: missingFields.length === 0,
//       completedFields: requiredFields.filter(({ value }) => value).map(({ field }) => field),
//       hasEmergencyContact
//     }
//   };
// }

// async function handleAddHealthCondition(parameters: any, conversationID: string) {
//   const { name, category, severity, notes } = parameters;
//   const userId = await basicInfoCRUD.getUserID(conversationID)
  
//   if (!userId || !name || !category) {
//     throw new Error('userId, name, and category are required');
//   }
  
//   const validCategories = ['CHRONIC', 'ACUTE', 'MENTAL_HEALTH', 'PHYSICAL', 'GENETIC', 'AUTOIMMUNE'];
//   const upperCategory = category.toString().toUpperCase();
//   if (!validCategories.includes(upperCategory)) {
//     throw new Error(`Invalid health category. Must be one of: ${validCategories.join(', ')}`);
//   }
  
//   let processedSeverity = undefined;
//   if (severity) {
//     const validSeverities = ['MILD', 'MODERATE', 'SEVERE'];
//     const upperSeverity = severity.toString().toUpperCase();
//     if (!validSeverities.includes(upperSeverity)) {
//       throw new Error(`Invalid severity. Must be one of: ${validSeverities.join(', ')}`);
//     }
//     processedSeverity = upperSeverity as Severity;
//   }
  
//   const healthCondition = await healthConditionsCRUD.findOrCreateHealthCondition(
//     name,
//     upperCategory as HealthCategory
//   );

//   const userHealthCondition = await healthConditionsCRUD.addUserHealthCondition({
//     userId,
//     healthConditionId: healthCondition.id,
//     severity: processedSeverity,
//     notes
//   });
  
//   return {
//     success: true,
//     message: `Successfully added health condition: ${name}`,
//     data: {
//       userHealthConditionId: userHealthCondition.id,
//       healthCondition: userHealthCondition.healthCondition,
//       severity: userHealthCondition.severity,
//       notes: userHealthCondition.notes
//     }
//   };
// }

// async function handleGetUserHealthConditions(parameters: any) {
//   const { userId } = parameters;
  
//   if (!userId) {
//     throw new Error('userId is required');
//   }
  
//   const healthConditions = await healthConditionsCRUD.getUserHealthConditions(userId);
  
//   return {
//     success: true,
//     message: `Found ${healthConditions.length} health conditions`,
//     data: {
//       healthConditions: healthConditions.map(uhc => ({
//         id: uhc.id,
//         name: uhc.healthCondition.name,
//         category: uhc.healthCondition.category,
//         severity: uhc.severity,
//         notes: uhc.notes,
//         diagnosedAt: uhc.diagnosedAt
//       }))
//     }
//   };
// }

// async function handleAddMedication(parameters: any, conversationID: string) {
//   const { name, category, dosage, frequency, prescriber, notes } = parameters;
//     const userId = await basicInfoCRUD.getUserID(conversationID)

//   if (!userId || !name || !category || !dosage || !frequency) {
//     throw new Error('userId, name, category, dosage, and frequency are required');
//   }
  
//   const validCategories = ['PAIN_RELIEF', 'HEART', 'DIABETES', 'BLOOD_PRESSURE', 'MENTAL_HEALTH', 'ANTIBIOTICS', 'VITAMINS', 'OTHER'];
//   const upperCategory = category.toString().toUpperCase();
//   if (!validCategories.includes(upperCategory)) {
//     throw new Error(`Invalid medication category. Must be one of: ${validCategories.join(', ')}`);
//   }
  
//   const validFrequencies = ['ONCE_DAILY', 'TWICE_DAILY', 'THREE_TIMES_DAILY', 'FOUR_TIMES_DAILY', 'EVERY_OTHER_DAY', 'WEEKLY', 'MONTHLY', 'AS_NEEDED', 'EVERY_4_HOURS', 'EVERY_6_HOURS', 'EVERY_8_HOURS', 'EVERY_12_HOURS', 'BEDTIME', 'WITH_MEALS', 'BEFORE_MEALS', 'AFTER_MEALS'];
//   const upperFrequency = frequency.toString().toUpperCase();
//   if (!validFrequencies.includes(upperFrequency)) {
//     throw new Error(`Invalid medication frequency. Must be one of: ${validFrequencies.join(', ')}`);
//   }
  
//   const medication = await medicationCRUD.findOrCreateMedication(
//     name,
//     upperCategory as MedicationCategory
//   );
  
//   const userMedication = await medicationCRUD.addUserMedication({
//     userId,
//     medicationId: medication.id,
//     dosage,
//     frequency: upperFrequency as MedicationFrequency,
//     prescriber,
//     notes
//   });
  
//   return {
//     success: true,
//     message: `Successfully added medication: ${name}`,
//     data: {
//       userMedicationId: userMedication.id,
//       medication: (userMedication as any).medication,
//       dosage: userMedication.dosage,
//       frequency: userMedication.frequency,
//       prescriber: userMedication.prescriber,
//       notes: userMedication.notes
//     }
//   };
// }

// async function handleGetUserMedications(parameters: any) {
//   const { userId } = parameters;
  
//   if (!userId) {
//     throw new Error('userId is required');
//   }
  
//   const medications = await medicationCRUD.getUserMedications(userId);
  
//   return {
//     success: true,
//     message: `Found ${medications.length} medications`,
//     data: {
//       medications: medications.map(um => ({
//         id: um.id,
//         name: um.medication.name,
//         genericName: um.medication.genericName,
//         category: um.medication.category,
//         dosage: um.dosage,
//         frequency: um.frequency,
//         prescriber: um.prescriber,
//         notes: um.notes,
//         startedAt: um.startedAt
//       }))
//     }
//   };
// }

// export default router;

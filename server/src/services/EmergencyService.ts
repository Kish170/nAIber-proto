// import { BasicInfoTools } from '../tools/dbUtils';
// import { EmergencyContactTools } from '../tools/EmergencyContact';
// import { getActiveConnections, closeElevenLabsConnections } from '../utils/OutboundMediaStream';
// import Twilio, { twiml } from 'twilio';
// import { Relationship } from '../../../generated/prisma';

// const basicInfoCRUD = new BasicInfoTools();
// const emergencyContactCRUD = new EmergencyContactTools();

// const accountSid = process.env.TWILIO_ACCOUNT_SID;
// const authToken = process.env.TWILIO_AUTH_TOKEN;
// const twilioClient = Twilio(accountSid, authToken);

// export class EmergencyService {
//   async createEmergencyContact(parameters: any, conversationID: string) {
//     const { name, phoneNumber, relationship, email, isPrimary, address, notes } = parameters;
//     const userId = await basicInfoCRUD.getUserID({conversationId: conversationID});
    
//     if (!name || !phoneNumber || !relationship || !userId) {
//       throw new Error('name, phoneNumber, relationship, and userId are required');
//     }
    
//     const validRelationships = ['SPOUSE', 'DAUGHTER', 'SON', 'SIBLING', 'FRIEND', 'NURSE', 'DOCTOR', 'CAREGIVER', 'OTHER'];
//     const upperRelationship = relationship.toString().toUpperCase();
//     if (!validRelationships.includes(upperRelationship)) {
//       throw new Error(`Invalid relationship. Must be one of: ${validRelationships.join(', ')}`);
//     }
    
//     const emergencyContact = await emergencyContactCRUD.createEmergencyContact({
//         name,
//         phoneNumber,
//         relationship: upperRelationship as Relationship,
//         user: { connect: { id: userId } },
//         email: email || undefined,
//         isPrimary: isPrimary || false,
//         address: address || undefined,
//         notes: notes || undefined
//       });
    
//     return {
//       success: true,
//       message: `Successfully added ${name} as emergency contact`,
//       data: {
//         contactId: emergencyContact.id,
//         name: emergencyContact.name,
//         phoneNumber: emergencyContact.phoneNumber,
//         relationship: emergencyContact.relationship
//       }
//     };
//   }

//   async escalateToHuman(parameters: any) {
//     console.log('[Escalation] escalateToHuman called with parameters:', parameters);
//     const { escalate, urgencyLevel, description, reason } = parameters;

//     // Handle both manual escalation and emergency detection
//     const shouldEscalate = String(escalate).toLowerCase() === 'true' || 
//                           urgencyLevel === 'high' || 
//                           urgencyLevel === 'critical';

//     if (shouldEscalate) {
//         try {
//             const ecNumber = await this.getEmergencyContact();
//             console.log('[DEBUG] Emergency contact result:', ecNumber, typeof ecNumber);
//             if (ecNumber) {
//                 console.log('[Escalation] Active connections before ending:', getActiveConnections());
//                 const connectionInfo = getActiveConnections()[0].callSid || "";
//                 const callInfo = await twilioClient.calls(connectionInfo).fetch();
//                 const callNumber = callInfo.to;

//                 // Close ElevenLabs WebSocket to stop AI
//                 closeElevenLabsConnections();
                
//                 const voiceResponse = new twiml.VoiceResponse();
//                 voiceResponse.say("Please hold while we connect you to an agent");
//                 const dial = voiceResponse.dial();
//                 dial.conference({
//                     startConferenceOnEnter: true,
//                     endConferenceOnExit: true
//                 }, 'emergency-call');
//                 await twilioClient.calls(connectionInfo).update({
//                     twiml: voiceResponse.toString()
//                 });
//                 await twilioClient.calls.create({
//                     to: ecNumber,
//                     from: `${process.env.TWILIO_NUMBER}`,
//                     twiml: `<Response><Dial><Conference>emergency-call</Conference></Dial></Response>`
//                 });
//                 return {
//                     success: true,
//                     message: 'Successfully escalated to human. AI call ended.',
//                     data: {
//                         emergencyContactNumber: ecNumber
//                     }
//                 };
//             } else {
//                 console.error('[Transfer Setup] No user found for phone number:', process.env.PHONE_NUMBER);
//                 return {
//                     success: false,
//                     message: 'No emergency contact number found',
//                 };
//             }
//         } catch (error) {
//             console.error('[Transfer Setup] Error setting up transfer:', error);
//             return {
//                 success: false,
//                 message: 'Error with transfer',
//             };
//         }
//     }

//     return {
//       success: true,
//       message: 'No escalation needed',
//       data: {
//         shouldEscalate: false
//       }
//     };
//   }

//   private async getEmergencyContact() {
//     try {
//         console.log('[Transfer Setup] Setting up escalation to human');
//         const userID = await basicInfoCRUD.getUserID({ phoneNumber: `${process.env.PHONE_NUMBER}` });
//         console.log('[Transfer Setup] Found user ID:', userID);

//         if (userID) {
//             const emergencyContacts = await emergencyContactCRUD.getEmergencyContactsByUserId(userID);
//             console.log('[Transfer Setup] Emergency contacts:', emergencyContacts);

//             if (emergencyContacts.length === 0) {
//                 console.error('[Transfer Setup] No emergency contacts found');
//                 return;
//             }

//             const ecNumber = emergencyContacts[0]?.phoneNumber;
//             console.log('[Transfer Setup] Using emergency contact:', ecNumber);

//             if (!ecNumber) {
//                 console.error('[Transfer Setup] Emergency contact phone number is null/undefined');
//                 return;
//             }
            
//             return ecNumber;
//         } else {
//             console.error('[Transfer Setup] No user found for phone number:', process.env.PHONE_NUMBER);
//         }
//     } catch (error) {
//         console.error('[Transfer Setup] Error setting up transfer:', error);
//         return;
//     }
//   }
// }
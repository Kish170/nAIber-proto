import express from 'express';
import { getActiveConnections, closeElevenLabsConnections } from '../../ws/OutboundMediaStream';
import { BasicInfoCRUD } from '../../CRUD/BasicInfo';
import { EmergencyContactCRUD } from '../../CRUD/EmergencyContact';
import { HealthConditionsCRUD } from '../../CRUD/HealthConditions';
import { MedicationCRUD } from '../../CRUD/Medication';
import { Gender, CheckInFrequency, Relationship, HealthCategory, Severity, MedicationCategory, MedicationFrequency, PrismaClient } from '../../../../generated/prisma';
import Twilio from "twilio";
import path from 'path'
import dotenv from "dotenv";
import { twiml } from 'twilio';

dotenv.config({ path: path.resolve(__dirname, '../../../../.env') });

const accountSid = process.env.TWILIO_ACCOUNT_SID;
const authToken = process.env.TWILIO_AUTH_TOKEN;
const twilioClient = Twilio(accountSid, authToken);
const router = express.Router();
const basicInfoCRUD = new BasicInfoCRUD();
const emergencyContactCRUD = new EmergencyContactCRUD();
const healthConditionsCRUD = new HealthConditionsCRUD();
const medicationCRUD = new MedicationCRUD();
const prismaClient = new PrismaClient();

router.use((req, res, next) => {
    res.header('Access-Control-Allow-Origin', '*');
    res.header('Access-Control-Allow-Methods', 'POST, OPTIONS');
    res.header('Access-Control-Allow-Headers', 'Content-Type, Authorization');

    if (req.method === 'OPTIONS') {
        res.sendStatus(200);
        return;
    }
    next();
});

const validateRequest = (req: express.Request, res: express.Response, next: express.NextFunction) => {
    const { function_name, parameters, conversation_id } = req.body;

    if (!function_name || !parameters || !conversation_id) {
        return res.status(400).json({
            success: false,
            error: 'Missing required fields: function_name, parameters, conversation_id',
            message: 'Invalid request format'
        });
    }

    next();
};

router.post('/check-in', validateRequest, async (req, res) => {
    const { function_name, parameters, conversation_id } = req.body;

    console.log(`ElevenLabs webhook called: ${function_name}`, {
        parameters,
        conversation_id,
    });

    try {
        let result;

        switch (function_name) {
            case 'escalate_to_human':
                result = await escalateToHuman(parameters);
                break;

            default:
                return res.status(400).json({
                    success: false,
                    error: `Unknown function: ${function_name}`,
                    message: 'Function not supported'
                });
        }

        console.log(`Function ${function_name} completed successfully:`, result);
        res.json(result);

    } catch (error: any) {
        console.error(`Error in ${function_name}:`, error);
        res.status(500).json({
            success: false,
            error: error.message,
            message: 'An error occurred while processing your request'
        });
    }
});

async function escalateToHuman(parameters: any) {
    const { escalate } = parameters;

    if (String(escalate).toLowerCase() === 'true') {
        try {
            const ecNumber = await getEmergencyContact()
            console.log('[DEBUG] Emergency contact result:', ecNumber, typeof ecNumber);
            if (ecNumber) {
                console.log('[Escalation] Active connections before ending:', getActiveConnections());
                const connectionInfo = getActiveConnections()[0].callSid || ""
                const callInfo = await twilioClient.calls(connectionInfo).fetch()
                const callNumber = callInfo.to;

                // Close ElevenLabs WebSocket to stop AI
                closeElevenLabsConnections();
                
                const voiceResponse = new twiml.VoiceResponse();
                voiceResponse.say("Please hold while we connect you to an agent")
                const dial = voiceResponse.dial()
                dial.conference({
                    startConferenceOnEnter: true,
                    endConferenceOnExit: true
                }, 'emergency-call')
                await twilioClient.calls(connectionInfo).update({
                    twiml: voiceResponse.toString()
                });
                await twilioClient.calls.create({
                    to: ecNumber,
                    from: `${process.env.TWILIO_NUMBER}`,
                    twiml: `<Response><Dial><Conference>emergency-call</Conference></Dial></Response>`
                });
                return {
                    success: true,
                    message: 'Successfully escalated to human. AI call ended.',
                    data: {
                        emergencyContactNumber: ecNumber
                    }
                };
            } else {
                console.error('[Transfer Setup] No user found for phone number:', process.env.PHONE_NUMBER);
                return {
                    success: false,
                    message: 'No ec number',
                };
            }
        } catch (error) {
            console.error('[Transfer Setup] Error setting up transfer:', error);
            return {
                success: false,
                message: 'Error with transfer',
            };
        }
    }
}

export async function getEmergencyContact() {
    try {
        console.log('[Transfer Setup] Setting up escalation to human');
        const userID = await basicInfoCRUD.getUserID({ phoneNumber: `${process.env.PHONE_NUMBER}` })
        console.log('[Transfer Setup] Found user ID:', userID);

        if (userID) {
            const emergencyContacts = await emergencyContactCRUD.getEmergencyContactsByUserId(userID)
            console.log('[Transfer Setup] Emergency contacts:', emergencyContacts);

            if (emergencyContacts.length === 0) {
                console.error('[Transfer Setup] No emergency contacts found');
                return;
            }

            const ecNumber = emergencyContacts[0]?.phoneNumber
            console.log('[Transfer Setup] Using emergency contact:', ecNumber);

            if (!ecNumber) {
                console.error('[Transfer Setup] Emergency contact phone number is null/undefined');
                return 
            };
            
            return ecNumber;
        } else {
            console.error('[Transfer Setup] No user found for phone number:', process.env.PHONE_NUMBER);
        }
    } catch (error) {
        console.error('[Transfer Setup] Error setting up transfer:', error);
        return;
    }
}

export default router
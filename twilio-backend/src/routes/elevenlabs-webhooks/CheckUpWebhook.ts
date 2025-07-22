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
            case 'detect_emergency_situation':
                result = await escalateToHuman(parameters);
                break;

            case 'get_user_profile':
                result = await getUserProfile(parameters);
                break;
                
            case 'check_health_status':
                result = await checkHealthStatus(parameters);
                break;
                
            case 'verify_medication_compliance':
                result = await verifyMedicationCompliance(parameters);
                break;
                
            case 'complete_pol_check':
                result = await completePolCheck(parameters);
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
    console.log('[Escalation] escalateToHuman called with parameters:', parameters);
    const { escalate, urgencyLevel, description, reason } = parameters;

    // Handle both manual escalation and emergency detection
    const shouldEscalate = String(escalate).toLowerCase() === 'true' || 
                          urgencyLevel === 'high' || 
                          urgencyLevel === 'critical';

    if (shouldEscalate) {
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

async function getUserProfile(parameters: any) {
    try {
        console.log("[Checkup] Getting user info")
        const userID = await basicInfoCRUD.getUserID({ phoneNumber: `${process.env.PHONE_NUMBER}` })
        console.log('[Checkup] Found user ID:', userID);
        
        if (userID) {
            const userInfo = await basicInfoCRUD.getAllUserInfo(userID)
            return {
                success: true,
                message: 'User information retrieved successfully',
                data: userInfo
            }
        }
        
        return {
            success: false,
            message: 'User not found'
        }
    } catch(error) {
        console.error('[Checkup] Error getting user info:', error);
        return {
            success: false,
            message: 'Error retrieving user information',
            error: error
        }
    }
}

async function getEmergencyContact() {
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

async function checkHealthStatus(parameters: any) {
    try {
        console.log("[Health Status] Recording health status:", parameters);
        const { status, symptoms, severity } = parameters;
        
        // Here you could save health status to database
        // For now, just return acknowledgment
        
        return {
            success: true,
            message: 'Health status recorded successfully',
            data: {
                status,
                symptoms,
                severity,
                recordedAt: new Date().toISOString()
            }
        };
    } catch (error) {
        console.error('[Health Status] Error recording health status:', error);
        return {
            success: false,
            message: 'Error recording health status',
            error: error
        };
    }
}

async function verifyMedicationCompliance(parameters: any) {
    try {
        console.log("[Medication] Verifying medication compliance:", parameters);
        const { medicationName, taken, timeOfDay } = parameters;
        
        // Here you could log medication compliance to database
        
        return {
            success: true,
            message: 'Medication compliance logged successfully',
            data: {
                medicationName,
                taken,
                timeOfDay,
                loggedAt: new Date().toISOString()
            }
        };
    } catch (error) {
        console.error('[Medication] Error logging medication compliance:', error);
        return {
            success: false,
            message: 'Error logging medication compliance',
            error: error
        };
    }
}

async function completePolCheck(parameters: any) {
    try {
        console.log("[POL Check] Completing proof of life check:", parameters);
        const { checkStatus, notes } = parameters;
        
        // Here you could update check completion status in database
        
        return {
            success: true,
            message: 'Proof of life check completed successfully',
            data: {
                checkStatus,
                notes,
                completedAt: new Date().toISOString()
            }
        };
    } catch (error) {
        console.error('[POL Check] Error completing check:', error);
        return {
            success: false,
            message: 'Error completing proof of life check',
            error: error
        };
    }
}

export default router
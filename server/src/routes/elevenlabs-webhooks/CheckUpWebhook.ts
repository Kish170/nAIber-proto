import express from 'express';
import { UserProfileService } from '../../services/UserProfileService';
import { HealthDataService } from '../../services/HealthDataService';
import { EmergencyService } from '../../services/EmergencyService';
import { PersonalizationService } from '../../services/PersonalizationService';
import { ConversationMemoryService } from '../../services/ConversationContextService';
import { BasicInfoTools } from '../../tools/BasicInfo';
import { userContextManager } from '../../utils/UserContext';
import path from 'path';
import dotenv from 'dotenv';

dotenv.config({ path: path.resolve(__dirname, '../../../../.env') });

const router = express.Router();
const userProfileService = new UserProfileService();
const healthDataService = new HealthDataService();
const emergencyService = new EmergencyService();
const personalizationService = new PersonalizationService();
const conversationMemoryService = new ConversationMemoryService();
const basicInfoTools = new BasicInfoTools();

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
    const { function_name, conversation_id } = req.body;

    // Set default empty object for parameters if not provided
    req.body.parameters = req.body.parameters || {};

    if (!function_name || !conversation_id) {
        return res.status(400).json({
            success: false,
            error: 'Missing required fields: function_name, conversation_id',
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
                result = await emergencyService.escalateToHuman(parameters);
                break;

            case 'get_user_profile':
                result = await userProfileService.getUserProfile(parameters);
                break;
                
            case 'check_health_status':
                result = await healthDataService.checkHealthStatus(parameters);
                break;
                
            case 'verify_medication_compliance':
                result = await healthDataService.verifyMedicationCompliance(parameters);
                break;
                
            case 'complete_pol_check':
                result = await userProfileService.completePolCheck(parameters);
                break;

            case 'search_conversation_history':
                const context = userContextManager.getContextByConversation(conversation_id);
                let userId: string;

                if (context && context.userId !== 'PENDING') {
                    userId = context.userId;
                } else {
                    const fetchedUserId = await basicInfoTools.getUserID({conversationId: conversation_id});
                    if (!fetchedUserId) {
                        throw new Error('User not found for this conversation ID');
                    }
                    userId = fetchedUserId;
                }

                const { query, limit } = parameters;
                if (!query) {
                    throw new Error('Query parameter is required for searching conversation history');
                }

                result = await conversationMemoryService.searchConversationHistory(userId, query, limit);
                break;

            case 'get_recent_topics':
                result = await personalizationService.getRecentTopics(conversation_id);
                break;

            case 'summarize_conversation_topics':
                result = await personalizationService.summarizeConversationTopics(parameters, conversation_id);
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


export default router
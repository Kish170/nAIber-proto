import express from 'express';
import { HealthDataService } from '../../services/HealthDataService';
import { PersonalizationService } from '../../services/PersonalizationService';
import { ConversationMemoryService } from '../../services/ConversationContextService';
import { userContextManager } from '../../tools/UserContext';
import { UserProfile } from '../../repositories/UserRespository';

import path from 'path';
import dotenv from 'dotenv';

dotenv.config({ path: path.resolve(__dirname, '../../../../.env') });

const router = express.Router();
const healthDataService = new HealthDataService();
const personalizationService = new PersonalizationService();
const conversationMemoryService = new ConversationMemoryService();

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
            case 'verify_medication_compliance':
                result = await healthDataService.verifyMedicationCompliance(parameters);
                break;

            case 'search_conversation_history':
                const context = userContextManager.getContextByConversation(conversation_id);
                let userId: string;

                if (context && context.userId !== 'PENDING') {
                    userId = context.userId;
                } else {
                    const fetchedUserId = await userData.id;
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
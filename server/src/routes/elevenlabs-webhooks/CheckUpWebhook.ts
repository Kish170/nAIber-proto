import express from 'express';
import { UserProfileService } from '../../services/UserProfileService';
import { HealthDataService } from '../../services/HealthDataService';
import { EmergencyService } from '../../services/EmergencyService';
import path from 'path';
import dotenv from 'dotenv';

dotenv.config({ path: path.resolve(__dirname, '../../../../.env') });

const router = express.Router();
const userProfileService = new UserProfileService();
const healthDataService = new HealthDataService();
const emergencyService = new EmergencyService();

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
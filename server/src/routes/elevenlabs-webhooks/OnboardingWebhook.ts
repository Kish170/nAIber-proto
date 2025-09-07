import express from 'express';
import { UserProfileService } from '../../services/UserProfileService';
import { HealthDataService } from '../../services/HealthDataService';
import { EmergencyService } from '../../services/EmergencyService';
import { PersonalizationService } from '../../services/PersonalizationService';

const router = express.Router();
const userProfileService = new UserProfileService();
const healthDataService = new HealthDataService();
const emergencyService = new EmergencyService();
const personalizationService = new PersonalizationService();

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

router.post('/elevenlabs-webhook', validateRequest, async (req, res) => {
  const { function_name, parameters, conversation_id } = req.body;
  
  console.log(`ElevenLabs webhook called: ${function_name}`, {
    parameters,
    conversation_id,
    conversation_id_type: typeof conversation_id,
    conversation_id_value: JSON.stringify(conversation_id)
  });

  try {
    let result: any;
    
    switch (function_name) {
      case 'create_user':
        result = await userProfileService.createUser(parameters, conversation_id);
        break;
        
      case 'save_user_data':
        result = await userProfileService.saveUserData(parameters, conversation_id);
        break;
        
      case 'create_emergency_contact':
        result = await emergencyService.createEmergencyContact(parameters, conversation_id);
        break;
        
      case 'check_missing_info':
        result = await userProfileService.checkMissingInfo(parameters);
        break;
        
      case 'add_health_condition':
        result = await healthDataService.addHealthCondition(parameters, conversation_id);
        break;
        
      case 'get_user_health_conditions':
        result = await healthDataService.getUserHealthConditions(parameters);
        break;
        
      case 'add_medication':
        result = await healthDataService.addMedication(parameters, conversation_id);
        break;
        
      case 'get_user_medications':
        result = await healthDataService.getUserMedications(parameters);
        break;
        
      case 'save_personalization_data':
        result = await personalizationService.savePersonalizationData(parameters, conversation_id);
        break;
        
      case 'get_user_personalization':
        result = await personalizationService.getUserPersonalization(parameters);
        break;
        
      case 'add_hobby_interest':
        result = await personalizationService.addHobbyInterest(parameters, conversation_id);
        break;
        
      case 'add_favorite_topic':
        result = await personalizationService.addFavoriteTopic(parameters, conversation_id);
        break;
        
      case 'add_like_dislike':
        result = await personalizationService.addLikeDislike(parameters, conversation_id);
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



export default router;

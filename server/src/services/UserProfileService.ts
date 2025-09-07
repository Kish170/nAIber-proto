import { BasicInfoTools } from '../tools/BasicInfo';
import { PrismaClient, Gender, CheckInFrequency } from '../../../generated/prisma';

const basicInfoCRUD = new BasicInfoTools();
const prismaClient = new PrismaClient();

export class UserProfileService {
  async createUser(parameters: any, conversationID: string) {
    const { fullName } = parameters;
    
    if (!fullName || !conversationID) {
      throw new Error('fullName and conversationID is required');
    }
    
    const user = await basicInfoCRUD.createUser({ fullName, conversationID });
    
    return {
      success: true,
      message: `Successfully created user profile for ${fullName}`,
      data: {
        userId: user.id,
        fullName: user.fullName,
        conversationID: user.conversationID
      }
    };
  }

  async saveUserData(parameters: any, conversationID: string) {
    const { field, value } = parameters;
    
    if (!field || value === undefined || !conversationID) {
      throw new Error('field, value, and userId are required');
    }
    
    let processedValue = value;
    
    if (field === 'gender') {
      const validGenders = ['MALE', 'FEMALE', 'NON_BINARY', 'PREFER_NOT_TO_SAY'];
      const upperValue = value.toString().toUpperCase();
      if (!validGenders.includes(upperValue)) {
        throw new Error(`Invalid gender. Must be one of: ${validGenders.join(', ')}`);
      }
      processedValue = upperValue as Gender;
    }
    
    if (field === 'checkInFrequency') {
      const validFrequencies = ['DAILY', 'WEEKLY', 'MONTHLY', 'AS_NEEDED'];
      const upperValue = value.toString().toUpperCase();
      if (!validFrequencies.includes(upperValue)) {
        throw new Error(`Invalid check-in frequency. Must be one of: ${validFrequencies.join(', ')}`);
      }
      processedValue = upperValue as CheckInFrequency;
    }
    
    if (field === 'age') {
      processedValue = parseInt(value);
      if (isNaN(processedValue) || processedValue < 0 || processedValue > 150) {
        throw new Error('Age must be a valid number between 0 and 150');
      }
    }
    
    await basicInfoCRUD.updateUser(field, processedValue, conversationID);
    
    return {
      success: true,
      message: `Successfully updated ${field}`,
      data: {
        field,
        value: processedValue,
        conversationID
      }
    };
  }

  async checkMissingInfo(parameters: any) {
    const { userId } = parameters;
    
    if (!userId) {
      throw new Error('userId is required');
    }
    
    const user = await prismaClient.user.findUnique({
      where: { id: userId },
      include: {
        emergencyContacts: true
      }
    });
    
    if (!user) {
      throw new Error('User not found');
    }
    
    const missingFields: string[] = [];
    const requiredFields = [
      { field: 'fullName', value: user.fullName },
      { field: 'age', value: user.age },
      { field: 'phoneNumber', value: user.phoneNumber },
      { field: 'gender', value: user.gender },
      { field: 'preferredCheckInTime', value: user.preferredCheckInTime },
      { field: 'checkInFrequency', value: user.checkInFrequency }
    ];
    
    requiredFields.forEach(({ field, value }) => {
      if (!value) {
        missingFields.push(field);
      }
    });
    
    const hasEmergencyContact = user.emergencyContacts.length > 0;
    if (!hasEmergencyContact) {
      missingFields.push('emergencyContact');
    }
    
    return {
      success: true,
      message: missingFields.length === 0 ? 'All required information is complete' : `Missing ${missingFields.length} required fields`,
      data: {
        missingFields,
        isComplete: missingFields.length === 0,
        completedFields: requiredFields.filter(({ value }) => value).map(({ field }) => field),
        hasEmergencyContact
      }
    };
  }

  async getUserProfile(parameters: any) {
    try {
      console.log("[UserProfile] Getting user info");
      const userID = await basicInfoCRUD.getUserID({ phoneNumber: `${process.env.PHONE_NUMBER}` });
      console.log('[UserProfile] Found user ID:', userID);
      
      if (userID) {
        const userInfo = await basicInfoCRUD.getAllUserInfo(userID);
        return {
          success: true,
          message: 'User information retrieved successfully',
          data: userInfo
        };
      }
      
      return {
        success: false,
        message: 'User not found'
      };
    } catch(error) {
      console.error('[UserProfile] Error getting user info:', error);
      return {
        success: false,
        message: 'Error retrieving user information',
        error: error
      };
    }
  }

  async completePolCheck(parameters: any) {
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
}
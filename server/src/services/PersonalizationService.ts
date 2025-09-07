import { BasicInfoTools } from '../tools/BasicInfo';

const basicInfoCRUD = new BasicInfoTools();

export class PersonalizationService {
  async savePersonalizationData(parameters: any, conversationID: string) {
    const { field, value } = parameters;
    
    if (!field || value === undefined || !conversationID) {
      throw new Error('field, value, and conversationID are required');
    }
    
    const userId = await basicInfoCRUD.getUserID({conversationId: conversationID});
    
    const validPersonalizationFields = ['dailyRoutine'];
    if (!validPersonalizationFields.includes(field)) {
      throw new Error(`Invalid personalization field. Must be one of: ${validPersonalizationFields.join(', ')}`);
    }
    
    await basicInfoCRUD.updatePersonalizationField(userId, field, value);
    
    return {
      success: true,
      message: `Successfully updated ${field}`,
      data: {
        field,
        value,
        conversationID
      }
    };
  }

  async getUserPersonalization(parameters: any) {
    const { conversationID } = parameters;

    if (!conversationID) {
      throw new Error('conversationID is required');
    }
    
    const userId = await basicInfoCRUD.getUserID({conversationId: conversationID});
    
    if (!userId) {
      throw new Error('User not found');
    }
    
    const user = await basicInfoCRUD.getUserPersonalization(userId);
    
    if (!user) {
      throw new Error('User not found');
    }
    
    return {
      success: true,
      message: 'Successfully retrieved personalization data',
      data: {
        hobbiesInterests: user.hobbiesInterests,
        favoriteTopics: user.favoriteTopics,
        likes: user.likes,
        dislikes: user.dislikes,
        dailyRoutine: user.dailyRoutine
      }
    };
  }

  async addHobbyInterest(parameters: any, conversationID: string) {
    const { hobby } = parameters;
    
    if (!hobby || !conversationID) {
      throw new Error('hobby and conversationID are required');
    }
    
    const userId = await basicInfoCRUD.getUserID({conversationId: conversationID});
    const user = await basicInfoCRUD.getUserPersonalization(userId);
    
    if (!user) {
      throw new Error('User not found');
    }
    
    const currentHobbies = user.hobbiesInterests || [];
    if (!currentHobbies.includes(hobby)) {
      await basicInfoCRUD.addHobbyInterest(userId, hobby);
      const updatedHobbies = [...currentHobbies, hobby];
      
      return {
        success: true,
        message: `Successfully added hobby: ${hobby}`,
        data: {
          hobby,
          totalHobbies: updatedHobbies.length,
          allHobbies: updatedHobbies
        }
      };
    } else {
      return {
        success: true,
        message: `Hobby "${hobby}" already exists`,
        data: {
          hobby,
          totalHobbies: currentHobbies.length,
          allHobbies: currentHobbies
        }
      };
    }
  }

  async addFavoriteTopic(parameters: any, conversationID: string) {
    const { topic } = parameters;
    
    if (!topic || !conversationID) {
      throw new Error('topic and conversationID are required');
    }
    
    const userId = await basicInfoCRUD.getUserID({conversationId: conversationID});
    
    const user = await basicInfoCRUD.getUserPersonalization(userId);
    
    if (!user) {
      throw new Error('User not found');
    }
    
    const currentTopics = user.favoriteTopics || [];
    if (!currentTopics.includes(topic)) {
      await basicInfoCRUD.addFavoriteTopic(userId, topic);
      const updatedTopics = [...currentTopics, topic];
      
      return {
        success: true,
        message: `Successfully added favorite topic: ${topic}`,
        data: {
          topic,
          totalTopics: updatedTopics.length,
          allTopics: updatedTopics
        }
      };
    } else {
      return {
        success: true,
        message: `Topic "${topic}" already exists`,
        data: {
          topic,
          totalTopics: currentTopics.length,
          allTopics: currentTopics
        }
      };
    }
  }

  async addLikeDislike(parameters: any, conversationID: string) {
    const { item, type } = parameters;
    
    if (!item || !type || !conversationID) {
      throw new Error('item, type (like/dislike), and conversationID are required');
    }
    
    if (type !== 'like' && type !== 'dislike') {
      throw new Error('type must be either "like" or "dislike"');
    }
    
    const userId = await basicInfoCRUD.getUserID({conversationId: conversationID});
    
    const user = await basicInfoCRUD.getUserPersonalization(userId);
    
    if (!user) {
      throw new Error('User not found');
    }
    
    const fieldName = type === 'like' ? 'likes' : 'dislikes';
    const currentItems = user[fieldName] || [];
    
    if (!currentItems.includes(item)) {
      await basicInfoCRUD.addLikeDislike(userId, item, type as 'like' | 'dislike');
      const updatedItems = [...currentItems, item];
      
      return {
        success: true,
        message: `Successfully added ${type}: ${item}`,
        data: {
          item,
          type,
          totalItems: updatedItems.length,
          allItems: updatedItems
        }
      };
    } else {
      return {
        success: true,
        message: `${type} "${item}" already exists`,
        data: {
          item,
          type,
          totalItems: currentItems.length,
          allItems: currentItems
        }
      };
    }
  }
}
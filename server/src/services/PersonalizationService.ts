import { BasicInfoTools } from '../tools/BasicInfo';
import { PrismaClient } from '../../../generated/prisma';
import { userContextManager } from '../utils/UserContext';

const prisma = new PrismaClient();

export class PersonalizationService {
  private readonly basicInfoCRUD = new BasicInfoTools();

  async savePersonalizationData(parameters: any, conversationID: string) {
    const { field, value } = parameters;

    if (!field || value === undefined || !conversationID) {
      throw new Error('field, value, and conversationID are required');
    }

    const userId = await this.basicInfoCRUD.getUserID({conversationId: conversationID});

    if (!userId) {
      throw new Error('User not found for this conversation ID');
    }

    const validPersonalizationFields = ['dailyRoutine'];
    if (!validPersonalizationFields.includes(field)) {
      throw new Error(`Invalid personalization field. Must be one of: ${validPersonalizationFields.join(', ')}`);
    }

    await this.basicInfoCRUD.updatePersonalizationField(userId, field, value);

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

    const userId = await this.basicInfoCRUD.getUserID({conversationId: conversationID});

    if (!userId) {
      throw new Error('User not found for this conversation ID');
    }

    const user = await prisma.user.findUnique({
      where: { id: userId },
      include: {
        topics: {
          include: {
            topic: true
          }
        },
        preferences: {
          include: {
            preference: true
          }
        }
      }
    });

    if (!user) {
      throw new Error('User not found');
    }
    
    // Separate general topics (from older conversations) from recent conversation topics
    const recentTopics = user.topics
      .filter((ut: any) => ut.conversationId === user.lastConversationId)
      .map((ut: any) => ut.topic.name);

    const generalTopics = user.topics
      .filter((ut: any) => ut.conversationId !== user.lastConversationId)
      .map((ut: any) => ut.topic.name);

    const likes = user.preferences
      .filter((up: any) => up.preference.type === 'like')
      .map((up: any) => up.preference.name);
      
    const dislikes = user.preferences
      .filter((up: any) => up.preference.type === 'dislike')
      .map((up: any) => up.preference.name);

    return {
      success: true,
      message: 'Successfully retrieved personalization data',
      data: {
        generalTopics: generalTopics,
        recentConversationTopics: recentTopics,
        likes: likes,
        dislikes: dislikes,
        dailyRoutine: user.dailyRoutine,
        lastConversationId: user.lastConversationId
      }
    };
  }

  async addTopic(parameters: any, conversationID: string) {
    const { topic } = parameters;

    if (!topic || !conversationID) {
      throw new Error('topic and conversationID are required');
    }

    const userId = await this.basicInfoCRUD.getUserID({conversationId: conversationID});

    if (!userId) {
      throw new Error('User not found for this conversation ID');
    }


    // Create or get the topic
    const topicRecord = await prisma.topic.upsert({
      where: { name: topic },
      update: {},
      create: {
        name: topic,
        category: 'general'
      }
    });

    // Upsert UserTopic to ensure topic is associated with current conversation
    const userTopic = await prisma.userTopic.upsert({
      where: {
        userId_topicId: {
          userId: userId,
          topicId: topicRecord.id
        }
      },
      update: {
        conversationId: conversationID,
        createdAt: new Date() // Update timestamp to reflect recent usage
      },
      create: {
        userId: userId,
        topicId: topicRecord.id,
        conversationId: conversationID
      }
    });

    const wasUpdated = userTopic.conversationId === conversationID && userTopic.createdAt > new Date(Date.now() - 1000);

    return {
      success: true,
      message: wasUpdated
        ? `Successfully moved topic "${topic}" to current conversation`
        : `Successfully added topic: ${topic}`,
      data: {
        topic,
        conversationID,
        wasExistingTopic: wasUpdated
      }
    };
  }

  async summarizeConversationTopics(parameters: any, conversationID: string) {
    const { topics } = parameters;

    if (!topics || !Array.isArray(topics) || topics.length === 0) {
      throw new Error('topics array is required and must contain at least one topic');
    }

    if (!conversationID) {
      throw new Error('conversationID is required');
    }

    const results = [];

    for (const topicName of topics) {
      try {
        const result = await this.addTopic({ topic: topicName.trim() }, conversationID);
        results.push({
          topic: topicName,
          success: true,
          message: result.message,
          wasExistingTopic: result.data.wasExistingTopic || false
        });
      } catch (error) {
        console.error(`Failed to add topic "${topicName}":`, error);
        results.push({
          topic: topicName,
          success: false,
          message: error instanceof Error ? error.message : 'Unknown error',
          wasExistingTopic: false
        });
      }
    }

    const successfulTopics = results.filter(r => r.success);
    const failedTopics = results.filter(r => !r.success);

    return {
      success: true,
      message: `Successfully processed ${topics.length} topics for conversation`,
      data: {
        conversationID,
        totalProcessed: topics.length,
        successfulCount: successfulTopics.length,
        failedCount: failedTopics.length,
        results: results
      }
    };
  }

  async addPreference(parameters: any, conversationID: string) {
    const { item, type } = parameters;

    if (!item || !type || !conversationID) {
      throw new Error('item, type (like/dislike), and conversationID are required');
    }

    if (type !== 'like' && type !== 'dislike') {
      throw new Error('type must be either "like" or "dislike"');
    }

    const userId = await this.basicInfoCRUD.getUserID({conversationId: conversationID});

    if (!userId) {
      throw new Error('User not found for this conversation ID');
    }

    // Create or get the preference
    const preferenceRecord = await prisma.preference.upsert({
      where: { name: item },
      update: {},
      create: {
        name: item,
        type: type,
        category: 'general'
      }
    });

    // Check if user already has this preference
    const existingUserPref = await prisma.userPreference.findUnique({
      where: {
        userId_preferenceId: {
          userId: userId,
          preferenceId: preferenceRecord.id
        }
      }
    });

    if (!existingUserPref) {
      await prisma.userPreference.create({
        data: {
          userId: userId,
          preferenceId: preferenceRecord.id
        }
      });

      // Get updated list of this type
      const userPrefs = await prisma.userPreference.findMany({
        where: {
          userId: userId,
          preference: {
            type: type
          }
        },
        include: { preference: true }
      });

      const allItems = userPrefs.map((up: any) => up.preference.name);

      return {
        success: true,
        message: `Successfully added ${type}: ${item}`,
        data: {
          item,
          type,
          totalItems: allItems.length,
          allItems: allItems
        }
      };
    } else {
      // Get current list of this type
      const userPrefs = await prisma.userPreference.findMany({
        where: {
          userId: userId,
          preference: {
            type: type
          }
        },
        include: { preference: true }
      });

      const allItems = userPrefs.map((up: any) => up.preference.name);

      return {
        success: true,
        message: `${type} "${item}" already exists`,
        data: {
          item,
          type,
          totalItems: allItems.length,
          allItems: allItems
        }
      };
    }
  }

  async addHobbyInterest(parameters: any, conversationID: string) {
    const { hobby } = parameters;
    return this.addTopic({ topic: hobby }, conversationID);
  }

  async addFavoriteTopic(parameters: any, conversationID: string) {
    const { topic } = parameters;
    return this.addTopic({ topic }, conversationID);
  }

  async addLikeDislike(parameters: any, conversationID: string) {
    return this.addPreference(parameters, conversationID);
  }

  async addConversationTopic(parameters: any, conversationID: string) {
    return this.addTopic(parameters, conversationID);
  }

  async getConversationTopics(parameters: any) {
    const { conversationID } = parameters;

    if (!conversationID) {
      throw new Error('conversationID is required');
    }

    const userId = await this.basicInfoCRUD.getUserID({conversationId: conversationID});

    if (!userId) {
      throw new Error('User not found for this conversation ID');
    }

    const conversationTopics = await prisma.userTopic.findMany({
      where: {
        userId: userId,
        conversationId: conversationID
      },
      include: { topic: true },
      orderBy: { createdAt: 'desc' }
    });

    return {
      success: true,
      message: 'Successfully retrieved conversation topics',
      data: {
        conversationID,
        topics: conversationTopics.map((ut: any) => ({
          name: ut.topic.name,
          createdAt: ut.createdAt
        })),
        totalTopics: conversationTopics.length
      }
    };
  }

  async updateLastConversationId(conversationID: string) {
    const userId = await this.basicInfoCRUD.getUserID({conversationId: conversationID});

    if (!userId) {
      throw new Error('User not found for this conversation ID');
    }

    await prisma.user.update({
      where: { id: userId },
      data: { lastConversationId: conversationID }
    });

    return {
      success: true,
      message: 'Successfully updated last conversation ID',
      data: {
        conversationID,
        userId
      }
    };
  }

  async getRecentTopics(conversationID: string) {
    // Try to get user context first (more efficient)
    const context = userContextManager.getContextByConversation(conversationID);

    let userId: string;
    let lastConversationId: string | undefined;

    if (context && context.userId !== 'PENDING') {
      userId = context.userId;
      lastConversationId = context.lastConversationId;
    } else {
      // Fallback to database if context not found
      const fetchedUserId = await this.basicInfoCRUD.getUserID({conversationId: conversationID});
      if (!fetchedUserId) {
        throw new Error('User not found for this conversation ID');
      }
      userId = fetchedUserId;

      // Get lastConversationId from database
      const user = await prisma.user.findUnique({
        where: { id: userId },
        select: { lastConversationId: true }
      });
      lastConversationId = user?.lastConversationId || undefined;
    }

    if (!lastConversationId) {
      return {
        success: true,
        message: 'No recent conversation found',
        data: {
          recentTopics: [],
          lastConversationId: null,
          totalTopics: 0,
          availableForReference: false
        }
      };
    }

    // Get topics from the most recent completed conversation
    const recentTopics = await prisma.userTopic.findMany({
      where: {
        userId: userId,
        conversationId: lastConversationId
      },
      include: { topic: true },
      orderBy: { createdAt: 'desc' }
    });

    return {
      success: true,
      message: 'Successfully retrieved recent conversation topics',
      data: {
        recentTopics: recentTopics.map((ut: any) => ({
          name: ut.topic.name,
          category: ut.topic.category,
          createdAt: ut.createdAt
        })),
        lastConversationId: lastConversationId,
        totalTopics: recentTopics.length,
        availableForReference: recentTopics.length > 0
      }
    };
  }
}
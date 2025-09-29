interface UserContextData {
  userId: string;
  conversationID: string;
  lastConversationId?: string;
  phoneNumber?: string;
  fullName?: string;
  // Add other frequently accessed fields as needed
}

export class UserContext {
  public readonly userId: string;
  public conversationID: string;
  public lastConversationId?: string;
  public phoneNumber?: string;
  public fullName?: string;

  private lastUpdated: number;
  private readonly ttl: number = 30 * 60 * 1000; // 30 minutes TTL

  constructor(data: UserContextData) {
    this.userId = data.userId;
    this.conversationID = data.conversationID;
    this.lastConversationId = data.lastConversationId;
    this.phoneNumber = data.phoneNumber;
    this.fullName = data.fullName;
    this.lastUpdated = Date.now();
  }

  updateConversationId(newConversationId: string) {
    this.conversationID = newConversationId;
    this.lastUpdated = Date.now();
  }

  updateLastConversationId(lastConversationId: string) {
    this.lastConversationId = lastConversationId;
    this.lastUpdated = Date.now();
  }

  isExpired(): boolean {
    return Date.now() - this.lastUpdated > this.ttl;
  }

  refresh() {
    this.lastUpdated = Date.now();
  }

  // Update user ID when transitioning from PENDING to actual user ID during onboarding
  updateUserId(newUserId: string) {
    if (this.userId === 'PENDING') {
      (this as any).userId = newUserId; // Override readonly for this specific case
      this.lastUpdated = Date.now();
    }
  }

  // Update full name during onboarding
  updateFullName(fullName: string) {
    this.fullName = fullName;
    this.lastUpdated = Date.now();
  }
}

export class UserContextManager {
  private static instance: UserContextManager;
  private contexts = new Map<string, UserContext>(); // Key: conversationID or phoneNumber
  private userIdToConversation = new Map<string, string>(); // Key: userId, Value: conversationID

  private constructor() {}

  static getInstance(): UserContextManager {
    if (!UserContextManager.instance) {
      UserContextManager.instance = new UserContextManager();
    }
    return UserContextManager.instance;
  }

  // Create or update context when conversation starts
  async setContext(key: string, contextData: UserContextData): Promise<UserContext> {
    const context = new UserContext(contextData);
    this.contexts.set(key, context);
    this.userIdToConversation.set(contextData.userId, contextData.conversationID);

    console.log(`[UserContext] Created context for ${key}:`, {
      userId: contextData.userId,
      conversationID: contextData.conversationID,
      lastConversationId: contextData.lastConversationId
    });

    return context;
  }

  // Get context by conversationID
  getContextByConversation(conversationID: string): UserContext | null {
    const context = this.contexts.get(conversationID);
    if (context && !context.isExpired()) {
      context.refresh();
      return context;
    }

    if (context && context.isExpired()) {
      this.removeContext(conversationID);
    }

    return null;
  }

  // Get context by phoneNumber
  getContextByPhone(phoneNumber: string): UserContext | null {
    const context = this.contexts.get(phoneNumber);
    if (context && !context.isExpired()) {
      context.refresh();
      return context;
    }

    if (context && context.isExpired()) {
      this.removeContext(phoneNumber);
    }

    return null;
  }

  // Get context by userId
  getContextByUserId(userId: string): UserContext | null {
    const conversationID = this.userIdToConversation.get(userId);
    if (conversationID) {
      return this.getContextByConversation(conversationID);
    }
    return null;
  }

  // Update conversation ID in existing context
  updateConversationId(oldKey: string, newConversationId: string): boolean {
    const context = this.contexts.get(oldKey);
    if (context) {
      context.updateConversationId(newConversationId);
      this.contexts.set(newConversationId, context);
      this.userIdToConversation.set(context.userId, newConversationId);

      // Remove old key if it's different
      if (oldKey !== newConversationId) {
        this.contexts.delete(oldKey);
      }

      console.log(`[UserContext] Updated conversation ID from ${oldKey} to ${newConversationId}`);
      return true;
    }
    return false;
  }

  // Update last conversation ID when call ends
  updateLastConversationId(conversationID: string, lastConversationId: string): boolean {
    const context = this.contexts.get(conversationID);
    if (context) {
      context.updateLastConversationId(lastConversationId);
      console.log(`[UserContext] Updated lastConversationId to ${lastConversationId} for conversation ${conversationID}`);
      return true;
    }
    return false;
  }

  // Remove expired contexts
  removeContext(key: string): boolean {
    const context = this.contexts.get(key);
    if (context) {
      this.userIdToConversation.delete(context.userId);
      this.contexts.delete(key);
      console.log(`[UserContext] Removed context for ${key}`);
      return true;
    }
    return false;
  }

  // Cleanup expired contexts (call periodically)
  cleanup(): void {
    const expired: string[] = [];

    for (const [key, context] of this.contexts) {
      if (context.isExpired()) {
        expired.push(key);
      }
    }

    expired.forEach(key => this.removeContext(key));

    if (expired.length > 0) {
      console.log(`[UserContext] Cleaned up ${expired.length} expired contexts`);
    }
  }

  // Update userId when user is created during onboarding
  updateUserIdInContext(phoneNumber: string, newUserId: string): boolean {
    const context = this.contexts.get(phoneNumber);
    if (context && context.userId === 'PENDING') {
      context.updateUserId(newUserId);
      this.userIdToConversation.set(newUserId, context.conversationID);
      console.log(`[UserContext] Updated userId from PENDING to ${newUserId} for phone ${phoneNumber}`);
      return true;
    }
    return false;
  }

  // Update full name during onboarding
  updateFullNameInContext(key: string, fullName: string): boolean {
    const context = this.contexts.get(key);
    if (context) {
      context.updateFullName(fullName);
      console.log(`[UserContext] Updated fullName to "${fullName}" for key ${key}`);
      return true;
    }
    return false;
  }

  // Get all active contexts (for debugging)
  getActiveContexts(): Array<{key: string, userId: string, conversationID: string, lastConversationId?: string}> {
    return Array.from(this.contexts.entries()).map(([key, context]) => ({
      key,
      userId: context.userId,
      conversationID: context.conversationID,
      lastConversationId: context.lastConversationId
    }));
  }
}

// Singleton instance
export const userContextManager = UserContextManager.getInstance();

// Setup periodic cleanup
setInterval(() => {
  userContextManager.cleanup();
}, 5 * 60 * 1000); // Cleanup every 5 minutes
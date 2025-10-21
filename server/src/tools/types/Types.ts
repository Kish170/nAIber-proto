
export interface ElevenLabsWebhookRequest {
    functionName: string;
    parameters: Record<string, any>;
    conversationId: string;
}

export interface ElevenLabsWebhookResponse {
    success: boolean;
    message: string;
    data?: any;
    error?: string;
}

export type EmergencyContact = {
    id: string;
    name: string;
    phone: string;
    email: string | null;
    relationship: string;
    smsEnabled: boolean;
    notifyOnMissedCalls: boolean;
};

export type HealthCondition = {
    id: string;
    condition: string;
    severity: string | null;
    isActive: boolean;
    notes: string | null;
};

export type Medication = {
    id: string;
    name: string;
    dosage: string;
    frequency: string;
    isActive: boolean;
    notes: string | null;
};

export type ConversationTopic = {
    id: string;
    topicName: string;
    category: string | null;
    lastMentioned: Date;
    conversationReferences: ConversationSummaryReferenceForTopic[];
};

export type ConversationSummary = {
    id: string;
    summaryText: string;
    createdAt: Date;
};

export type ConversationSummaryReferenceForTopic = {
    conversationSummary: {
        summaryText: string;
    };
}

export type UserProfileData = {
    id: string;
    name: string;
    age: number | null;
    phone: string;
    gender: string | null;
    interests: string[];
    dislikes: string[];
    isFirstCall: boolean;
    lastCallAt: Date | null;
    emergencyContact: EmergencyContact | null;
    healthConditions: HealthCondition[];
    medications: Medication[];
    conversationTopics: ConversationTopic[];
    conversationSummaries: ConversationSummary[];
};

export type BasicInfo = {
    name: string;
    age: number | null;
    gender: string | null;
    interests: string[];
    dislikes: string[];
}
import { UserRepository } from '@naiber/shared-data';
import {
    UserProfileData,
    EmergencyContact,
    HealthCondition,
    Medication,
    ConversationTopic,
    ConversationSummary,
    BasicInfo
} from '@naiber/shared-core';

export class UserProfile {
    private readonly data: UserProfileData;

    private constructor(data: UserProfileData) {
        this.data = data;
    }

    static async loadByPhone(phone: string): Promise<UserProfile | null> {
        const userData = await UserRepository.findByPhone(phone);

        if (!userData) {
            return null;
        }

        return new UserProfile(userData);
    }

    static async loadById(id: string): Promise<UserProfile | null> {
        const userData = await UserRepository.findById(id);

        if (!userData) {
            return null;
        }

        return new UserProfile(userData);
    }

    get id(): string {
        return this.data.id;
    }

    get name(): string {
        return this.data.name;
    }

    get phone(): string {
        return this.data.phone;
    }

    get age(): number | null {
        return this.data.age;
    }

    get isFirstCall(): boolean {
        return this.data.isFirstCall;
    }

    get lastCallAt(): Date | null {
        return this.data.lastCallAt;
    }

    getBasicInfo(): BasicInfo {
        return {
            name: this.data.name,
            age: this.data.age,
            gender: this.data.gender,
            interests: this.data.interests,
            dislikes: this.data.dislikes,
        };
    }

    getEmergencyContact(): EmergencyContact | null {
        return this.data.emergencyContact;
    }

    shouldNotifyEmergencyContact(): boolean {
        return this.data.emergencyContact?.notifyOnMissedCalls ?? false;
    }

    getActiveHealthConditions(): HealthCondition[] {
        return this.data.healthConditions.filter((c: HealthCondition) => c.isActive);
    }

    hasHealthConditions(): boolean {
        return this.getActiveHealthConditions().length > 0;
    }

    getActiveMedications(): Medication[] {
        return this.data.medications.filter((m:Medication) => m.isActive);
    }

    hasMedications(): boolean {
        return this.getActiveMedications().length > 0;
    }

    getConversationTopics(limit?: number): ConversationTopic[] {
        return limit ? this.data.conversationTopics.slice(0, limit) : this.data.conversationTopics;
    }

    hasConversationTopics(): boolean {
        return this.data.conversationTopics.length > 0;
    }

    getConversationSummaries(limit?: number): ConversationSummary[] {
        return limit ? this.data.conversationSummaries.slice(0, limit) : this.data.conversationSummaries;
    }

    getLastConversationSummary(): ConversationSummary | undefined {
        return this.data.conversationSummaries[0];
    }

    getData(): UserProfileData {
        return this.data;
    }
}


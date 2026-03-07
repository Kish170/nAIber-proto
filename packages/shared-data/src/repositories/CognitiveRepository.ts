import { prismaClient } from '@naiber/shared-clients';

export interface CognitiveTestResultData {
    userId: string;
    conversationId: string;
    callLogId?: string;
    source?: string;
    modality?: string;
    sessionIndex: number;
    wordListUsed: string;
    digitSetUsed: number;
    letterUsed: string;
    abstractionSetUsed: number;
    vigilanceSetUsed: number;
    domainScores: object;
    taskResponses: object;
    stabilityIndex?: number;
    isPartial?: boolean;
    wellbeingCheckResponses?: object;
    distressDetected?: boolean;
    deferralReason?: string;
}

export interface CognitiveBaselineData {
    userId: string;
    featureVector: object;
    rawValues: object;
    domainBaselines: object;
    version: number;
}

export class CognitiveRepository {
    static async createTestResult(data: CognitiveTestResultData) {
        try {
            return await prismaClient.cognitiveTestResult.create({ data });
        } catch (error) {
            console.error('[CognitiveRepository] Unable to create test result:', error);
            throw error;
        }
    }

    static async findTestResultsByUserId(userId: string, limit?: number) {
        try {
            return await prismaClient.cognitiveTestResult.findMany({
                where: { userId },
                orderBy: { completedAt: 'desc' },
                ...(limit ? { take: limit } : {}),
            });
        } catch (error) {
            console.error('[CognitiveRepository] Unable to find test results:', error);
            throw error;
        }
    }

    static async getSessionCount(userId: string): Promise<number> {
        try {
            return await prismaClient.cognitiveTestResult.count({
                where: {
                    userId,
                    deferralReason: null,
                    isPartial: false,
                },
            });
        } catch (error) {
            console.error('[CognitiveRepository] Unable to get session count:', error);
            throw error;
        }
    }

    static async getLatestBaseline(userId: string) {
        try {
            return await prismaClient.cognitiveBaseline.findFirst({
                where: { userId },
                orderBy: { version: 'desc' },
            });
        } catch (error) {
            console.error('[CognitiveRepository] Unable to get latest baseline:', error);
            throw error;
        }
    }

    static async createBaseline(data: CognitiveBaselineData) {
        try {
            return await prismaClient.cognitiveBaseline.create({ data });
        } catch (error) {
            console.error('[CognitiveRepository] Unable to create baseline:', error);
            throw error;
        }
    }

    static async findRecentCompletedResults(userId: string, count: number) {
        try {
            return await prismaClient.cognitiveTestResult.findMany({
                where: {
                    userId,
                    isPartial: false,
                    deferralReason: null,
                },
                orderBy: { completedAt: 'desc' },
                take: count,
            });
        } catch (error) {
            console.error('[CognitiveRepository] Unable to find recent completed results:', error);
            throw error;
        }
    }
}

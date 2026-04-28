import { prismaClient } from '@naiber/shared-clients';
import { cognitiveSessionInclude } from '@naiber/shared-core';

export interface CognitiveTestResultData {
    elderlyProfileId: string;
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

export interface CognitiveBaselineCreateData {
    elderlyProfileId: string;
    featureVector: object;
    rawValues: object;
    domainBaselines: object;
    version: number;
    callsIncluded: number;
    baselineLocked: boolean;
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

    static async findTestResultsByElderlyProfileId(elderlyProfileId: string, limit?: number) {
        try {
            return await prismaClient.cognitiveTestResult.findMany({
                where: { elderlyProfileId },
                orderBy: { completedAt: 'desc' },
                ...(limit ? { take: limit } : {}),
            });
        } catch (error) {
            console.error('[CognitiveRepository] Unable to find test results:', error);
            throw error;
        }
    }

    static async getSessionCount(elderlyProfileId: string): Promise<number> {
        try {
            return await prismaClient.cognitiveTestResult.count({
                where: {
                    elderlyProfileId,
                    deferralReason: null,
                    isPartial: false,
                },
            });
        } catch (error) {
            console.error('[CognitiveRepository] Unable to get session count:', error);
            throw error;
        }
    }

    static async getLatestBaseline(elderlyProfileId: string) {
        try {
            return await prismaClient.cognitiveBaseline.findFirst({
                where: { elderlyProfileId },
                orderBy: { version: 'desc' },
            });
        } catch (error) {
            console.error('[CognitiveRepository] Unable to get latest baseline:', error);
            throw error;
        }
    }

    static async createBaseline(data: CognitiveBaselineCreateData) {
        try {
            return await prismaClient.cognitiveBaseline.create({ data });
        } catch (error) {
            console.error('[CognitiveRepository] Unable to create baseline:', error);
            throw error;
        }
    }

    static async updateBaselineLock(id: string, callsIncluded: number, baselineLocked: boolean) {
        try {
            return await prismaClient.cognitiveBaseline.update({
                where: { id },
                data: { callsIncluded, baselineLocked },
            });
        } catch (error) {
            console.error('[CognitiveRepository] Unable to update baseline lock:', error);
            throw error;
        }
    }

    static async findSessionsWithCallLog(elderlyProfileId: string, limit: number = 10) {
        try {
            return await prismaClient.cognitiveTestResult.findMany({
                where: { elderlyProfileId },
                include: cognitiveSessionInclude,
                orderBy: { completedAt: 'desc' },
                take: limit,
            });
        } catch (error) {
            console.error('[CognitiveRepository] Unable to find sessions with call log:', error);
            throw error;
        }
    }

    static async findSessionDetailById(id: string) {
        try {
            return await prismaClient.cognitiveTestResult.findUnique({
                where: { id },
                include: cognitiveSessionInclude,
            });
        } catch (error) {
            console.error('[CognitiveRepository] Unable to find session detail:', error);
            throw error;
        }
    }

    static async findRecentCompletedResults(elderlyProfileId: string, count: number) {
        try {
            return await prismaClient.cognitiveTestResult.findMany({
                where: {
                    elderlyProfileId,
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

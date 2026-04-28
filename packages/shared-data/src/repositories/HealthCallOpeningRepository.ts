import { prismaClient } from '@naiber/shared-clients';

export interface HealthCallOpeningCreateData {
    callLogId: string;
    sentiment: 'WELL' | 'POORLY' | 'AMBIGUOUS';
    statedConcern?: string | null;
    disposition: 'PROCEEDED' | 'ENDED_NOT_READY' | 'REDIRECTED_GENERAL';
    endReason?: string | null;
}

export class HealthCallOpeningRepository {
    static async createHealthCallOpening(data: HealthCallOpeningCreateData) {
        return prismaClient.healthCallOpening.create({
            data: {
                callLogId: data.callLogId,
                sentiment: data.sentiment,
                statedConcern: data.statedConcern ?? null,
                disposition: data.disposition,
                endReason: data.endReason ?? null,
            }
        });
    }

    static async findByCallLogId(callLogId: string) {
        return prismaClient.healthCallOpening.findUnique({ where: { callLogId } });
    }
}

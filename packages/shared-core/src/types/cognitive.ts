import { Prisma } from '../../../../generated/prisma/index.js';

export const cognitiveSessionInclude = Prisma.validator<Prisma.CognitiveTestResultInclude>()({
    callLog: {
        select: {
            id: true,
            scheduledTime: true,
            endTime: true,
            status: true,
        }
    }
});

export type CognitiveSessionData = Prisma.CognitiveTestResultGetPayload<{
    include: typeof cognitiveSessionInclude
}>;

export type CognitiveBaselineData = Prisma.CognitiveBaselineGetPayload<{}>;

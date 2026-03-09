import type { CreateExpressContextOptions } from '@trpc/server/adapters/express';
import { prismaClient } from '@naiber/shared-clients';

export interface Session {
    userId: string;
    caregiverProfileId?: string;
    elderlyProfileId?: string;
    role: 'caregiver' | 'elderly';
}

export interface Context {
    session: Session | null;
}

export async function createContext({ req }: CreateExpressContextOptions): Promise<Context> {
    const sessionToken =
        req.cookies?.['authjs.session-token'] ??
        req.cookies?.['__Secure-authjs.session-token'];

    if (!sessionToken) {
        return { session: null };
    }

    const dbSession = await prismaClient.session.findUnique({
        where: { sessionToken },
        select: { userId: true, expires: true },
    });

    if (!dbSession || dbSession.expires < new Date()) {
        return { session: null };
    }

    const [caregiverProfile, elderlyProfile] = await Promise.all([
        prismaClient.caregiverProfile.findUnique({
            where: { authUserId: dbSession.userId },
            select: { id: true },
        }),
        prismaClient.elderlyProfile.findUnique({
            where: { authUserId: dbSession.userId },
            select: { id: true },
        }),
    ]);

    if (caregiverProfile) {
        return {
            session: {
                userId: dbSession.userId,
                caregiverProfileId: caregiverProfile.id,
                role: 'caregiver',
            },
        };
    }

    if (elderlyProfile) {
        return {
            session: {
                userId: dbSession.userId,
                elderlyProfileId: elderlyProfile.id,
                role: 'elderly',
            },
        };
    }

    return { session: null };
}

import type { CreateExpressContextOptions } from '@trpc/server/adapters/express';
import { prismaClient } from '@naiber/shared-clients';
import { jwtDecrypt } from 'jose';
import { hkdfSync } from 'crypto';

export interface Session {
    userId: string;
    caregiverProfileId?: string;
    elderlyProfileId?: string;
    role: 'caregiver' | 'elderly';
}

export interface Context {
    session: Session | null;
}

interface DecodedToken {
    userId: string;
    name?: string;
    email?: string;
}

function getDerivedKey(secret: string, salt: string): Uint8Array {
    const buf = hkdfSync(
        'sha256',
        secret,
        salt,
        `Auth.js Generated Encryption Key (${salt})`,
        64
    );
    return new Uint8Array(buf);
}

async function decodeSessionToken(token: string): Promise<DecodedToken | null> {
    try {
        const secret = process.env.AUTH_SECRET;
        if (!secret) return null;

        const salt = 'authjs.session-token';
        const encryptionKey = getDerivedKey(secret, salt);
        const { payload } = await jwtDecrypt(token, encryptionKey);
        const userId = payload.sub ?? (payload as any)?.id;
        if (typeof userId !== 'string') return null;

        return {
            userId,
            name: typeof payload.name === 'string' ? payload.name : undefined,
            email: typeof payload.email === 'string' ? payload.email : undefined,
        };
    } catch (err) {
        console.error('[context] JWT decode failed:', err);
        return null;
    }
}

export async function createContext({ req }: CreateExpressContextOptions): Promise<Context> {
    const sessionToken =
        req.cookies?.['authjs.session-token'] ??
        req.cookies?.['__Secure-authjs.session-token'];

    if (!sessionToken) {
        return { session: null };
    }

    const decoded = await decodeSessionToken(sessionToken);
    if (!decoded) {
        return { session: null };
    }

    const { userId, name, email } = decoded;

    const [caregiverProfile, elderlyProfile] = await Promise.all([
        prismaClient.caregiverProfile.findUnique({
            where: { authUserId: userId },
            select: { id: true },
        }),
        prismaClient.elderlyProfile.findUnique({
            where: { authUserId: userId },
            select: { id: true },
        }),
    ]);

    if (caregiverProfile) {
        return {
            session: {
                userId,
                caregiverProfileId: caregiverProfile.id,
                role: 'caregiver',
            },
        };
    }

    if (elderlyProfile) {
        return {
            session: {
                userId,
                elderlyProfileId: elderlyProfile.id,
                role: 'elderly',
            },
        };
    }

    // New user — auto-create caregiver profile on first API call
    const newProfile = await prismaClient.caregiverProfile.create({
        data: {
            authUserId: userId,
            name: name ?? email ?? 'User',
            relationship: 'OTHER',
        },
        select: { id: true },
    });

    return {
        session: {
            userId,
            caregiverProfileId: newProfile.id,
            role: 'caregiver',
        },
    };
}

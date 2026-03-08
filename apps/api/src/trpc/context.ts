import type { CreateExpressContextOptions } from '@trpc/server/adapters/express';

export interface Context {
    session: {
        userId: string;
        caregiverProfileId?: string;
        elderlyProfileId?: string;
        role: 'caregiver' | 'elderly' | 'guest';
    } | null;
}

export async function createContext({ req }: CreateExpressContextOptions): Promise<Context> {
    // TODO: Phase 3 — resolve Auth.js session from req cookies/headers
    // For now, return null session (unauthenticated)
    return { session: null };
}

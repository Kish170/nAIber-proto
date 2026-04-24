import { initTRPC, TRPCError } from '@trpc/server';
import type { Context } from './context.js';

const t = initTRPC.context<Context>().create();

export const router = t.router;
export const publicProcedure = t.procedure;
export const createCallerFactory = t.createCallerFactory;

const isAuthed = t.middleware(({ ctx, next }: { ctx: Context; next: (opts?: unknown) => unknown }) => {
    if (!ctx.session) {
        throw new TRPCError({ code: 'UNAUTHORIZED', message: 'Not authenticated' });
    }
    return next({ ctx: { session: ctx.session } });
});

const isCaregiver = t.middleware(({ ctx, next }: { ctx: Context; next: (opts?: unknown) => unknown }) => {
    if (!ctx.session || ctx.session.role !== 'caregiver') {
        throw new TRPCError({ code: 'UNAUTHORIZED', message: 'Caregiver access required' });
    }
    if (!ctx.session.caregiverProfileId) {
        throw new TRPCError({ code: 'UNAUTHORIZED', message: 'Caregiver profile not found' });
    }
    return next({ ctx: { session: ctx.session } });
});

const isElderly = t.middleware(({ ctx, next }: { ctx: Context; next: (opts?: unknown) => unknown }) => {
    if (!ctx.session || ctx.session.role !== 'elderly') {
        throw new TRPCError({ code: 'UNAUTHORIZED', message: 'Elderly user access required' });
    }
    if (!ctx.session.elderlyProfileId) {
        throw new TRPCError({ code: 'UNAUTHORIZED', message: 'Elderly profile not found' });
    }
    return next({ ctx: { session: ctx.session } });
});

export const authedProcedure = t.procedure.use(isAuthed);
export const caregiverProcedure = t.procedure.use(isCaregiver);
export const elderlyProcedure = t.procedure.use(isElderly);

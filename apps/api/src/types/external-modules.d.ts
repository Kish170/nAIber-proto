declare module 'cors' {
    import type { RequestHandler } from 'express';
    export default function cors(options?: Record<string, unknown>): RequestHandler;
}

declare module 'cookie-parser' {
    import type { RequestHandler } from 'express';
    export default function cookieParser(secret?: string): RequestHandler;
}

declare module '@trpc/server' {
    export class TRPCError extends Error {
        constructor(options: { code: string; message?: string });
    }

    export const initTRPC: {
        context<T>(): {
            create(): {
                router(config: Record<string, unknown>): any;
                procedure: any;
                createCallerFactory: any;
                middleware(fn: (opts: any) => any): any;
            };
        };
    };
}

declare module '@trpc/server/adapters/express' {
    import type { Request, Response, NextFunction, RequestHandler } from 'express';

    export interface CreateExpressContextOptions {
        req: Request & { cookies?: Record<string, string | undefined> };
        res: Response;
        info?: unknown;
    }

    export function createExpressMiddleware(options: {
        router: unknown;
        createContext: (opts: CreateExpressContextOptions) => Promise<unknown> | unknown;
    }): RequestHandler;

    export type ExpressHandlerOptions = {
        req: Request;
        res: Response;
        next: NextFunction;
    };
}

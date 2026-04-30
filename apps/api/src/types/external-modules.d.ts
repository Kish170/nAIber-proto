declare module 'cors' {
    import type { RequestHandler } from 'express';
    export default function cors(options?: Record<string, unknown>): RequestHandler;
}

declare module 'cookie-parser' {
    import type { RequestHandler } from 'express';
    export default function cookieParser(secret?: string): RequestHandler;
}

declare module 'ws' {
    import { EventEmitter } from 'events';
    import { Server as HttpServer } from 'http';

    export type RawData = string | Buffer | ArrayBuffer | Buffer[];

    export class WebSocket extends EventEmitter {
        static readonly OPEN: number;
        constructor(address: string);
        readonly readyState: number;
        send(data: string | Buffer): void;
        ping(): void;
        close(): void;
        on(event: 'open', listener: () => void): this;
        on(event: 'message', listener: (data: RawData) => void | Promise<void>): this;
        on(event: 'close', listener: (code?: number, reason?: Buffer) => void | Promise<void>): this;
        on(event: 'error', listener: (error: unknown) => void | Promise<void>): this;
        on(event: string, listener: (...args: any[]) => void): this;
    }

    export interface WebSocketServerOptions {
        server?: HttpServer;
        path?: string;
    }

    export class WebSocketServer extends EventEmitter {
        constructor(options?: WebSocketServerOptions);
        on(event: 'connection', listener: (socket: WebSocket) => void): this;
        on(event: string, listener: (...args: any[]) => void): this;
    }
}

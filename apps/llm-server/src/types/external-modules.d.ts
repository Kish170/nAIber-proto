declare module '@langchain/langgraph' {
    export type Reducer<T> = (left: T, right: T) => T;
    export interface AnnotationConfig<T> {
        reducer?: Reducer<T>;
        value?: Reducer<T>;
        default?: () => T;
    }

    export interface AnnotationNode<T> {
        __state?: T;
    }

    export interface AnnotationRootResult {
        State: any;
    }

    export interface AnnotationFactory {
        <T>(config?: AnnotationConfig<T>): AnnotationNode<T>;
        Root(schema: Record<string, AnnotationNode<any>>): AnnotationRootResult;
    }

    export const Annotation: AnnotationFactory;
    export const END: '__end__';
    export const START: '__start__';
    export const messagesStateReducer: Reducer<any[]>;
    export function interrupt<T = unknown>(value: T): unknown;

    export class Command<T = any> {
        constructor(value: T);
    }

    export class StateGraph {
        constructor(state: any);
        addNode(name: string, handler: (...args: any[]) => any): this;
        setEntryPoint(name: string): this;
        addConditionalEdges(name: string, handler: (...args: any[]) => any): this;
        addEdge(from: string, to: string): this;
        compile(options?: Record<string, unknown>): any;
    }
}

declare module '@langchain/langgraph-checkpoint' {
    export class BaseCheckpointSaver {
        getTuple?(config: any): Promise<any>;
        put?(config: any, checkpoint: any, metadata: any, newVersions: any): Promise<any>;
        putWrites?(config: any, writes: any, taskId: any): Promise<void>;
        deleteThread?(threadId: string): Promise<void>;
        end?(): Promise<void>;
    }
}

declare module '@langchain/langgraph-checkpoint-redis/shallow' {
    import { BaseCheckpointSaver } from '@langchain/langgraph-checkpoint';

    export class ShallowRedisSaver extends BaseCheckpointSaver {
        constructor(client?: any, ttlConfig?: any);
        static fromUrl(url: string, ttlConfig?: any): Promise<ShallowRedisSaver>;
        getTuple(config: any): Promise<any>;
        put(config: any, checkpoint: any, metadata: any, newVersions: any): Promise<any>;
        putWrites(config: any, writes: any, taskId: any): Promise<void>;
        deleteThread(threadId: string): Promise<void>;
        end(): Promise<void>;
    }
}

declare module '@bull-board/api' {
    export function createBullBoard(options: { queues: any[]; serverAdapter: any }): void;
}

declare module '@bull-board/api/bullMQAdapter' {
    export class BullMQAdapter {
        constructor(queue: any);
    }
}

declare module '@bull-board/express' {
    import type { Router } from 'express';

    export class ExpressAdapter {
        setBasePath(path: string): void;
        getRouter(): Router;
    }
}

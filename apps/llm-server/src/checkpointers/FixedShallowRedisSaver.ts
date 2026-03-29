import { ShallowRedisSaver } from '@langchain/langgraph-checkpoint-redis/shallow';

/**
 * Wraps ShallowRedisSaver to fix async durability issues with interrupt/resume.
 *
 * Problem: LangGraph's default "async" durability mode fires checkpointer.put()
 * and checkpointer.putWrites() as independent, un-awaited promises. Interrupt
 * writes may not be flushed to Redis before the next getState() call, causing
 * the graph to see next=[] and fall into the "already complete" branch.
 *
 * Fix: Chain all put/putWrites operations through a serial promise. Before reading
 * state in getTuple, await all pending operations. Always load pending writes
 * regardless of the has_writes flag.
 *
 * See ADR-009 for full root cause analysis.
 */
export class FixedShallowRedisSaver extends ShallowRedisSaver {
    private _opChain: Promise<any> = Promise.resolve();

    static async create(url: string, ttlConfig?: any): Promise<FixedShallowRedisSaver> {
        const parent = await ShallowRedisSaver.fromUrl(url, ttlConfig);
        const fixed = new FixedShallowRedisSaver((parent as any).client, (parent as any).ttlConfig);
        return fixed;
    }

    async put(config: any, checkpoint: any, metadata: any, newVersions: any): Promise<any> {
        const result = this._opChain.then(() =>
            super.put(config, checkpoint, metadata, newVersions)
        );
        this._opChain = result.catch(() => {});
        return result;
    }

    async putWrites(config: any, writes: any, taskId: any): Promise<void> {
        const result = this._opChain.then(() =>
            super.putWrites(config, writes, taskId)
        );
        this._opChain = result.catch(() => {});
        return result;
    }

    async getTuple(config: any): Promise<any> {
        // Wait for ALL pending put/putWrites to complete before reading
        await this._opChain;

        const threadId = config.configurable?.thread_id;
        const checkpointNs = config.configurable?.checkpoint_ns ?? '';
        const checkpointId = config.configurable?.checkpoint_id;

        if (!threadId) return undefined;

        const key = `checkpoint:${threadId}:${checkpointNs}:shallow`;
        const jsonDoc = await (this as any).client.json.get(key);
        if (!jsonDoc) return undefined;
        if (checkpointId && jsonDoc.checkpoint_id !== checkpointId) return undefined;

        if ((this as any).ttlConfig?.refreshOnRead && (this as any).ttlConfig?.defaultTTL) {
            await (this as any).applyTTL(key);
        }

        const checkpoint = await (this as any).serde.loadsTyped('json', JSON.stringify(jsonDoc.checkpoint));

        // Always try to load pending writes regardless of has_writes flag
        const pendingWrites = await (this as any).loadPendingWrites(
            jsonDoc.thread_id,
            jsonDoc.checkpoint_ns,
            jsonDoc.checkpoint_id
        );
        
        return await (this as any).createCheckpointTuple(jsonDoc, checkpoint, pendingWrites);
    }
}

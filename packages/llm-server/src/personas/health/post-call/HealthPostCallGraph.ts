import { StateGraph, END } from '@langchain/langgraph';
import { HealthRepository } from '@naiber/shared-data';
import { HealthPostCallState, HealthPostCallStateType } from './HealthPostCallState.js';

export class HealthPostCallGraph {
    private compiledGraph: any;

    constructor() {
        const graph: any = new StateGraph(HealthPostCallState);

        graph.addNode('persist_log', this.persistLog.bind(this));
        graph.setEntryPoint('persist_log');
        graph.addEdge('persist_log', END);

        this.compiledGraph = graph.compile();
    }

    private async persistLog(state: HealthPostCallStateType) {
        try {
            await HealthRepository.createHealthCheckLog({
                userId: state.userId,
                conversationId: state.conversationId,
                answers: state.answers
            });

            console.log('[HealthPostCallGraph] Health check log persisted:', {
                userId: state.userId,
                conversationId: state.conversationId,
                answersCount: state.answers.length
            });

            return {};
        } catch (err: any) {
            console.error('[HealthPostCallGraph] Failed to persist health check log:', err);
            return { error: err.message ?? 'Unknown error' };
        }
    }

    compile() {
        return this.compiledGraph;
    }
}

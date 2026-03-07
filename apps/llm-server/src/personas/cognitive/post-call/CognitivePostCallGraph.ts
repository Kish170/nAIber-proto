import { StateGraph, END } from '@langchain/langgraph';
import { CognitivePostCallState, CognitivePostCallStateType } from './CognitivePostCallState.js';
import { CognitiveRepository } from '@naiber/shared-data';
import {
    computeDomainScores,
    computeStabilityIndex,
    computeFluencyPersonalBest,
    computeBaselineUpdate,
    detectDrift,
} from '../scoring/ScoringEngine.js';

export class CognitivePostCallGraph {
    private compiledGraph: any;

    constructor() {
        const graph: any = new StateGraph(CognitivePostCallState);

        graph.addNode('compute_scores', this.computeScores.bind(this));
        graph.addNode('persist_results', this.persistResults.bind(this));
        graph.addNode('update_baseline', this.updateBaseline.bind(this));
        graph.addNode('check_drift', this.checkDrift.bind(this));

        graph.setEntryPoint('compute_scores');
        graph.addEdge('compute_scores', 'persist_results');
        graph.addEdge('persist_results', 'update_baseline');
        graph.addEdge('update_baseline', 'check_drift');
        graph.addEdge('check_drift', END);

        this.compiledGraph = graph.compile();
    }

    private async computeScores(state: CognitivePostCallStateType) {
        try {
            if (state.isDeferred) {
                console.log('[CognitivePostCall] Deferred session — skipping scoring');
                return {};
            }

            const previousResults = await CognitiveRepository.findRecentCompletedResults(state.userId, 5);
            const fluencyPersonalBest = computeFluencyPersonalBest(previousResults);
            const domainScores = computeDomainScores(state.taskResponses, fluencyPersonalBest);
            const stabilityIndex = computeStabilityIndex(domainScores, state.registrationQuality);

            console.log('[CognitivePostCall] Computed scores:', {
                stabilityIndex,
                orientation: domainScores.orientation.normalized,
                attention: domainScores.attentionConcentration.normalized,
                workingMemory: domainScores.workingMemory.normalized,
                delayedRecall: domainScores.delayedRecall.normalized,
                fluency: domainScores.languageVerbalFluency?.normalized ?? 'N/A',
                abstraction: domainScores.abstractionReasoning.normalized,
            });

            (this as any)._domainScores = domainScores;
            (this as any)._stabilityIndex = stabilityIndex;

            return {};
        } catch (err: any) {
            console.error('[CognitivePostCall] Score computation failed:', err);
            return { error: err.message ?? 'Score computation failed' };
        }
    }

    private async persistResults(state: CognitivePostCallStateType) {
        try {
            const domainScores = (this as any)._domainScores;
            const stabilityIndex = (this as any)._stabilityIndex;

            await CognitiveRepository.createTestResult({
                elderlyProfileId: state.userId,
                conversationId: state.conversationId,
                source: 'voice',
                modality: 'phone',
                sessionIndex: state.sessionIndex,
                wordListUsed: state.selectedWordList,
                digitSetUsed: state.selectedDigitSet,
                letterUsed: state.selectedLetter,
                abstractionSetUsed: state.selectedAbstractionSet,
                vigilanceSetUsed: state.selectedVigilanceSet,
                domainScores: domainScores ?? {},
                taskResponses: state.taskResponses,
                stabilityIndex: state.isDeferred ? undefined : (stabilityIndex ?? undefined),
                isPartial: state.isPartial,
                wellbeingCheckResponses: state.wellbeingResponses,
                distressDetected: state.distressDetected,
                deferralReason: state.isDeferred ? state.deferralReason : undefined,
            });

            console.log('[CognitivePostCall] Test result persisted for user:', state.userId);
            return {};
        } catch (err: any) {
            console.error('[CognitivePostCall] Failed to persist test result:', err);
            return { error: err.message ?? 'Persistence failed' };
        }
    }

    private async updateBaseline(state: CognitivePostCallStateType) {
        try {
            if (state.isDeferred || state.isPartial) {
                console.log('[CognitivePostCall] Skipping baseline update — deferred or partial session');
                return {};
            }

            const domainScores = (this as any)._domainScores;
            if (!domainScores) return {};

            const currentBaseline = await CognitiveRepository.getLatestBaseline(state.userId);
            const currentVector = currentBaseline?.featureVector as Record<string, number> | null;
            const currentVersion = currentBaseline?.version ?? 0;

            const newVector = computeBaselineUpdate(currentVector, domainScores);

            await CognitiveRepository.createBaseline({
                elderlyProfileId: state.userId,
                featureVector: newVector,
                rawValues: domainScores,
                domainBaselines: newVector,
                version: currentVersion + 1,
            });

            console.log('[CognitivePostCall] Baseline updated to version:', currentVersion + 1);
            return {};
        } catch (err: any) {
            console.error('[CognitivePostCall] Baseline update failed:', err);
            return { error: err.message ?? 'Baseline update failed' };
        }
    }

    private async checkDrift(state: CognitivePostCallStateType) {
        try {
            if (state.isDeferred || state.isPartial) {
                console.log('[CognitivePostCall] Skipping drift check — deferred or partial session');
                return {};
            }

            const recentResults = await CognitiveRepository.findRecentCompletedResults(state.userId, 3);
            const drift = detectDrift(recentResults, 3);

            if (drift) {
                console.log('[CognitivePostCall] Drift detection result:', {
                    category: drift.category,
                    rollingMean: drift.rollingMean.toFixed(3),
                    userId: state.userId,
                });

                if (drift.category === 'notable' || drift.category === 'significant') {
                    // TODO: Phase 3 — trigger notification to trusted contacts / dashboard alert
                    console.log(`[CognitivePostCall] ACTION NEEDED: ${drift.category} drift detected for user ${state.userId}`);
                }
            }

            return {};
        } catch (err: any) {
            console.error('[CognitivePostCall] Drift check failed:', err);
            return { error: err.message ?? 'Drift check failed' };
        }
    }

    compile() {
        return this.compiledGraph;
    }
}
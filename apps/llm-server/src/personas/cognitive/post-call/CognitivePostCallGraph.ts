import { StateGraph, END } from '@langchain/langgraph';
import { CognitivePostCallState, CognitivePostCallStateType } from './CognitivePostCallState.js';
import { CognitiveRepository, TrustedContactRepository, UserRepository } from '@naiber/shared-data';
import {
    computeDomainScores,
    computeStabilityIndex,
    computeFluencyPersonalBest,
    detectDrift,
    interpretDomainScores,
    computeFirstCallWeight,
    computeWeightedBaseline,
    DomainScores,
} from '../scoring/ScoringEngine.js';

const BASELINE_CALL_TARGET = 3;

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

            // C1: Compute demographic-adjusted interpretation thresholds
            const profile = await UserRepository.findById(state.userId);
            const demographicInterpretation = interpretDomainScores(
                domainScores,
                profile?.age ?? null,
                profile?.educationLevel ?? null,
            );

            console.log('[CognitivePostCall] Computed scores:', {
                stabilityIndex,
                orientation: domainScores.orientation.normalized,
                attention: domainScores.attentionConcentration.normalized,
                workingMemory: domainScores.workingMemory.normalized,
                delayedRecall: domainScores.delayedRecall.normalized,
                fluency: domainScores.languageVerbalFluency?.normalized ?? 'N/A',
                abstraction: domainScores.abstractionReasoning.normalized,
                demographicInterpretation,
            });

            return { domainScores, stabilityIndex, demographicInterpretation };
        } catch (err: any) {
            console.error('[CognitivePostCall] Score computation failed:', err);
            return { error: err.message ?? 'Score computation failed' };
        }
    }

    private async persistResults(state: CognitivePostCallStateType) {
        try {
            const { domainScores, stabilityIndex } = state;

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

            const { domainScores } = state;
            if (!domainScores) return {};

            const currentBaseline = await CognitiveRepository.getLatestBaseline(state.userId);

            if (currentBaseline?.baselineLocked) {
                console.log('[CognitivePostCall] Baseline locked — skipping update');
                return {};
            }

            const callsIncludedPrev = currentBaseline?.callsIncluded ?? 0;
            const callsIncluded = callsIncludedPrev + 1;

            const primaryContact = await TrustedContactRepository.findPrimaryContact(state.userId);
            const w1 = computeFirstCallWeight(primaryContact?.weightedInformantIndex ?? null);

            // Incremental weighted mean: new_vector[d] = (prev[d] * prevTotalWeight + new[d] * wNew) / (prevTotalWeight + wNew)
            // w1 applies only to call 1; calls 2+ have weight 1.0
            // total_weight_prev = w1 + max(0, callsIncludedPrev - 1)
            const wNew = callsIncluded === 1 ? w1 : 1.0;
            const prevTotalWeight = callsIncludedPrev === 0 ? 0 : w1 + Math.max(0, callsIncludedPrev - 1);
            const newTotalWeight = prevTotalWeight + wNew;

            const prevVector = (currentBaseline?.featureVector ?? null) as Record<string, number> | null;
            const currentNormalized = extractNormalizedScores(domainScores);

            const newVector: Record<string, number> = {};
            const allDomains = new Set([
                ...Object.keys(currentNormalized),
                ...(prevVector ? Object.keys(prevVector) : []),
            ]);
            for (const domain of allDomains) {
                const prevVal = prevVector?.[domain] ?? 0;
                const newVal = currentNormalized[domain] ?? 0;
                newVector[domain] = prevTotalWeight === 0
                    ? newVal
                    : (prevVal * prevTotalWeight + newVal * wNew) / newTotalWeight;
            }

            const shouldLock = callsIncluded >= BASELINE_CALL_TARGET;

            await CognitiveRepository.createBaseline({
                elderlyProfileId: state.userId,
                featureVector: newVector,
                rawValues: domainScores,
                domainBaselines: newVector,
                version: (currentBaseline?.version ?? 0) + 1,
                callsIncluded,
                baselineLocked: shouldLock,
            });

            console.log('[CognitivePostCall] Baseline updated:', {
                version: (currentBaseline?.version ?? 0) + 1,
                callsIncluded,
                baselineLocked: shouldLock,
                w1,
                wNew,
            });
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

function extractNormalizedScores(domainScores: DomainScores): Record<string, number> {
    const out: Record<string, number> = {
        orientation: domainScores.orientation.normalized,
        attentionConcentration: domainScores.attentionConcentration.normalized,
        workingMemory: domainScores.workingMemory.normalized,
        delayedRecall: domainScores.delayedRecall.normalized,
        abstractionReasoning: domainScores.abstractionReasoning.normalized,
    };
    if (domainScores.languageVerbalFluency) {
        out.languageVerbalFluency = domainScores.languageVerbalFluency.normalized;
    }
    return out;
}
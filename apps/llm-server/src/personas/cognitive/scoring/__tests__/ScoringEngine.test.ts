import { describe, it, expect } from 'vitest';
import {
    computeFirstCallWeight,
    computeWeightedBaseline,
    interpretDomainScores,
} from '../ScoringEngine.js';
import type { DomainScores } from '../ScoringEngine.js';

// ─── computeFirstCallWeight ───────────────────────────────────────────────────

describe('computeFirstCallWeight', () => {
    it('returns 0.75 for null (no-data fallback)', () => {
        expect(computeFirstCallWeight(null)).toBe(0.75);
    });

    it('returns 0.75 for undefined (no-data fallback)', () => {
        expect(computeFirstCallWeight(undefined)).toBe(0.75);
    });

    it('returns 0.5 for index < 0.3', () => {
        expect(computeFirstCallWeight(0.0)).toBe(0.5);
        expect(computeFirstCallWeight(0.1)).toBe(0.5);
        expect(computeFirstCallWeight(0.29)).toBe(0.5);
    });

    it('returns 0.75 for index exactly 0.3 (lower boundary of mid-band)', () => {
        expect(computeFirstCallWeight(0.3)).toBe(0.75);
    });

    it('returns 0.75 for mid-band values', () => {
        expect(computeFirstCallWeight(0.5)).toBe(0.75);
        expect(computeFirstCallWeight(0.69)).toBe(0.75);
    });

    it('returns 1.0 for index exactly 0.7 (lower boundary of high band)', () => {
        expect(computeFirstCallWeight(0.7)).toBe(1.0);
    });

    it('returns 1.0 for index >= 0.7', () => {
        expect(computeFirstCallWeight(0.8)).toBe(1.0);
        expect(computeFirstCallWeight(1.0)).toBe(1.0);
    });
});

// ─── computeWeightedBaseline ──────────────────────────────────────────────────

describe('computeWeightedBaseline', () => {
    it('single session — returns its scores unchanged', () => {
        const result = computeWeightedBaseline([
            { domainScores: { orientation: 0.8, delayedRecall: 0.6 }, weight: 0.5 },
        ]);
        expect(result.orientation).toBeCloseTo(0.8);
        expect(result.delayedRecall).toBeCloseTo(0.6);
    });

    it('two sessions with equal weights — returns simple mean', () => {
        const result = computeWeightedBaseline([
            { domainScores: { orientation: 1.0 }, weight: 1.0 },
            { domainScores: { orientation: 0.6 }, weight: 1.0 },
        ]);
        expect(result.orientation).toBeCloseTo(0.8);
    });

    it('two sessions with unequal weights — first session downweighted by 0.5', () => {
        // w1=0.5, w2=1.0 → (0.5*1.0 + 1.0*0.4) / (0.5+1.0) = 0.9/1.5 = 0.6
        const result = computeWeightedBaseline([
            { domainScores: { delayedRecall: 1.0 }, weight: 0.5 },
            { domainScores: { delayedRecall: 0.4 }, weight: 1.0 },
        ]);
        expect(result.delayedRecall).toBeCloseTo(0.6);
    });

    it('domain missing in one session — only uses sessions that have it', () => {
        const result = computeWeightedBaseline([
            { domainScores: { orientation: 0.8, workingMemory: 0.7 }, weight: 1.0 },
            { domainScores: { orientation: 0.6 }, weight: 1.0 },
        ]);
        expect(result.orientation).toBeCloseTo(0.7);
        expect(result.workingMemory).toBeCloseTo(0.7);
    });
});

// ─── interpretDomainScores ────────────────────────────────────────────────────

function makeDomainScores(delayedRecallNorm: number, fluencyRaw: number | null): DomainScores {
    return {
        orientation: { domain: 'ORIENTATION' as any, rawScore: 5, maxScore: 5, normalized: 1 },
        attentionConcentration: { domain: 'ATTENTION_CONCENTRATION' as any, rawScore: 14, maxScore: 16, normalized: 0.875 },
        workingMemory: { domain: 'WORKING_MEMORY' as any, rawScore: 3, maxScore: 4, normalized: 0.75 },
        delayedRecall: { domain: 'DELAYED_RECALL' as any, rawScore: Math.round(delayedRecallNorm * 10), maxScore: 10, normalized: delayedRecallNorm },
        languageVerbalFluency: fluencyRaw !== null
            ? { domain: 'LANGUAGE_VERBAL_FLUENCY' as any, rawScore: fluencyRaw, maxScore: fluencyRaw, normalized: 1 }
            : null,
        abstractionReasoning: { domain: 'ABSTRACTION_REASONING' as any, rawScore: 3, maxScore: 4, normalized: 0.75 },
    };
}

describe('interpretDomainScores', () => {
    it('65-year-old post-secondary scoring 0.70 on delayed recall — within expected', () => {
        const scores = makeDomainScores(0.70, null);
        const result = interpretDomainScores(scores, 65, 'BACHELORS_OR_EQUIVALENT');
        expect(result.delayedRecall.withinExpected).toBe(true);
        expect(result.delayedRecall.adjustmentFactor).toBe(1.0);
    });

    it('65-year-old post-secondary scoring 0.60 on delayed recall — below expected (threshold 0.70)', () => {
        const scores = makeDomainScores(0.60, null);
        const result = interpretDomainScores(scores, 65, 'BACHELORS_OR_EQUIVALENT');
        expect(result.delayedRecall.withinExpected).toBe(false);
    });

    it('75-year-old primary education scoring 0.50 on delayed recall — within expected (threshold 0.40)', () => {
        const scores = makeDomainScores(0.50, null);
        const result = interpretDomainScores(scores, 75, 'PRIMARY_OR_ELEMENTARY');
        expect(result.delayedRecall.withinExpected).toBe(true);
        expect(result.delayedRecall.adjustmentFactor).toBe(0.85);
    });

    it('null age and education — falls back to 60-69 post-secondary thresholds', () => {
        const scores = makeDomainScores(0.70, null);
        const result = interpretDomainScores(scores, null, null);
        expect(result.delayedRecall.expectedRangeLow).toBe(0.70);
        expect(result.delayedRecall.adjustmentFactor).toBe(1.0);
    });

    it('fluency raw score within expected range — withinExpected true', () => {
        const scores = makeDomainScores(0.80, 15);
        const result = interpretDomainScores(scores, 65, 'BACHELORS_OR_EQUIVALENT');
        expect(result.letterFluency.withinExpected).toBe(true);
        expect(result.letterFluency.expectedCountLow).toBe(14);
    });

    it('fluency raw score below expected range — withinExpected false', () => {
        const scores = makeDomainScores(0.80, 10);
        const result = interpretDomainScores(scores, 65, 'BACHELORS_OR_EQUIVALENT');
        expect(result.letterFluency.withinExpected).toBe(false);
    });

    it('no fluency score yet — withinExpected is null', () => {
        const scores = makeDomainScores(0.80, null);
        const result = interpretDomainScores(scores, 65, 'BACHELORS_OR_EQUIVALENT');
        expect(result.letterFluency.withinExpected).toBeNull();
    });
});

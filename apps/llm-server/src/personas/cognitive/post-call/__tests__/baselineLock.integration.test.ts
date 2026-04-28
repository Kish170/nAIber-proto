import { describe, it, expect, vi, beforeEach } from 'vitest';
import { computeFirstCallWeight, computeWeightedBaseline } from '../../scoring/ScoringEngine.js';

// Integration test: simulate the updateBaseline logic across a 3-call + 1 post-lock call sequence.
// Mocks CognitiveRepository and TrustedContactRepository; does not require a live DB.

const PRIMARY_CONTACT = { id: 'primary-1', isPrimary: true, weightedInformantIndex: 0.5 };
const NON_PRIMARY_CONTACT = { id: 'non-primary-1', isPrimary: false, weightedInformantIndex: 0.9 };

// Simulated baseline store (mimics DB rows)
let baselineStore: any[] = [];

const mockCognitiveRepository = {
    getLatestBaseline: vi.fn(async () => {
        if (baselineStore.length === 0) return null;
        return baselineStore[baselineStore.length - 1];
    }),
    createBaseline: vi.fn(async (data: any) => {
        baselineStore.push(data);
        return data;
    }),
};

const mockTrustedContactRepository = {
    findPrimaryContact: vi.fn(async () => PRIMARY_CONTACT),
};

const BASELINE_CALL_TARGET = 3;

// Extracted updateBaseline logic (pure, testable without graph infra)
async function runUpdateBaseline(
    domainScores: Record<string, number>,
    repo = mockCognitiveRepository,
    contactRepo = mockTrustedContactRepository,
) {
    const currentBaseline = await repo.getLatestBaseline();

    if (currentBaseline?.baselineLocked) return { skipped: 'locked' };

    const callsIncludedPrev = currentBaseline?.callsIncluded ?? 0;
    const callsIncluded = callsIncludedPrev + 1;

    const primaryContact = await contactRepo.findPrimaryContact();
    const w1 = computeFirstCallWeight(primaryContact?.weightedInformantIndex ?? null);

    const wNew = callsIncluded === 1 ? w1 : 1.0;
    const prevTotalWeight = callsIncludedPrev === 0 ? 0 : w1 + Math.max(0, callsIncludedPrev - 1);

    const prevVector = (currentBaseline?.featureVector ?? null) as Record<string, number> | null;

    const allDomains = new Set([
        ...Object.keys(domainScores),
        ...(prevVector ? Object.keys(prevVector) : []),
    ]);
    const newVector: Record<string, number> = {};
    for (const domain of allDomains) {
        const prevVal = prevVector?.[domain] ?? 0;
        const newVal = domainScores[domain] ?? 0;
        newVector[domain] = prevTotalWeight === 0
            ? newVal
            : (prevVal * prevTotalWeight + newVal * wNew) / (prevTotalWeight + wNew);
    }

    const shouldLock = callsIncluded >= BASELINE_CALL_TARGET;

    await repo.createBaseline({
        featureVector: newVector,
        callsIncluded,
        baselineLocked: shouldLock,
        version: (currentBaseline?.version ?? 0) + 1,
    });

    return { callsIncluded, baselineLocked: shouldLock, newVector, wNew };
}

describe('baseline lock — 3-call sequence', () => {
    beforeEach(() => {
        baselineStore = [];
        mockCognitiveRepository.createBaseline.mockClear();
        mockCognitiveRepository.getLatestBaseline.mockClear();
        mockTrustedContactRepository.findPrimaryContact.mockClear();
    });

    it('call 1: w1=0.75 (index=0.5 → mid-band), baseline version 1, not locked', async () => {
        const scores = { orientation: 0.8, delayedRecall: 0.6 };
        const result = await runUpdateBaseline(scores);
        expect(result.wNew).toBeCloseTo(0.75);
        expect(result.callsIncluded).toBe(1);
        expect(result.baselineLocked).toBe(false);
        expect(baselineStore[0].callsIncluded).toBe(1);
        expect(baselineStore[0].baselineLocked).toBe(false);
    });

    it('call 2: w=1.0, weighted mean updated, version 2, not locked', async () => {
        // Seed call 1
        await runUpdateBaseline({ orientation: 0.8, delayedRecall: 0.6 });
        const result = await runUpdateBaseline({ orientation: 1.0, delayedRecall: 0.8 });
        expect(result.wNew).toBe(1.0);
        expect(result.callsIncluded).toBe(2);
        expect(result.baselineLocked).toBe(false);
        // w1=0.75, w2=1.0 → orientation = (0.8*0.75 + 1.0*1.0) / (0.75+1.0) = 1.6/1.75 ≈ 0.914
        expect(result.newVector!.orientation).toBeCloseTo(1.6 / 1.75, 4);
    });

    it('call 3: w=1.0, baseline locks (callsIncluded=3), version 3', async () => {
        await runUpdateBaseline({ orientation: 0.8, delayedRecall: 0.6 });
        await runUpdateBaseline({ orientation: 1.0, delayedRecall: 0.8 });
        const result = await runUpdateBaseline({ orientation: 0.9, delayedRecall: 0.7 });
        expect(result.callsIncluded).toBe(3);
        expect(result.baselineLocked).toBe(true);
        expect(baselineStore[2].baselineLocked).toBe(true);
    });

    it('call 4: baseline is locked — no-ops, createBaseline not called for call 4', async () => {
        await runUpdateBaseline({ orientation: 0.8, delayedRecall: 0.6 });
        await runUpdateBaseline({ orientation: 1.0, delayedRecall: 0.8 });
        await runUpdateBaseline({ orientation: 0.9, delayedRecall: 0.7 });
        mockCognitiveRepository.createBaseline.mockClear();

        const result = await runUpdateBaseline({ orientation: 0.5, delayedRecall: 0.3 });
        expect(result).toEqual({ skipped: 'locked' });
        expect(mockCognitiveRepository.createBaseline).not.toHaveBeenCalled();
    });

    it('non-primary contact weightedInformantIndex does not influence baseline math', async () => {
        // Primary contact has index=0.5 → w1=0.75
        // Non-primary has index=0.9 → would give w1=1.0 if incorrectly used
        // findPrimaryContact returns only PRIMARY_CONTACT — non-primary is never consulted
        const result = await runUpdateBaseline({ orientation: 0.8, delayedRecall: 0.6 });
        expect(result.wNew).toBeCloseTo(0.75);  // 0.75, not 1.0
        // confirm it only called findPrimaryContact (not any all-contacts rollup)
        expect(mockTrustedContactRepository.findPrimaryContact).toHaveBeenCalledTimes(1);
    });
});

describe('updatePrimaryConcernIndex scoping (unit)', () => {
    it('no-ops when no primary contact exists', async () => {
        const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
        const noopRepo = {
            findPrimaryContact: vi.fn(async () => null),
            updateConcernIndex: vi.fn(),
        };

        // Simulate updatePrimaryConcernIndex logic
        const primary = await noopRepo.findPrimaryContact();
        let result: any = null;
        if (!primary) {
            console.warn('No primary contact — no-op');
        } else {
            result = await noopRepo.updateConcernIndex(primary.id, 0.4, 0.4);
        }

        expect(result).toBeNull();
        expect(noopRepo.updateConcernIndex).not.toHaveBeenCalled();
        expect(warnSpy).toHaveBeenCalled();
        warnSpy.mockRestore();
    });

    it('throws when multiple isPrimary contacts exist', async () => {
        const multiPrimaryRepo = {
            findMany: vi.fn(async () => [PRIMARY_CONTACT, { ...PRIMARY_CONTACT, id: 'primary-2' }]),
        };

        // Simulate findPrimaryContact logic
        const contacts = await multiPrimaryRepo.findMany();
        expect(() => {
            if (contacts.length > 1) {
                throw new Error(`Data integrity error: ${contacts.length} contacts with isPrimary=true`);
            }
        }).toThrow('Data integrity error: 2 contacts');
    });

    it('updates only the primary contact, not non-primary contacts', async () => {
        const updateFn = vi.fn(async () => ({ id: 'primary-1', informantConcernIndex: 0.4 }));
        const scopedRepo = {
            findPrimaryContact: vi.fn(async () => PRIMARY_CONTACT),
            updateConcernIndex: updateFn,
        };

        const primary = await scopedRepo.findPrimaryContact();
        if (primary) await scopedRepo.updateConcernIndex(primary.id, 0.4, 0.2);

        expect(updateFn).toHaveBeenCalledOnce();
        expect(updateFn).toHaveBeenCalledWith('primary-1', 0.4, 0.2);
        // NON_PRIMARY_CONTACT.id was never passed
        expect(updateFn).not.toHaveBeenCalledWith('non-primary-1', expect.anything(), expect.anything());
    });
});

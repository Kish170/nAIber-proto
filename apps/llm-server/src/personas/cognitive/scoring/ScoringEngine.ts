import {
    CognitiveTaskType,
    CognitiveDomain,
    TaskResponse,
} from '../tasks/TaskDefinitions.js';

export interface DomainScore {
    domain: CognitiveDomain;
    rawScore: number;
    maxScore: number;
    normalized: number; 
}

export interface DomainScores {
    orientation: DomainScore;
    attentionConcentration: DomainScore;
    workingMemory: DomainScore;
    delayedRecall: DomainScore;
    languageVerbalFluency: DomainScore | null; // null until 3+ sessions for self-relative
    abstractionReasoning: DomainScore;
}

export interface StabilityResult {
    stabilityIndex: number;
    domainScores: DomainScores;
}

export interface DriftResult {
    category: 'stable' | 'monitor' | 'notable' | 'significant';
    rollingMean: number;
    threshold: number;
}

const DOMAIN_WEIGHTS: Record<string, number> = {
    [CognitiveDomain.DELAYED_RECALL]: 0.30,
    [CognitiveDomain.ATTENTION_CONCENTRATION]: 0.20,
    [CognitiveDomain.WORKING_MEMORY]: 0.15,
    [CognitiveDomain.LANGUAGE_VERBAL_FLUENCY]: 0.15,
    [CognitiveDomain.ABSTRACTION_REASONING]: 0.10,
    [CognitiveDomain.ORIENTATION]: 0.10,
};

function sumByTask(responses: TaskResponse[], ...types: CognitiveTaskType[]): { raw: number; max: number } {
    let raw = 0;
    let max = 0;
    for (const r of responses) {
        if (types.includes(r.taskType)) {
            if (r.skipped && r.skipReason === 'refused') continue;
            raw += r.rawScore;
            if (r.maxScore !== null) max += r.maxScore;
        }
    }
    return { raw, max };
}

export function computeDomainScores(
    taskResponses: TaskResponse[],
    fluencyPersonalBest: number | null,
): DomainScores {
    const orientation = sumByTask(taskResponses, CognitiveTaskType.ORIENTATION);

    const attention = sumByTask(
        taskResponses,
        CognitiveTaskType.DIGIT_SPAN_FORWARD,
        CognitiveTaskType.SERIAL_7S,
        CognitiveTaskType.LETTER_VIGILANCE,
    );

    const workingMemory = sumByTask(taskResponses, CognitiveTaskType.DIGIT_SPAN_REVERSE);

    const delayedRecall = sumByTask(taskResponses, CognitiveTaskType.DELAYED_RECALL);

    const abstraction = sumByTask(taskResponses, CognitiveTaskType.ABSTRACTION);

    const fluencyResponse = taskResponses.find(r => r.taskType === CognitiveTaskType.LETTER_FLUENCY);
    let languageVerbalFluency: DomainScore | null = null;

    if (fluencyResponse && fluencyPersonalBest !== null && fluencyPersonalBest > 0) {
        const normalized = Math.min(1, fluencyResponse.rawScore / fluencyPersonalBest);
        languageVerbalFluency = {
            domain: CognitiveDomain.LANGUAGE_VERBAL_FLUENCY,
            rawScore: fluencyResponse.rawScore,
            maxScore: fluencyPersonalBest,
            normalized,
        };
    }

    const norm = (raw: number, max: number) => max > 0 ? raw / max : 0;

    return {
        orientation: {
            domain: CognitiveDomain.ORIENTATION,
            rawScore: orientation.raw,
            maxScore: orientation.max || 5,
            normalized: norm(orientation.raw, orientation.max || 5),
        },
        attentionConcentration: {
            domain: CognitiveDomain.ATTENTION_CONCENTRATION,
            rawScore: attention.raw,
            maxScore: attention.max || 16,
            normalized: norm(attention.raw, attention.max || 16),
        },
        workingMemory: {
            domain: CognitiveDomain.WORKING_MEMORY,
            rawScore: workingMemory.raw,
            maxScore: workingMemory.max || 4,
            normalized: norm(workingMemory.raw, workingMemory.max || 4),
        },
        delayedRecall: {
            domain: CognitiveDomain.DELAYED_RECALL,
            rawScore: delayedRecall.raw,
            maxScore: delayedRecall.max || 10,
            normalized: norm(delayedRecall.raw, delayedRecall.max || 10),
        },
        languageVerbalFluency,
        abstractionReasoning: {
            domain: CognitiveDomain.ABSTRACTION_REASONING,
            rawScore: abstraction.raw,
            maxScore: abstraction.max || 4,
            normalized: norm(abstraction.raw, abstraction.max || 4),
        },
    };
}

export function computeStabilityIndex(
    domainScores: DomainScores,
    registrationQuality: string,
): number {
    const entries: { domain: CognitiveDomain; normalized: number }[] = [];

    entries.push({ domain: CognitiveDomain.ORIENTATION, normalized: domainScores.orientation.normalized });
    entries.push({ domain: CognitiveDomain.ATTENTION_CONCENTRATION, normalized: domainScores.attentionConcentration.normalized });
    entries.push({ domain: CognitiveDomain.WORKING_MEMORY, normalized: domainScores.workingMemory.normalized });
    entries.push({ domain: CognitiveDomain.DELAYED_RECALL, normalized: domainScores.delayedRecall.normalized });
    entries.push({ domain: CognitiveDomain.ABSTRACTION_REASONING, normalized: domainScores.abstractionReasoning.normalized });

    if (domainScores.languageVerbalFluency) {
        entries.push({ domain: CognitiveDomain.LANGUAGE_VERBAL_FLUENCY, normalized: domainScores.languageVerbalFluency.normalized });
    }

    const weights = { ...DOMAIN_WEIGHTS };

    if (!domainScores.languageVerbalFluency) {
        const fluencyWeight = weights[CognitiveDomain.LANGUAGE_VERBAL_FLUENCY];
        delete (weights as any)[CognitiveDomain.LANGUAGE_VERBAL_FLUENCY];
        const remaining = Object.values(weights).reduce((a, b) => a + b, 0);
        for (const key of Object.keys(weights) as CognitiveDomain[]) {
            weights[key] = weights[key] + (weights[key] / remaining) * fluencyWeight;
        }
    }

    if (registrationQuality === 'partial') {
        const drop = weights[CognitiveDomain.DELAYED_RECALL] - 0.15;
        weights[CognitiveDomain.DELAYED_RECALL] = 0.15;
        const othersSum = Object.entries(weights)
            .filter(([k]) => k !== CognitiveDomain.DELAYED_RECALL)
            .reduce((sum, [, v]) => sum + v, 0);
        for (const key of Object.keys(weights) as CognitiveDomain[]) {
            if (key !== CognitiveDomain.DELAYED_RECALL) {
                weights[key] = weights[key] + (weights[key] / othersSum) * drop;
            }
        }
    }

    let weightedSum = 0;
    let totalWeight = 0;
    for (const entry of entries) {
        const w = weights[entry.domain] ?? 0;
        weightedSum += entry.normalized * w;
        totalWeight += w;
    }

    return totalWeight > 0 ? weightedSum / totalWeight : 0;
}

export function computeFluencyPersonalBest(previousResults: any[]): number | null {
    if (previousResults.length < 2) return null; // need 3+ sessions (current + 2 prior)

    let best = 0;
    for (const result of previousResults) {
        const taskResponses: TaskResponse[] = result.taskResponses ?? [];
        const fluency = taskResponses.find((r: TaskResponse) => r.taskType === CognitiveTaskType.LETTER_FLUENCY);
        if (fluency && fluency.rawScore > best) {
            best = fluency.rawScore;
        }
    }
    return best > 0 ? best : null;
}

export function computeBaselineUpdate(
    currentBaseline: Record<string, number> | null,
    newDomainScores: DomainScores,
    alpha: number = 0.3,
): Record<string, number> {
    const newVector: Record<string, number> = {
        orientation: newDomainScores.orientation.normalized,
        attentionConcentration: newDomainScores.attentionConcentration.normalized,
        workingMemory: newDomainScores.workingMemory.normalized,
        delayedRecall: newDomainScores.delayedRecall.normalized,
        abstractionReasoning: newDomainScores.abstractionReasoning.normalized,
    };

    if (newDomainScores.languageVerbalFluency) {
        newVector.languageVerbalFluency = newDomainScores.languageVerbalFluency.normalized;
    }

    if (!currentBaseline) {
        return newVector;
    }

    const updated: Record<string, number> = {};
    for (const [key, value] of Object.entries(newVector)) {
        const prev = currentBaseline[key];
        if (prev !== undefined) {
            updated[key] = alpha * value + (1 - alpha) * prev;
        } else {
            updated[key] = value;
        }
    }

    return updated;
}

export function detectDrift(
    recentResults: any[],
    windowSize: number = 3,
): DriftResult | null {
    if (recentResults.length < windowSize) return null;

    const window = recentResults.slice(0, windowSize);
    const stabilityValues = window
        .map((r: any) => r.stabilityIndex as number | null)
        .filter((v: number | null): v is number => v !== null);

    if (stabilityValues.length === 0) return null;

    const rollingMean = stabilityValues.reduce((a: number, b: number) => a + b, 0) / stabilityValues.length;

    let category: DriftResult['category'];
    let threshold: number;

    if (rollingMean >= 0.80) {
        category = 'stable';
        threshold = 0.80;
    } else if (rollingMean >= 0.65) {
        category = 'monitor';
        threshold = 0.65;
    } else if (rollingMean >= 0.50) {
        category = 'notable';
        threshold = 0.50;
    } else {
        category = 'significant';
        threshold = 0.50;
    }

    return { category, rollingMean, threshold };
}
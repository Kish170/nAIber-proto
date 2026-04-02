import nlp from 'compromise';
import { ChatOpenAI } from "@langchain/openai";
import { SystemMessage } from "@langchain/core/messages";
import type { AbstractionPair, VigilanceSet } from "./ContentRotation.js";
import type { PerseverationSignals, RetrievalLevel } from "./TaskDefinitions.js";

export interface OrientationResult {
    score: number;
    maxScore: 5;
    details: {
        day: boolean;
        date: boolean;
        month: boolean;
        year: boolean;
        season: boolean;
    };
}

const SEASONS: Record<number, string[]> = {
    0: ['winter'],
    1: ['winter'],
    2: ['spring', 'winter'],
    3: ['spring'],
    4: ['spring'],
    5: ['summer', 'spring'],
    6: ['summer'],
    7: ['summer'],
    8: ['autumn', 'fall', 'summer'],
    9: ['autumn', 'fall'],
    10: ['autumn', 'fall'],
    11: ['winter', 'autumn', 'fall'],
};

const DAYS_OF_WEEK = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];
const MONTHS = ['january', 'february', 'march', 'april', 'may', 'june', 'july', 'august', 'september', 'october', 'november', 'december'];

export function validateOrientation(rawAnswer: string, currentDate: Date): OrientationResult {
    const lower = rawAnswer.toLowerCase();
    const now = currentDate;
    const doc = nlp(rawAnswer);

    const expectedDay = DAYS_OF_WEEK[now.getDay()];
    const expectedDate = now.getDate();
    const expectedMonth = MONTHS[now.getMonth()];
    const expectedYear = now.getFullYear();
    const acceptableSeasons = SEASONS[now.getMonth()] ?? [];

    const extractedNumbers = doc.numbers().out('array')
        .map((n: string) => parseInt(n.replace(/[^0-9]/g, ''), 10))
        .filter((n: number) => !isNaN(n));

    const dayCorrect = lower.includes(expectedDay);
    const dateCorrect = lower.includes(String(expectedDate)) || extractedNumbers.includes(expectedDate);
    const monthCorrect = lower.includes(expectedMonth);
    const yearCorrect = lower.includes(String(expectedYear)) || extractedNumbers.includes(expectedYear);
    const seasonCorrect = acceptableSeasons.some(s => lower.includes(s));

    const details = { day: dayCorrect, date: dateCorrect, month: monthCorrect, year: yearCorrect, season: seasonCorrect };
    const score = Object.values(details).filter(Boolean).length;

    return { score, maxScore: 5, details };
}

export interface RegistrationResult {
    registrationComplete: boolean;
    registrationQuality: 'complete' | 'partial';
    wordsRepeated: string[];
    wordsMissed: string[];
}

export function validateWordRegistration(rawAnswer: string, targetWords: string[]): RegistrationResult {
    const doc = nlp(rawAnswer);
    const extractedNouns = doc.nouns().out('array').map((w: string) => w.toLowerCase());
    const lower = rawAnswer.toLowerCase();

    const wordsRepeated: string[] = [];
    const wordsMissed: string[] = [];

    for (const word of targetWords) {
        const wordLower = word.toLowerCase();
        if (lower.includes(wordLower) || extractedNouns.includes(wordLower)) {
            wordsRepeated.push(word);
        } else {
            wordsMissed.push(word);
        }
    }

    const registrationComplete = wordsMissed.length === 0;
    const registrationQuality = registrationComplete ? 'complete' : 'partial';

    return { registrationComplete, registrationQuality, wordsRepeated, wordsMissed };
}

export function validateDigitSpan(rawAnswer: string, targetSequence: number[], isReverse: boolean): boolean {
    const expected = isReverse ? [...targetSequence].reverse() : targetSequence;

    const literalDigits = rawAnswer.match(/\d/g)?.map(Number) ?? [];
    if (literalDigits.length === expected.length) {
        return literalDigits.every((digit, i) => digit === expected[i]);
    }

    const doc = nlp(rawAnswer);
    const nlpNumbers = doc.numbers().out('array')
        .map((n: string) => parseInt(n.replace(/[^0-9]/g, ''), 10))
        .filter((n: number) => !isNaN(n) && n >= 0 && n <= 9);

    if (nlpNumbers.length !== expected.length) return false;
    return nlpNumbers.every((digit: number, i: number) => digit === expected[i]);
}

const COMPLETION_SIGNAL = /\b(done|finished|that'?s all|stop|can'?t think|no more|that'?s it|i'?m done|nothing else|that'?s everything)\b/i;

export function hasCompletionSignal(rawAnswer: string): boolean {
    return COMPLETION_SIGNAL.test(rawAnswer);
}

export interface Serial7sResult {
    score: number;
    maxScore: 5;
    responses: number[];
    correctFlags: boolean[];
    completionSignalPresent: boolean;
}

export function validateSerial7s(rawAnswer: string): Serial7sResult {
    const doc = nlp(rawAnswer);
    const nlpNumbers = doc.numbers().out('array')
        .map((n: string) => {
            const parsed = parseInt(n.replace(/[^0-9]/g, ''), 10);
            return isNaN(parsed) ? null : parsed;
        })
        .filter((n: number | null): n is number => n !== null);

    const regexNumbers = rawAnswer.match(/\d+/g)?.map(Number) ?? [];

    const numbers = nlpNumbers.length > 0 ? nlpNumbers : regexNumbers;

    const expected = [93, 86, 79, 72, 65];
    const correctFlags: boolean[] = [];

    for (let i = 0; i < 5; i++) {
        if (i < numbers.length) {
            if (i === 0) {
                correctFlags.push(numbers[i] === expected[i]);
            } else {
                // Errors don't cascade: if they said 86 instead of 93, then 86-7=79 is correct
                const previousAnswer = numbers[i - 1];
                const expectedFromPrevious = previousAnswer - 7;
                correctFlags.push(numbers[i] === expectedFromPrevious || numbers[i] === expected[i]);
            }
        } else {
            correctFlags.push(false);
        }
    }

    const score = correctFlags.filter(Boolean).length;
    return { score, maxScore: 5, responses: numbers.slice(0, 5), correctFlags, completionSignalPresent: hasCompletionSignal(rawAnswer) };
}

export interface WorldBackwardResult {
    score: number;
    maxScore: 5;
    response: string;
    correctPositions: boolean[];
}

export function validateWorldBackward(rawAnswer: string): WorldBackwardResult {
    const expected = ['D', 'L', 'R', 'O', 'W'];
    const letters = rawAnswer.toUpperCase().replace(/[^A-Z]/g, '').split('');
    const correctPositions: boolean[] = [];

    for (let i = 0; i < 5; i++) {
        correctPositions.push(i < letters.length && letters[i] === expected[i]);
    }

    const score = correctPositions.filter(Boolean).length;
    return { score, maxScore: 5, response: letters.join(''), correctPositions };
}

export interface VigilanceResult {
    score: number;
    maxScore: 6;
    confirmedCount: number | null;
    transcriptHits: number;
    transcriptFalsePositives: number;
}

export function validateLetterVigilance(
    transcriptResponses: string[],
    confirmedCount: number | null,
    vigilanceSet: VigilanceSet,
): VigilanceResult {
    const aPositions = new Set(vigilanceSet.aPositions);

    let transcriptHits = 0;
    let transcriptFalsePositives = 0;

    for (let i = 0; i < transcriptResponses.length; i++) {
        const responded = transcriptResponses[i]?.toLowerCase().includes('yes');
        if (responded) {
            if (aPositions.has(i)) {
                transcriptHits++;
            } else {
                transcriptFalsePositives++;
            }
        }
    }

    let score: number;
    if (confirmedCount !== null) {
        const actualACount = vigilanceSet.aPositions.length;
        const difference = Math.abs(confirmedCount - actualACount);
        score = Math.max(0, actualACount - difference - transcriptFalsePositives);
    } else {
        score = Math.max(0, transcriptHits - transcriptFalsePositives);
    }

    return { score, maxScore: 6, confirmedCount, transcriptHits, transcriptFalsePositives };
}

export interface FluencyResult {
    score: number;
    validWords: string[];
    repetitions: string[];
    properNouns: string[];
    totalProduced: number;
    perseverationSignals: PerseverationSignals;
    completionSignalPresent: boolean;
}

export function validateLetterFluency(rawAnswer: string, letter: string): FluencyResult {
    const targetLetter = letter.toLowerCase();
    const doc = nlp(rawAnswer);

    doc.remove('#Filler');
    const cleanedText = doc.text();

    const nlpProperNouns = new Set(
        nlp(rawAnswer).match('#ProperNoun').out('array').map((w: string) => w.toLowerCase())
    );

    const allWords = cleanedText
        .toLowerCase()
        .replace(/[^a-z\s]/g, '')
        .split(/\s+/)
        .filter(w => w.length > 0);

    const seen = new Set<string>();
    const validWords: string[] = [];
    const repetitions: string[] = [];
    const properNouns: string[] = [];
    const wrongLetter: string[] = [];

    for (const word of allWords) {
        if (!word.startsWith(targetLetter)) {
            wrongLetter.push(word);
            continue;
        }

        if (nlpProperNouns.has(word)) {
            properNouns.push(word);
            continue;
        }

        if (seen.has(word)) {
            repetitions.push(word);
            continue;
        }

        seen.add(word);
        validWords.push(word);
    }

    // can use a library here for better phonetic clustering
    const phoneticClusters: string[] = [];
    const prefixGroups: Record<string, string[]> = {};
    for (const word of validWords) {
        const prefix = word.slice(0, 3);
        if (!prefixGroups[prefix]) prefixGroups[prefix] = [];
        prefixGroups[prefix].push(word);
    }
    for (const [prefix, words] of Object.entries(prefixGroups)) {
        if (words.length >= 3) {
            phoneticClusters.push(`${prefix}*: ${words.join(', ')}`);
        }
    }

    const perseverationSignals: PerseverationSignals = {
        wordRepetitions: repetitions,
        semanticClusters: [],
        phoneticClusters,
        intrusionErrors: wrongLetter,
        priorListIntrusions: [],
    };

    return {
        score: validWords.length,
        validWords,
        repetitions,
        properNouns,
        totalProduced: allWords.length,
        perseverationSignals,
        completionSignalPresent: hasCompletionSignal(rawAnswer),
    };
}


export interface AbstractionResult {
    score: number; // 0, 1, or 2 per pair
    level: 'abstract' | 'concrete' | 'none';
}

export async function validateAbstraction(
    rawAnswer: string,
    pair: AbstractionPair,
    llm: ChatOpenAI,
): Promise<AbstractionResult> {
    const lower = rawAnswer.toLowerCase();

    for (const example of pair.abstractExamples) {
        if (lower.includes(example.toLowerCase())) {
            return { score: 2, level: 'abstract' };
        }
    }
    for (const example of pair.concreteExamples) {
        if (lower.includes(example.toLowerCase())) {
            return { score: 1, level: 'concrete' };
        }
    }

    try {
        const response = await llm.invoke([
            new SystemMessage(
                `You are scoring a cognitive assessment response.\n` +
                `The user was asked: "How are ${pair.item1} and ${pair.item2} alike?"\n` +
                `The user responded: "${rawAnswer}"\n\n` +
                `Score the response as exactly one of:\n` +
                `ABSTRACT — the user identified an abstract categorical similarity (e.g. "both are vehicles", "both measure things")\n` +
                `CONCRETE — the user identified a concrete/functional similarity (e.g. "both have wheels", "both have numbers")\n` +
                `NONE — the user did not identify a meaningful similarity, gave an incorrect answer, or said "I don't know"\n\n` +
                `Respond with only one word: ABSTRACT, CONCRETE, or NONE.`
            ),
        ]);

        const content = String(response.content).trim().toUpperCase();

        if (content === 'ABSTRACT') return { score: 2, level: 'abstract' };
        if (content === 'CONCRETE') return { score: 1, level: 'concrete' };
        return { score: 0, level: 'none' };
    } catch {
        return { score: 0, level: 'none' };
    }
}

export interface DelayedRecallResult {
    score: number;
    maxScore: 10;
    retrievalLevels: RetrievalLevel[];
    intrusionErrors: string[];
}

export function validateFreeRecall(rawAnswer: string, targetWords: string[]): {
    recalled: string[];
    missed: string[];
    intrusions: string[];
} {
    const doc = nlp(rawAnswer);
    const extractedNouns = doc.nouns().out('array').map((w: string) => w.toLowerCase());
    const lower = rawAnswer.toLowerCase();

    const recalled: string[] = [];
    const missed: string[] = [];
    const targetSet = new Set(targetWords.map(w => w.toLowerCase()));

    for (const word of targetWords) {
        const wordLower = word.toLowerCase();
        if (lower.includes(wordLower) || extractedNouns.includes(wordLower)) {
            recalled.push(word);
        } else {
            missed.push(word);
        }
    }

    const intrusions = extractedNouns.filter(
        (w: string) => !targetSet.has(w) && w.length > 2
    );

    return { recalled, missed, intrusions };
}

export function validateCuedRecall(rawAnswer: string, targetWord: string): boolean {
    return rawAnswer.toLowerCase().includes(targetWord.toLowerCase());
}

export function validateRecognition(rawAnswer: string, targetWord: string): boolean {
    return rawAnswer.toLowerCase().includes(targetWord.toLowerCase());
}

export function computeDelayedRecallScore(retrievalLevels: RetrievalLevel[]): number {
    return retrievalLevels.reduce((sum, level) => sum + level.score, 0);
}
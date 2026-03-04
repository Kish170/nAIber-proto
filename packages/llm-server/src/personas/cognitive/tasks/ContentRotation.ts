export interface WordList {
    id: string; // 'A' | 'B' | 'C' | 'D' | 'E'
    words: string[];
    categoryCues: Record<string, string>; // word → category cue
    recognitionOptions: Record<string, string[]>; // word → [target, foil1, foil2]
}

const WORD_LISTS: WordList[] = [
    {
        id: 'A',
        words: ['face', 'silk', 'church', 'daisy', 'red'],
        categoryCues: {
            face: 'a part of the body',
            silk: 'a type of fabric',
            church: 'a type of building',
            daisy: 'a type of flower',
            red: 'a colour',
        },
        recognitionOptions: {
            face: ['face', 'arm', 'hand'],
            silk: ['silk', 'velvet', 'cotton'],
            church: ['church', 'castle', 'barn'],
            daisy: ['daisy', 'lily', 'tulip'],
            red: ['red', 'green', 'blue'],
        },
    },
    {
        id: 'B',
        words: ['arm', 'velvet', 'castle', 'lily', 'green'],
        categoryCues: {
            arm: 'a part of the body',
            velvet: 'a type of fabric',
            castle: 'a type of building',
            lily: 'a type of flower',
            green: 'a colour',
        },
        recognitionOptions: {
            arm: ['arm', 'face', 'knee'],
            velvet: ['velvet', 'silk', 'linen'],
            castle: ['castle', 'church', 'cottage'],
            lily: ['lily', 'daisy', 'poppy'],
            green: ['green', 'red', 'gold'],
        },
    },
    {
        id: 'C',
        words: ['hand', 'cotton', 'barn', 'tulip', 'blue'],
        categoryCues: {
            hand: 'a part of the body',
            cotton: 'a type of fabric',
            barn: 'a type of building',
            tulip: 'a type of flower',
            blue: 'a colour',
        },
        recognitionOptions: {
            hand: ['hand', 'chest', 'arm'],
            cotton: ['cotton', 'wool', 'velvet'],
            barn: ['barn', 'temple', 'castle'],
            tulip: ['tulip', 'iris', 'lily'],
            blue: ['blue', 'white', 'green'],
        },
    },
    {
        id: 'D',
        words: ['knee', 'linen', 'cottage', 'poppy', 'gold'],
        categoryCues: {
            knee: 'a part of the body',
            linen: 'a type of fabric',
            cottage: 'a type of building',
            poppy: 'a type of flower',
            gold: 'a colour',
        },
        recognitionOptions: {
            knee: ['knee', 'hand', 'face'],
            linen: ['linen', 'cotton', 'silk'],
            cottage: ['cottage', 'barn', 'church'],
            poppy: ['poppy', 'tulip', 'daisy'],
            gold: ['gold', 'blue', 'red'],
        },
    },
    {
        id: 'E',
        words: ['chest', 'wool', 'temple', 'iris', 'white'],
        categoryCues: {
            chest: 'a part of the body',
            wool: 'a type of fabric',
            temple: 'a type of building',
            iris: 'a type of flower',
            white: 'a colour',
        },
        recognitionOptions: {
            chest: ['chest', 'knee', 'arm'],
            wool: ['wool', 'linen', 'velvet'],
            temple: ['temple', 'cottage', 'castle'],
            iris: ['iris', 'poppy', 'lily'],
            white: ['white', 'gold', 'green'],
        },
    },
];

export interface DigitSet {
    forward: Record<number, { trialA: number[]; trialB: number[] }>;
    reverse: Record<number, { trialA: number[]; trialB: number[] }>;
}

const DIGIT_SETS: DigitSet[] = [
    {
        forward: {
            3: { trialA: [5, 8, 2], trialB: [6, 4, 9] },
            4: { trialA: [7, 1, 8, 3], trialB: [3, 9, 2, 7] },
            5: { trialA: [4, 2, 7, 3, 1], trialB: [5, 1, 9, 4, 6] },
        },
        reverse: {
            3: { trialA: [2, 4, 9], trialB: [8, 5, 1] },
            4: { trialA: [3, 8, 1, 5], trialB: [7, 2, 6, 9] },
        },
    },
    {
        forward: {
            3: { trialA: [6, 9, 4], trialB: [3, 7, 1] },
            4: { trialA: [4, 9, 2, 6], trialB: [6, 2, 8, 4] },
            5: { trialA: [7, 5, 8, 3, 6], trialB: [8, 1, 4, 9, 3] },
        },
        reverse: {
            3: { trialA: [5, 7, 3], trialB: [4, 6, 2] },
            4: { trialA: [6, 1, 9, 4], trialB: [1, 5, 3, 8] },
        },
    },
    {
        forward: {
            3: { trialA: [7, 2, 8], trialB: [9, 1, 5] },
            4: { trialA: [8, 3, 5, 1], trialB: [1, 7, 4, 9] },
            5: { trialA: [2, 8, 5, 1, 4], trialB: [3, 6, 9, 2, 7] },
        },
        reverse: {
            3: { trialA: [8, 1, 6], trialB: [9, 3, 7] },
            4: { trialA: [9, 4, 2, 7], trialB: [4, 8, 6, 1] },
        },
    },
];

export interface VigilanceSet {
    id: number;
    letters: string[];
    aPositions: number[]; // 0-indexed positions of A's
}

const VIGILANCE_SETS: VigilanceSet[] = [
    {
        id: 1,
        letters: 'F B A C L T A D E A R S A N P K A M G H A J V W Q U X I O Z'.split(' '),
        aPositions: [2, 6, 9, 12, 16, 20],
    },
    {
        id: 2,
        letters: 'L A M B T A I D A P K A S Q J A R E G N A F H V U W C X O Z'.split(' '),
        aPositions: [1, 5, 8, 11, 15, 20],
    },
    {
        id: 3,
        letters: 'T A G R A B N S A H K D A E V J P A M Q L I A W F U C X O Z'.split(' '),
        aPositions: [1, 4, 8, 12, 17, 22],
    },
];

const FLUENCY_LETTERS = ['F', 'A', 'S'] as const;

export interface AbstractionPair {
    item1: string;
    item2: string;
    abstractExamples: string[];
    concreteExamples: string[];
}

export interface AbstractionSet {
    id: number;
    pairs: [AbstractionPair, AbstractionPair];
}

const ABSTRACTION_SETS: AbstractionSet[] = [
    {
        id: 1,
        pairs: [
            {
                item1: 'train',
                item2: 'bicycle',
                abstractExamples: ['both are vehicles', 'both are forms of transport', 'both are means of transportation'],
                concreteExamples: ['both have wheels', 'both take you places', 'you ride both'],
            },
            {
                item1: 'watch',
                item2: 'ruler',
                abstractExamples: ['both are measuring instruments', 'both measure things', 'both are tools for measurement'],
                concreteExamples: ['both have numbers', 'both have markings', 'both tell you something'],
            },
        ],
    },
    {
        id: 2,
        pairs: [
            {
                item1: 'apple',
                item2: 'banana',
                abstractExamples: ['both are fruits', 'both are types of fruit'],
                concreteExamples: ['both are things you eat', 'both have skin', 'both grow on trees'],
            },
            {
                item1: 'table',
                item2: 'bookshelf',
                abstractExamples: ['both are furniture', 'both are pieces of furniture'],
                concreteExamples: ['both hold things', 'both are made of wood', 'both are in a room'],
            },
        ],
    },
    {
        id: 3,
        pairs: [
            {
                item1: 'river',
                item2: 'lake',
                abstractExamples: ['both are bodies of water', 'both are water formations', 'both contain water'],
                concreteExamples: ['both have fish', 'both are wet', 'you can swim in both'],
            },
            {
                item1: 'hammer',
                item2: 'screwdriver',
                abstractExamples: ['both are tools', 'both are hand tools'],
                concreteExamples: ['both are used to build things', 'both have handles', 'both are in a toolbox'],
            },
        ],
    },
];

export function getWordList(sessionIndex: number): WordList {
    return WORD_LISTS[sessionIndex % WORD_LISTS.length];
}

export function getDigitSet(sessionIndex: number): DigitSet {
    return DIGIT_SETS[sessionIndex % DIGIT_SETS.length];
}

export function getLetter(sessionIndex: number): string {
    return FLUENCY_LETTERS[sessionIndex % FLUENCY_LETTERS.length];
}

export function getAbstractionSet(sessionIndex: number): AbstractionSet {
    return ABSTRACTION_SETS[sessionIndex % ABSTRACTION_SETS.length];
}

export function getVigilanceSet(sessionIndex: number): VigilanceSet {
    return VIGILANCE_SETS[sessionIndex % VIGILANCE_SETS.length];
}
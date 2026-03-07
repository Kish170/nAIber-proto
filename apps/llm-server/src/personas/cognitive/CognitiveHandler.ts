import { CognitiveRepository } from '@naiber/shared-data';
import {
    getWordList,
    getDigitSet,
    getLetter,
    getAbstractionSet,
    getVigilanceSet,
} from "./tasks/ContentRotation.js";

export interface CognitiveInitData {
    sessionIndex: number;
    selectedWordList: string;
    registrationWords: string[];
    selectedDigitSet: number;
    selectedLetter: string;
    selectedAbstractionSet: number;
    selectedVigilanceSet: number;
}

export class CognitiveHandler {
    static async initializeCognitiveTest(userId: string): Promise<CognitiveInitData> {
        const completedCount = await CognitiveRepository.getSessionCount(userId);
        const sessionIndex = completedCount; // 0-based for modulo rotation

        const wordList = getWordList(sessionIndex);
        const digitSet = getDigitSet(sessionIndex);
        const letter = getLetter(sessionIndex);
        const abstractionSet = getAbstractionSet(sessionIndex);
        const vigilanceSet = getVigilanceSet(sessionIndex);

        console.log('[CognitiveHandler] Initialized cognitive test:', {
            userId,
            sessionIndex,
            wordList: wordList.id,
            digitSet: sessionIndex % 3,
            letter,
            abstractionSet: abstractionSet.id,
            vigilanceSet: vigilanceSet.id,
        });

        return {
            sessionIndex,
            selectedWordList: wordList.id,
            registrationWords: wordList.words,
            selectedDigitSet: sessionIndex % 3,
            selectedLetter: letter,
            selectedAbstractionSet: abstractionSet.id,
            selectedVigilanceSet: vigilanceSet.id,
        };
    }
}

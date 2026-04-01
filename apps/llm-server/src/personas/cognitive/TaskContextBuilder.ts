import type { CognitiveStateType } from "./CognitiveState.js";
import { CognitiveTaskType, TASK_SEQUENCE } from "./tasks/TaskDefinitions.js";
import type { TaskDefinition } from "./tasks/TaskDefinitions.js";
import { getWordList, getDigitSet, getAbstractionSet } from "./tasks/ContentRotation.js";

export class TaskContextBuilder {
    build(state: CognitiveStateType): string {
        const tasks = state.tasks?.length > 0 ? state.tasks : TASK_SEQUENCE;
        const taskDef = tasks[state.currentTaskIndex];

        if (!taskDef) {
            return 'You are nAIber. Wrap up the session warmly.';
        }

        if (state.currentDecision?.action === 'clarify') {
            return this.buildClarification(state, taskDef);
        }

        switch (taskDef.taskType) {
            case CognitiveTaskType.WELLBEING:          return this.buildWellbeing(state, taskDef.prompt ?? '');
            case CognitiveTaskType.ORIENTATION:        return this.buildOrientation(state, taskDef.prompt ?? '');
            case CognitiveTaskType.WORD_REGISTRATION:  return this.buildWordRegistration(state, taskDef.prompt ?? '');
            case CognitiveTaskType.DIGIT_SPAN_FORWARD: return this.buildDigitSpanForward(state, taskDef.prompt ?? '');
            case CognitiveTaskType.DIGIT_SPAN_REVERSE: return this.buildDigitSpanReverse(state, taskDef.prompt ?? '');
            case CognitiveTaskType.SERIAL_7S:          return this.buildSerial7s(state, taskDef.prompt ?? '');
            case CognitiveTaskType.LETTER_FLUENCY:     return this.buildLetterFluency(state, taskDef.prompt ?? '');
            case CognitiveTaskType.ABSTRACTION:        return this.buildAbstraction(state, taskDef.prompt ?? '');
            case CognitiveTaskType.DELAYED_RECALL:     return this.buildDelayedRecall(state, taskDef.prompt ?? '');
            default:
                return this.baseContext(state) + `Say: "${taskDef.prompt}"`;
        }
    }

    private buildWellbeing(state: CognitiveStateType, prompt: string): string {
        const isFirst = state.currentTaskIndex === 0;
        if (isFirst) {
            return `You are nAIber, a warm AI companion conducting a brief wellness check before a mind exercise.\n` +
                   `Ask the following question warmly and conversationally. This is the opening check-in.\n` +
                   `Question: "${prompt}"\n` +
                   `Keep it brief and natural — one or two sentences.`;
        }
        return `You are nAIber. Continue the pre-exercise check-in warmly.\n` +
               `Ask: "${prompt}"\n` +
               `Keep it brief — acknowledge their previous answer naturally before asking.`;
    }

    private buildOrientation(state: CognitiveStateType, prompt: string): string {
        return this.baseContext(state) +
               `## CURRENT TASK: Orientation\n` +
               `Briefly acknowledge their previous answer, then say warmly: "${prompt}"\n` +
               `Deliver it naturally — you can paraphrase slightly but cover all four: date, month, year, season.`;
    }

    private buildWordRegistration(state: CognitiveStateType, prompt: string): string {
        const words = state.registrationWords.join('... ');

        if (state.registrationAttempts > 0) {
            return this.baseContext(state) +
                   `## CURRENT TASK: Word Registration (Retry)\n` +
                   `The user didn't repeat all the words. Read the list ONE more time clearly:\n` +
                   `Say exactly: "Let me say them once more: ${words}. Can you say those back to me?"`;
        }

        return this.baseContext(state) +
               `## CURRENT TASK: Word Registration\n` +
               `Say: "${prompt}"\n` +
               `Then read clearly, one per second: ${words}\n` +
               `Then say: "Can you say those back to me?"`;
    }

    private buildDigitSpanForward(state: CognitiveStateType, prompt: string): string {
        const digitSet = getDigitSet(state.selectedDigitSet);
        const length = state.digitSpanCurrentLength;
        const trial = state.digitSpanCurrentTrial as 'A' | 'B';
        const lengthData = digitSet.forward[length];

        if (!lengthData) {
            return this.baseContext(state) + `Say: "Good effort. Let's move on."`;
        }

        const digits = (trial === 'A' ? lengthData.trialA : lengthData.trialB).join('... ');
        const isFirstTrial = length === 3 && trial === 'A';

        return this.baseContext(state) +
               `## CURRENT TASK: Digit Span Forward (${length}-digit, trial ${trial})\n` +
               (isFirstTrial ? `This is a NEW task. Say: "${prompt} Here we go:"\n` : `Say: "Good. Let's try another set:"\n`) +
               `Then read EXACTLY these digits, one per second: ${digits}\n` +
               `Say ONLY these digits — do NOT make up different numbers. Wait for their response.`;
    }

    private buildDigitSpanReverse(state: CognitiveStateType, prompt: string): string {
        const digitSet = getDigitSet(state.selectedDigitSet);
        const length = state.digitSpanCurrentLength;
        const trial = state.digitSpanCurrentTrial as 'A' | 'B';
        const lengthData = digitSet.reverse[length];

        if (!lengthData) {
            return this.baseContext(state) + `Say: "Good effort. Let's move on."`;
        }

        const digits = (trial === 'A' ? lengthData.trialA : lengthData.trialB).join('... ');
        const isFirstTrial = length === 3 && trial === 'A';

        return this.baseContext(state) +
               `## CURRENT TASK: Digit Span Reverse (${length}-digit, trial ${trial})\n` +
               (isFirstTrial
                   ? `This is a NEW task — we are done with forward digits.\n` +
                     `Say: "Good, now let's try a slightly different version. ${prompt} So if I said 1, 2 — you'd say 2, 1. Let's give it a try:"\n`
                   : `Say: "Good. Here's another set:"\n`) +
               `Then read EXACTLY these digits, one per second: ${digits}\n` +
               `Say ONLY these digits — do NOT make up different numbers. Wait for their response.`;
    }

    private buildSerial7s(state: CognitiveStateType, prompt: string): string {
        return this.baseContext(state) +
               `## CURRENT TASK: Serial 7s\n` +
               `This is a NEW task — we are done with digit sequences.\n` +
               `Briefly acknowledge their effort on the previous task, then say: "${prompt}"`;
    }

    private buildLetterFluency(state: CognitiveStateType, prompt: string): string {
        return this.baseContext(state) +
               `## CURRENT TASK: Letter Fluency\n` +
               `This is a NEW task — we are done with the previous task.\n` +
               `Acknowledge their previous answer, then say: "${prompt} The letter is ${state.selectedLetter}. Ready? Go ahead."`;
    }

    private buildAbstraction(state: CognitiveStateType, prompt: string): string {
        const abstractionSet = getAbstractionSet(state.selectedAbstractionSet);
        const pairIndex = state.taskAttempts;
        const pair = abstractionSet.pairs[pairIndex];

        if (!pair) {
            return this.baseContext(state) + `Say: "Good effort. Let's move on."`;
        }

        const intro = pairIndex === 0
            ? `This is a NEW task — we are done with word fluency.\nSay: "${prompt}"\n`
            : `Say: "Good. Here's another pair:"\n`;

        return this.baseContext(state) +
               `## CURRENT TASK: Abstraction (pair ${pairIndex + 1} of 2)\n` +
               intro +
               `Ask: "${pair.item1} and ${pair.item2} — how are they alike?"\n` +
               `Do NOT comment on correctness. Just listen and wait for their answer.`;
    }

    private buildDelayedRecall(state: CognitiveStateType, prompt: string): string {
        switch (state.delayedRecallPhase) {
            case 'free':
                return this.baseContext(state) +
                       `## CURRENT TASK: Delayed Recall (Free)\n` +
                       `This is a NEW task — we are done with similarities.\n` +
                       `Say: "Almost done. ${prompt} Take as much time as you need."`;

            case 'cued': {
                const wordList = getWordList(state.sessionIndex);
                const currentWord = state.delayedRecallMissedWords[state.delayedRecallWordIndex];
                const cue = wordList.categoryCues[currentWord] ?? 'something';
                return this.baseContext(state) +
                       `## CURRENT TASK: Delayed Recall (Category Cue)\n` +
                       `Say: "One of the words was ${cue} — does that help you remember it?"`;
            }

            case 'recognition': {
                const wordList = getWordList(state.sessionIndex);
                const currentWord = state.delayedRecallMissedWords[state.delayedRecallWordIndex];
                const options = wordList.recognitionOptions[currentWord];
                if (!options) {
                    return this.baseContext(state) + `Say: "Let's move on."`;
                }
                return this.baseContext(state) +
                       `## CURRENT TASK: Delayed Recall (Recognition)\n` +
                       `Say: "Was it ${options[0]}, ${options[1]}, or ${options[2]}?"`;
            }

            default:
                return this.baseContext(state) + `Say: "${prompt}"`;
        }
    }

    private buildClarification(state: CognitiveStateType, taskDef: TaskDefinition): string {
        return this.baseContext(state) +
               `## CLARIFICATION NEEDED\n` +
               `The user asked a question or seemed confused about the current task (${taskDef.taskType}).\n` +
               `Re-explain the task warmly and simply. Do NOT repeat the exact same wording.\n` +
               `Original instruction: "${taskDef.prompt ?? ''}"\n` +
               `Rephrase it in simpler terms, then gently invite them to try. Keep it brief — one or two sentences.`;
    }

    private baseContext(state: CognitiveStateType): string {
        const tasks = state.tasks?.length > 0 ? state.tasks : TASK_SEQUENCE;
        return `You are nAIber, conducting a brief mind exercise with an elderly user.\n` +
               `Progress: Task ${state.currentTaskIndex + 1} of ${tasks.length}.\n` +
               `IMPORTANT: Follow the task instructions below EXACTLY. Say ONLY what is scripted. Do NOT repeat, reference, or continue any previous task.\n\n`;
    }
}
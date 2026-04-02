import type { CognitiveStateType } from "./CognitiveState.js";
import { CognitiveTaskType, TASK_SEQUENCE } from "./tasks/TaskDefinitions.js";
import type { TaskDefinition } from "./tasks/TaskDefinitions.js";
import { getWordList, getDigitSet, getAbstractionSet } from "./tasks/ContentRotation.js";

const READINESS_TASKS: CognitiveTaskType[] = [
    CognitiveTaskType.WORD_REGISTRATION,
    CognitiveTaskType.DIGIT_SPAN_FORWARD,
    CognitiveTaskType.DIGIT_SPAN_REVERSE,
    CognitiveTaskType.SERIAL_7S,
    CognitiveTaskType.LETTER_FLUENCY,
    CognitiveTaskType.ABSTRACTION,
    CognitiveTaskType.DELAYED_RECALL,
];

export class TaskContextBuilder {
    needsReadinessCheck(taskType: CognitiveTaskType, state: CognitiveStateType): boolean {
        if (!READINESS_TASKS.includes(taskType)) return false;
        if (taskType === CognitiveTaskType.DELAYED_RECALL && state.delayedRecallPhase !== 'free') return false;
        if (taskType === CognitiveTaskType.ABSTRACTION && state.abstractionPairIndex > 0) return false;
        return true;
    }

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

    buildIntro(state: CognitiveStateType, taskDef: TaskDefinition): string {
        const base = this.baseContext(state);
        switch (taskDef.taskType) {
            case CognitiveTaskType.WORD_REGISTRATION:
                return base +
                    `## READINESS CHECK: Word Registration\n` +
                    `This is a NEW task. Acknowledge the previous task briefly, then introduce this one.\n` +
                    `Say: "I'm going to say five words out loud. When I'm done, I'd like you to repeat them back to me — no need to remember them just yet, just repeat them back. Ready?"\n` +
                    `Wait for their confirmation before saying any words.`;

            case CognitiveTaskType.DIGIT_SPAN_FORWARD:
                return base +
                    `## READINESS CHECK: Digit Span Forward\n` +
                    `This is a NEW task. Acknowledge the previous task briefly, then introduce this one.\n` +
                    `Say: "Now for a number exercise. I'll read some digits out loud and when I'm done, I'd like you to repeat them back in the same order. Ready?"\n` +
                    `Wait for their confirmation before giving any digits.`;

            case CognitiveTaskType.DIGIT_SPAN_REVERSE:
                return base +
                    `## READINESS CHECK: Digit Span Reverse\n` +
                    `We are done with forward digits. Introduce the reverse task.\n` +
                    `Say: "Good. Now a slightly different version — this time when I read the digits, I'd like you to say them back in reverse order. So if I said 1, 2 — you'd say 2, 1. Ready to give it a try?"\n` +
                    `Wait for their confirmation before giving any digits.`;

            case CognitiveTaskType.SERIAL_7S:
                return base +
                    `## READINESS CHECK: Serial 7s\n` +
                    `We are done with digit sequences. Introduce the counting task.\n` +
                    `Say: "Good. Now for a bit of counting. I'll give you a starting number and I'd like you to keep subtracting 7 each time. Are you ready?"\n` +
                    `Wait for their confirmation before giving the starting number.`;

            case CognitiveTaskType.LETTER_FLUENCY:
                return base +
                    `## READINESS CHECK: Letter Fluency\n` +
                    `We are done with the previous task. Introduce the word task.\n` +
                    `Say: "Now for a word task. I'll give you a letter and I'd like you to say as many words as you can that start with that letter — everyday words, no names of people or places. Ready to hear the letter?"\n` +
                    `Wait for their confirmation before revealing the letter.`;

            case CognitiveTaskType.ABSTRACTION:
                return base +
                    `## READINESS CHECK: Abstraction\n` +
                    `This is a NEW task. Acknowledge the previous task briefly, then introduce this one.\n` +
                    `Say: "Now I'm going to name two things, and I'd like you to tell me what they have in common — how they're alike. Ready?"\n` +
                    `Wait for their confirmation before naming any pair.`;

            case CognitiveTaskType.DELAYED_RECALL:
                return base +
                    `## READINESS CHECK: Delayed Recall\n` +
                    `We are nearly done. Introduce the recall task.\n` +
                    `Say: "We're almost at the end. I'd like to see if you can remember some words I said at the very beginning of our session. Ready?"\n` +
                    `Wait for their confirmation before prompting recall.`;

            default:
                return this.build(state);
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

    private buildWordRegistration(state: CognitiveStateType, _prompt: string): string {
        const words = state.registrationWords.join('... ');

        if (state.registrationAttempts > 0) {
            return this.baseContext(state) +
                   `## CURRENT TASK: Word Registration (Retry)\n` +
                   `The user didn't repeat all the words. Read the list ONE more time clearly:\n` +
                   `Say exactly: "Let me say them once more: ${words}. Can you say those back to me?"`;
        }

        return this.baseContext(state) +
               `## CURRENT TASK: Word Registration\n` +
               `The user has confirmed they're ready. Say: "Here are the five words — repeat them back when I'm done:"\n` +
               `Then read clearly, one per second: ${words}\n` +
               `Then say: "Can you say those back to me?"`;
    }

    private buildDigitSpanForward(state: CognitiveStateType, _prompt: string): string {
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
               (isFirstTrial
                   ? `The user just confirmed they're ready. Say: "Great! Here we go:"\n`
                   : `Say: "Good. Let's try another set:"\n`) +
               `Then read EXACTLY these digits, one per second: ${digits}\n` +
               `Say ONLY these digits — do NOT make up different numbers. Wait for their response.`;
    }

    private buildDigitSpanReverse(state: CognitiveStateType, _prompt: string): string {
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
                   ? `The user just confirmed they're ready for reverse digits. Say: "Great! Here we go:"\n`
                   : `Say: "Good. Here's another set:"\n`) +
               `Then read EXACTLY these digits, one per second: ${digits}\n` +
               `Say ONLY these digits — do NOT make up different numbers. Wait for their response.`;
    }

    private buildSerial7s(state: CognitiveStateType, prompt: string): string {
        return this.baseContext(state) +
               `## CURRENT TASK: Serial 7s\n` +
               `The user has confirmed they're ready. Say: "${prompt}"\n` +
               `Tell them: "I only need 5 answers from you — press # on your keypad or say 'done' when you've finished."`;
    }

    private buildLetterFluency(state: CognitiveStateType, prompt: string): string {
        return this.baseContext(state) +
               `## CURRENT TASK: Letter Fluency\n` +
               `The user has confirmed they're ready. Say: "${prompt} The letter is ${state.selectedLetter}."\n` +
               `Tell them: "You have about 60 seconds — press # on your keypad or say 'stop' when you're done. Go ahead."`;
    }

    private buildAbstraction(state: CognitiveStateType, _prompt: string): string {
        const abstractionSet = getAbstractionSet(state.selectedAbstractionSet);
        const pairIndex = state.abstractionPairIndex;
        const pair = abstractionSet.pairs[pairIndex];

        if (!pair) {
            return this.baseContext(state) + `Say: "Good effort. Let's move on."`;
        }

        const intro = pairIndex === 0
            ? `The user has confirmed they're ready. Say: "Great!"\n`
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
                       `The user has confirmed they're ready. Say: "${prompt}"\n` +
                       `Then say: "Take your time — press # on your keypad or say 'that's all' when you've recalled everything you can."`;

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
        if (taskDef.taskType === CognitiveTaskType.WORD_REGISTRATION) {
            const words = state.registrationWords.join('... ');
            return this.baseContext(state) +
                   `## CLARIFICATION: Word Registration\n` +
                   `The user asked to hear the words again. Read the list ONE more time clearly and warmly.\n` +
                   `Say: "Of course — here they are: ${words}. Can you say those back to me?"`;
        }

        if (taskDef.taskType === CognitiveTaskType.DELAYED_RECALL) {
            return this.baseContext(state) +
                   `## CLARIFICATION: Delayed Recall\n` +
                   `The user asked for clarification. Re-explain the task WITHOUT revealing or hinting at any of the target words.\n` +
                   `Say something like: "Earlier in our conversation I said five words out loud. I'm just asking if any of them come to mind now — no pressure, take your time."\n` +
                   `Do NOT say, hint at, or describe any of the words.`;
        }

        if (taskDef.taskType === CognitiveTaskType.LETTER_FLUENCY) {
            if (state.taskReadinessConfirmed) {
                return this.baseContext(state) +
                       `## CLARIFICATION: Letter Fluency (execute)\n` +
                       `The user asked a question during the word task. Re-explain clearly.\n` +
                       `Say: "The letter is ${state.selectedLetter}. Just say as many everyday words as you can that start with that letter — no names of people or places. Press # or say 'stop' when you're done."\n` +
                       `Do NOT change the letter. The letter is ${state.selectedLetter}.`;
            }
            return this.baseContext(state) +
                   `## CLARIFICATION: Letter Fluency (intro)\n` +
                   `The user asked a question about the upcoming word task. Explain warmly without revealing the letter yet.\n` +
                   `Say: "No problem — I'll give you a letter, and you just say as many everyday words as you can think of that start with it. No names of people or places. I'll tell you the letter once you're ready."`;
        }

        if (taskDef.taskType === CognitiveTaskType.DIGIT_SPAN_FORWARD && state.taskReadinessConfirmed) {
            const digitSet = getDigitSet(state.selectedDigitSet);
            const length = state.digitSpanCurrentLength;
            const trial = state.digitSpanCurrentTrial as 'A' | 'B';
            const lengthData = digitSet.forward[length];
            if (lengthData) {
                const digits = (trial === 'A' ? lengthData.trialA : lengthData.trialB).join('... ');
                return this.baseContext(state) +
                       `## CLARIFICATION: Digit Span Forward\n` +
                       `The user asked to hear the digits again. Read them once more.\n` +
                       `Say: "Of course — here they are: ${digits}. Can you repeat those back to me?"`;
            }
        }

        if (taskDef.taskType === CognitiveTaskType.DIGIT_SPAN_REVERSE && state.taskReadinessConfirmed) {
            const digitSet = getDigitSet(state.selectedDigitSet);
            const length = state.digitSpanCurrentLength;
            const trial = state.digitSpanCurrentTrial as 'A' | 'B';
            const lengthData = digitSet.reverse[length];
            if (lengthData) {
                const digits = (trial === 'A' ? lengthData.trialA : lengthData.trialB).join('... ');
                return this.baseContext(state) +
                       `## CLARIFICATION: Digit Span Reverse\n` +
                       `The user asked to hear the digits again. Remind them to say them in reverse order.\n` +
                       `Say: "Of course — here they are: ${digits}. Remember to say them back in reverse order. Can you give it a try?"`;
            }
        }

        if (taskDef.taskType === CognitiveTaskType.SERIAL_7S && state.taskReadinessConfirmed) {
            return this.baseContext(state) +
                   `## CLARIFICATION: Serial 7s\n` +
                   `The user asked for clarification. Re-explain the counting task simply.\n` +
                   `Say: "Start at 100 and keep taking away 7 each time. So 100, then 93, then 86, and so on. Just give me 5 answers — press # or say 'done' when you're finished."`;
        }

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

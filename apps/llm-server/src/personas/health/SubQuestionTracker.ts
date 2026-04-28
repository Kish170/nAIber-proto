export interface SubQuestionState {
    count: number;
    lastQuestionTexts: string[];
}

export function createSubQuestionState(): SubQuestionState {
    return { count: 0, lastQuestionTexts: [] };
}

export function increment(state: SubQuestionState, questionText: string): SubQuestionState {
    return {
        count: state.count + 1,
        lastQuestionTexts: [...state.lastQuestionTexts.slice(-4), questionText]
    };
}

export function reset(): SubQuestionState {
    return createSubQuestionState();
}

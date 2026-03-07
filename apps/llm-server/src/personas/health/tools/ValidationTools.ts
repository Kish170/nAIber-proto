import type { QuestionData, ValidatedAnswer, BooleanQuestionData, ScaleQuestionData, TextQuestionData } from "../questions/Question.js";

const DEFAULT_ACCEPTED_TRUE = ['yes', 'y', 'yeah', 'yep', 'true', '1'];
const DEFAULT_ACCEPTED_FALSE = ['no', 'n', 'nope', 'false', '0'];

export function validateBooleanAnswer(question: BooleanQuestionData, answer: string): ValidatedAnswer {
    const trimmed = answer.trim();
    const normalized = trimmed.toLowerCase();
    const acceptedTrue = question.acceptedTrue ?? DEFAULT_ACCEPTED_TRUE;
    const acceptedFalse = question.acceptedFalse ?? DEFAULT_ACCEPTED_FALSE;

    if (!trimmed) {
        return { isValid: false, validatedAnswer: trimmed, error: 'Please answer yes or no' };
    }
    if (acceptedTrue.includes(normalized)) {
        return { isValid: true, validatedAnswer: 'yes' };
    }
    if (acceptedFalse.includes(normalized)) {
        return { isValid: true, validatedAnswer: 'no' };
    }
    return { isValid: false, validatedAnswer: trimmed, error: 'Please answer yes or no' };
}

export function validateScaleAnswer(question: ScaleQuestionData, answer: string): ValidatedAnswer {
    const trimmed = answer.trim();

    if (!trimmed) {
        return {
            isValid: false,
            validatedAnswer: trimmed,
            error: `Please provide a number between ${question.min} and ${question.max}`
        };
    }
    const num = parseInt(trimmed);
    if (isNaN(num)) {
        return { isValid: false, validatedAnswer: trimmed, error: 'Please provide a valid number' };
    }
    if (num < question.min || num > question.max) {
        return {
            isValid: false,
            validatedAnswer: trimmed,
            error: `Please provide a number between ${question.min} and ${question.max}`
        };
    }
    return { isValid: true, validatedAnswer: num.toString() };
}

export function validateTextAnswer(question: TextQuestionData, answer: string): ValidatedAnswer {
    const trimmed = answer.trim();

    if (!trimmed) {
        if (question.optional) {
            return { isValid: true, validatedAnswer: 'not answered' };
        }
        return { isValid: false, validatedAnswer: trimmed, error: 'This question requires an answer' };
    }
    return { isValid: true, validatedAnswer: trimmed };
}

export function validateAnswer(question: QuestionData, answer: string): ValidatedAnswer {
    switch (question.type) {
        case 'boolean':
            return validateBooleanAnswer(question, answer);
        case 'scale':
            return validateScaleAnswer(question, answer);
        case 'text':
            return validateTextAnswer(question, answer);
        default:
            return { isValid: true, validatedAnswer: answer.trim() };
    }
}

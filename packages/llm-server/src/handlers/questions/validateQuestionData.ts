import { QuestionData, ValidatedAnswer } from './Question.js';

const ACCEPTED_YES = ['yes', 'y', 'yeah', 'yep', 'true', '1'];
const ACCEPTED_NO = ['no', 'n', 'nope', 'false', '0'];

export function validateQuestionData(question: QuestionData, answer: string): ValidatedAnswer {
    const trimmed = answer.trim();

    switch (question.type) {
        case 'boolean': {
            if (!trimmed) {
                return { isValid: false, validatedAnswer: trimmed, error: 'Please answer yes or no' };
            }
            const normalized = trimmed.toLowerCase();
            if (ACCEPTED_YES.includes(normalized)) {
                return { isValid: true, validatedAnswer: 'yes' };
            }
            if (ACCEPTED_NO.includes(normalized)) {
                return { isValid: true, validatedAnswer: 'no' };
            }
            return { isValid: false, validatedAnswer: trimmed, error: 'Please answer yes or no' };
        }
        case 'scale': {
            if (!trimmed) {
                return { isValid: false, validatedAnswer: trimmed, error: `Please provide a number between ${question.min} and ${question.max}` };
            }
            const num = parseInt(trimmed);
            if (isNaN(num)) {
                return { isValid: false, validatedAnswer: trimmed, error: 'Please provide a valid number' };
            }
            if (num < question.min || num > question.max) {
                return { isValid: false, validatedAnswer: trimmed, error: `Please provide a number between ${question.min} and ${question.max}` };
            }
            return { isValid: true, validatedAnswer: num.toString() };
        }
        case 'text': {
            if (!trimmed) {
                if (question.optional) {
                    return { isValid: true, validatedAnswer: 'not answered' };
                }
                return { isValid: false, validatedAnswer: trimmed, error: 'This question requires an answer' };
            }
            return { isValid: true, validatedAnswer: trimmed };
        }
        default:
            return { isValid: true, validatedAnswer: trimmed };
    }
}

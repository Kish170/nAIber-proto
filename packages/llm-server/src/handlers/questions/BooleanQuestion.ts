import { Question, ValidatedAnswer, QuestionCategory } from './Question.js';

export class BooleanQuestion extends Question {
    private readonly acceptedYes: string[] = ['yes', 'y', 'yeah', 'yep', 'true', '1'];
    private readonly acceptedNo: string[] = ['no', 'n', 'nope', 'false', '0'];

    constructor(id: string, questionText: string, category: QuestionCategory, context: string, relatedTo?: string) {
        super(id, questionText, category, context, relatedTo);
    }

    validate(answer: string): ValidatedAnswer {
        const trimmedAnswer = answer.trim();

        if (!trimmedAnswer) {
            return {
                isValid: false,
                validatedAnswer: trimmedAnswer,
                error: 'Please answer yes or no'
            };
        }

        const normalized = trimmedAnswer.toLowerCase();

        if (this.acceptedYes.includes(normalized)) {
            return {
                isValid: true,
                validatedAnswer: 'yes'
            };
        }

        if (this.acceptedNo.includes(normalized)) {
            return {
                isValid: true,
                validatedAnswer: 'no'
            };
        }

        return {
            isValid: false,
            validatedAnswer: trimmedAnswer,
            error: 'Please answer yes or no'
        };
    }

    getValidationProcess(): string {
        return "Normalizes input to lowercase and matches against common affirmative (yes, y, true) or negative (no, n, false) strings to ensure a binary data result.";
    }

    getType(): string {
        return 'boolean';
    }
}

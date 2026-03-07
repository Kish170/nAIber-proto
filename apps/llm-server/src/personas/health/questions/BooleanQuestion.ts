import { Question, ValidatedAnswer, QuestionCategory } from './Question.js';

const DEFAULT_ACCEPTED_TRUE = ['yes', 'y', 'yeah', 'yep', 'true', '1'];
const DEFAULT_ACCEPTED_FALSE = ['no', 'n', 'nope', 'false', '0'];

export class BooleanQuestion extends Question {
    private readonly acceptedTrue: string[];
    private readonly acceptedFalse: string[];

    constructor(
        id: string,
        questionText: string,
        category: QuestionCategory,
        context: string,
        relatedTo?: string,
        acceptedTrue?: string[],
        acceptedFalse?: string[]
    ) {
        super(id, questionText, category, context, relatedTo);
        this.acceptedTrue = acceptedTrue ?? DEFAULT_ACCEPTED_TRUE;
        this.acceptedFalse = acceptedFalse ?? DEFAULT_ACCEPTED_FALSE;
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

        if (this.acceptedTrue.includes(normalized)) {
            return { isValid: true, validatedAnswer: 'yes' };
        }

        if (this.acceptedFalse.includes(normalized)) {
            return { isValid: true, validatedAnswer: 'no' };
        }

        return {
            isValid: false,
            validatedAnswer: trimmedAnswer,
            error: 'Please answer yes or no'
        };
    }

    getType(): string {
        return 'boolean';
    }

    getValidationProcess(): string {
        return "Normalizes input to lowercase and matches against accepted affirmative or negative strings to ensure a binary data result.";
    }

    toJSON() {
        return {
            ...super.toJSON(),
            acceptedTrue: this.acceptedTrue,
            acceptedFalse: this.acceptedFalse
        };
    }
}

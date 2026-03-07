import { Question, ValidatedAnswer, QuestionCategory } from './Question.js';

export class ScaleQuestion extends Question {
    private readonly min: number;
    private readonly max: number;

    constructor(id: string, questionText: string, category: QuestionCategory, context: string, min: number = 1, max: number = 10, relatedTo?: string) {
        super(id, questionText, category, context, relatedTo);
        this.min = min;
        this.max = max;
    }

    validate(answer: string): ValidatedAnswer {
        const trimmedAnswer = answer.trim();

        if (!trimmedAnswer) {
            return {
                isValid: false,
                validatedAnswer: trimmedAnswer,
                error: `Please provide a number between ${this.min} and ${this.max}`
            };
        }

        const num = parseInt(trimmedAnswer);

        if (isNaN(num)) {
            return {
                isValid: false,
                validatedAnswer: trimmedAnswer,
                error: 'Please provide a valid number'
            };
        }

        if (num < this.min || num > this.max) {
            return {
                isValid: false,
                validatedAnswer: trimmedAnswer,
                error: `Please provide a number between ${this.min} and ${this.max}`
            };
        }

        return {
            isValid: true,
            validatedAnswer: num.toString()
        };
    }

    getType(): string {
        return 'scale';
    }

    getMin(): number {
        return this.min;
    }

    getMax(): number {
        return this.max;
    }

    getValidationProcess(): string {
        return "Checking if the number is within the defined range (e.g., 1-10).";
    }

    toJSON() {
        return {
            ...super.toJSON(),
            min: this.min,
            max: this.max
        };
    }
}

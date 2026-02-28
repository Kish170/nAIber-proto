import { Question, ValidatedAnswer, QuestionCategory } from './Question.js';

export class TextQuestion extends Question {
    private readonly optional: boolean;

    constructor(id: string, questionText: string, category: QuestionCategory, context: string, optional: boolean = true, relatedTo?: string) {
        super(id, questionText, category, context, relatedTo);
        this.optional = optional;
    }

    validate(answer: string): ValidatedAnswer {
        const trimmedAnswer = answer.trim();

        if (!trimmedAnswer) {
            if (this.optional) {
                return {
                    isValid: true,
                    validatedAnswer: 'not answered'
                };
            } else {
                return {
                    isValid: false,
                    validatedAnswer: trimmedAnswer,
                    error: 'This question requires an answer'
                };
            }
        }

        return {
            isValid: true,
            validatedAnswer: trimmedAnswer
        };
    }

    getType(): string {
        return 'text';
    }

    isOptional(): boolean {
        return this.optional;
    }

    getValidationProcess(): string {
        return "Ensuring the input isn't empty or exceeds a specific character limit and is summarized; no raw data";
    }

    toJSON() {
        return {
            ...super.toJSON(),
            optional: this.optional
        };
    }
}
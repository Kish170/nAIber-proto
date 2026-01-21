import { Question, ValidatedAnswer, QuestionCategory } from './Question.js';

export class TextQuestion extends Question {
    private readonly optional: boolean;

    constructor(questionText: string, category: QuestionCategory, optional: boolean = true, relatedTo?: string) {
        super(questionText, category, relatedTo);
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

    toJSON() {
        return {
            ...super.toJSON(),
            optional: this.optional
        };
    }
}
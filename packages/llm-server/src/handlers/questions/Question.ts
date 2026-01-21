export interface ValidatedAnswer {
    isValid: boolean;
    validatedAnswer: string;
    error?: string;
}

export type QuestionCategory = 'general' | 'medication' | 'condition-specific' | 'symptom';

export abstract class Question {
    public readonly category: QuestionCategory;
    public readonly relatedTo?: string;
    protected readonly questionText: string;

    constructor(questionText: string, category: QuestionCategory, relatedTo?: string) {
        this.questionText = questionText;
        this.category = category;
        this.relatedTo = relatedTo;
    }

    abstract validate(answer: string): ValidatedAnswer;
    abstract getType(): string;

    getQuestion(): string {
        return this.questionText;
    }

    toJSON() {
        return {
            question: this.questionText,
            type: this.getType(),
            category: this.category,
            relatedTo: this.relatedTo
        };
    }
}

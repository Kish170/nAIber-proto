export interface ValidatedAnswer {
    isValid: boolean;
    validatedAnswer: string;
    error?: string;
}

export type QuestionCategory = 'general' | 'medication' | 'condition-specific' | 'symptom';

export interface BaseQuestionData {
    id: string;
    question: string;
    type: string;
    category: QuestionCategory;
    context: string;
    validation: string;
    relatedTo?: string;
}

export interface BooleanQuestionData extends BaseQuestionData {
    type: 'boolean';
}

export interface ScaleQuestionData extends BaseQuestionData {
    type: 'scale';
    min: number;
    max: number;
}

export interface TextQuestionData extends BaseQuestionData {
    type: 'text';
    optional: boolean;
}

export type QuestionData = BooleanQuestionData | ScaleQuestionData | TextQuestionData;

export abstract class Question {
    public readonly category: QuestionCategory;
    public readonly relatedTo?: string;
    public readonly questionText: string;
    public readonly id: string;
    public readonly context: string;

    constructor(id: string, questionText: string, category: QuestionCategory, context: string, relatedTo?: string) {
        this.questionText = questionText;
        this.category = category;
        this.relatedTo = relatedTo;
        this.id = id;
        this.context = context;
    }

    abstract validate(answer: string): ValidatedAnswer;
    abstract getType(): string;
    abstract getValidationProcess(): string;

    getQuestion(): string {
        return this.questionText;
    }

    toJSON() {
        return {
            id: this.id,
            question: this.questionText,
            type: this.getType(),
            category: this.category,
            context: this.context,
            validation: this.getValidationProcess(),
            relatedTo: this.relatedTo
        };
    }
}

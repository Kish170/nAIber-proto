import { z } from 'zod';

export const ScaleExtractionSchema = z.object({
    value: z.number().int().min(1).max(10).nullable().describe(
        'Extracted integer 1-10, or null if no value can be determined'
    ),
    confidence: z.number().min(0).max(1).describe('Confidence in the extracted value'),
    cannot_extract: z.boolean().describe('True if no numeric value can be reasonably inferred'),
});

export const BooleanExtractionSchema = z.object({
    value: z.enum(['yes', 'no']).nullable().describe('Extracted yes or no, or null if ambiguous'),
    confidence: z.number().min(0).max(1).describe('Confidence in the extracted value'),
    cannot_extract: z.boolean().describe('True if no clear yes/no can be reasonably inferred'),
});

export const IntentSchema = z.object({
    intent: z.enum(['ANSWERING', 'ASKING', 'REFUSING', 'CONFIRMING']).describe(
        'ANSWERING = attempting to give an answer; ASKING = asking a question back; REFUSING = declining to answer; CONFIRMING = acknowledging they understood and are ready to try (e.g. "yes", "ok", "sure", "I\'ll try")'
    ),
    confidence: z.number().min(0).max(1),
});

export const ConditionNormalisationSchema = z.object({
    symptoms_mentioned: z.array(z.string()).describe(
        'Specific symptoms mentioned (e.g. "knee pain", "joint stiffness")'
    ),
    severity: z.enum(['none', 'mild', 'moderate', 'severe', 'unknown']).describe(
        'Overall severity implied by the answer'
    ),
    change_from_baseline: z.enum(['better', 'same', 'worse', 'unknown']).describe(
        "Whether condition is improving, stable, or worsening based on the user's description"
    ),
    notable_flags: z.array(z.string()).describe(
        'Notable observations worth flagging (e.g. "cold-weather triggered", "affecting sleep")'
    ),
});

export const SymptomNormalisationSchema = z.object({
    symptoms: z.array(z.string()).describe('Distinct symptoms mentioned (e.g. "nausea", "knee soreness")'),
    body_parts: z.array(z.string()).describe('Body parts referenced (e.g. "knee", "chest")'),
    severity: z.enum(['none', 'mild', 'moderate', 'severe', 'unknown']),
    no_symptoms: z.boolean().describe('True if the user explicitly reported no symptoms'),
});

export const GeneralNotesSchema = z.object({
    concerns: z.array(z.string()).describe('Health concerns or worries the user raised'),
    positives: z.array(z.string()).describe('Positive health updates the user mentioned'),
    no_additional_notes: z.boolean().describe('True if the user had nothing further to add'),
});

export const FollowUpEvaluationSchema = z.object({
    should_follow_up: z.boolean().describe(
        'True if the answer warrants a brief neutral follow-up question to capture more useful health detail'
    ),
    follow_up_question: z.string().nullable().describe(
        'An example of the type of follow-up question to ask but support it with the context of the previous answer, or null if should_follow_up is false'
    ),
    reason: z.string().describe('One-line reason for this decision — used for logging only'),
});

export type ScaleExtractionResult = z.infer<typeof ScaleExtractionSchema>;
export type BooleanExtractionResult = z.infer<typeof BooleanExtractionSchema>;
export type IntentResult = z.infer<typeof IntentSchema>;
export type ConditionNormalisationResult = z.infer<typeof ConditionNormalisationSchema>;
export type SymptomNormalisationResult = z.infer<typeof SymptomNormalisationSchema>;
export type GeneralNotesResult = z.infer<typeof GeneralNotesSchema>;
export type FollowUpEvaluationResult = z.infer<typeof FollowUpEvaluationSchema>;
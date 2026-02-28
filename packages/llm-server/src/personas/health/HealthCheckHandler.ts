import { HealthRepository } from '@naiber/shared';
import { Question, QuestionData, ScaleQuestion, BooleanQuestion, TextQuestion, ValidatedAnswer } from './questions/index.js';

export interface HealthCheckState {
    questions: Question[];
    answers: string[];
    currentQuestionIndex: number;
    userId: string;
    conversationId: string;
}

export interface HealthLogData {
    overallWellBeing?: number;
    physicalSymptoms: string[];
    sleepQuality?: number;
    generalNotes?: string;
}

export interface MedicationLogData {
    medicationId: string;
    medicationTaken: boolean;
}

export interface HealthConditionLogData {
    healthConditionId: string;
    symptoms: string[];
    notes?: string;
}

export interface ParsedHealthCheckData {
    healthLog: HealthLogData;
    medicationLogs: MedicationLogData[];
    healthConditionLogs: HealthConditionLogData[];
}

export class HealthCheckHandler {
    static async initializeHealthCheck(userId: string): Promise<Question[]> {
        const questions: Question[] = [];

        questions.push(
            new ScaleQuestion(
                "overall_wellbeing",
                "On a scale of 1-10, how are you feeling overall right now?",
                "general",
                "Helps understand the user's state of mind when they provided their other answers."
            )
        );

        questions.push(
            new TextQuestion(
                "physical_symptoms_assessment",
                "Are you experiencing any physical symptoms at the moment? (e.g., pain, nausea, dizziness)",
                "symptom",
                "Used to identify any physical issues or discomfort the user is feeling right now."
            )
        );

        questions.push(
            new ScaleQuestion(
                "sleep_assessment",
                "How would you rate your sleep last night from 1-10?",
                "general",
                "Helps determine how sleep quality might be affecting the user's energy or mood today."
            )
        );

        questions.push(
            new TextQuestion(
                "extra_notes",
                "Is there anything else you'd like to note about how you're feeling?",
                "general",
                "Allows the user to provide additional details that weren't covered by other questions."
            )
        );

        const conditions = await HealthRepository.findHealthConditionsByUserId(userId);
        const activeConditions = conditions.filter(c => c.isActive);
        
        const medications = await HealthRepository.findMedicationsByUserId(userId);
        const activeMedications = medications.filter(m => m.isActive);

        if (activeConditions.length > 0) {
            for (const condition of activeConditions) {
                questions.push(
                    new TextQuestion(
                        "health_condition",
                        `How has your ${condition.condition} been lately? Any changes or concerns?`,
                        "condition-specific",
                        "Tracks the status of a pre-existing condition to identify flare-ups or improvements over time.",
                        true,
                        condition.id
                    )
                );
            }
        }

        if (activeMedications.length > 0) {
            for (const medication of activeMedications) {
                questions.push(
                    new BooleanQuestion(
                        "medication_tracking",
                        `Have you taken your ${medication.name} today?`,
                        "medication",
                        "Tracks daily medication adherence to ensure the user is following their prescribed treatment plan.",
                        medication.id
                    )
                );
            }
        }

        return questions;
    }

    static validateAnswer(question: Question, answer: string): ValidatedAnswer {
        return question.validate(answer);
    }

    static parseHealthCheckAnswers(questions: QuestionData[], answers: string[]): ParsedHealthCheckData {
        const healthLogData: HealthLogData = {
            physicalSymptoms: []
        };
        const medicationLogs: MedicationLogData[] = [];
        const healthConditionLogs: HealthConditionLogData[] = [];

        for (let i = 0; i < questions.length; i++) {
            const question = questions[i];
            const answer = answers[i];

            if (!answer || answer === 'not answered') continue;

            const questionText = question.question;

            switch (question.category) {
                case 'general':
                    if (questionText.includes('overall')) {
                        healthLogData.overallWellBeing = parseInt(answer);
                    } else if (questionText.includes('sleep')) {
                        healthLogData.sleepQuality = parseInt(answer);
                    } else if (questionText.includes('anything else')) {
                        healthLogData.generalNotes = answer;
                    }
                    break;

                case 'medication':
                    if (question.relatedTo) {
                        medicationLogs.push({
                            medicationId: question.relatedTo,
                            medicationTaken: answer.toLowerCase() === 'yes'
                        });
                    }
                    break;

                case 'condition-specific':
                    if (question.relatedTo) {
                        healthConditionLogs.push({
                            healthConditionId: question.relatedTo,
                            symptoms: healthLogData.physicalSymptoms,
                            notes: answer
                        });
                    }
                    break;

                case 'symptom':
                    if (answer !== 'not answered' && answer.toLowerCase() !== 'no' && answer.toLowerCase() !== 'none') {
                        const symptoms = answer.split(',').map(s => s.trim()).filter(s => s.length > 0);
                        healthLogData.physicalSymptoms.push(...symptoms);
                    }
                    break;
            }
        }

        return {
            healthLog: healthLogData,
            medicationLogs,
            healthConditionLogs
        };
    }

    // static async saveHealthLog(userId: string, conversationId: string, healthLog: HealthLogData, callLogId?: string): Promise<void> {
    //     try {
    //         await HealthRepository.createHealthLog({
    //             userId,
    //             conversationId,
    //             callLogId,
    //             overallWellBeing: healthLog.overallWellBeing,
    //             physicalSymptoms: healthLog.physicalSymptoms,
    //             sleepQuality: healthLog.sleepQuality,
    //             generalNotes: healthLog.generalNotes
    //         });
    //         console.log('[HealthCheckHandler] Health log saved successfully');
    //     } catch (error) {
    //         console.error('[HealthCheckHandler] Error saving health log:', error);
    //         throw error;
    //     }
    // }

    // static async saveMedicationLogs(userId: string, conversationId: string, medicationLogs: MedicationLogData[], callLogId?: string): Promise<void> {
    //     try {
    //         if (medicationLogs.length === 0) {
    //             console.log('[HealthCheckHandler] No medication logs to save');
    //             return;
    //         }

    //         for (const medication of medicationLogs) {
    //             await HealthRepository.createMedicationLog({
    //                 userId,
    //                 conversationId,
    //                 callLogId,
    //                 medicationId: medication.medicationId,
    //                 medicationTaken: medication.medicationTaken
    //             });
    //         }

    //         console.log('[HealthCheckHandler] Medication logs saved successfully:', {
    //             userId,
    //             conversationId,
    //             count: medicationLogs.length
    //         });
    //     } catch (error) {
    //         console.error('[HealthCheckHandler] Error saving medication logs:', error);
    //         throw error;
    //     }
    // }

    // static async saveHealthConditionLogs(userId: string, conversationId: string, healthConditionLogs: HealthConditionLogData[], callLogId?: string): Promise<void> {
    //     try {
    //         if (healthConditionLogs.length === 0) {
    //             console.log('[HealthCheckHandler] No health condition logs to save');
    //             return;
    //         }

    //         for (const condition of healthConditionLogs) {
    //             await HealthRepository.createHealthConditionLog({
    //                 userId,
    //                 conversationId,
    //                 callLogId,
    //                 healthConditionId: condition.healthConditionId,
    //                 symptoms: condition.symptoms,
    //                 notes: condition.notes
    //             });
    //         }

    //         console.log('[HealthCheckHandler] Health condition logs saved successfully:', {
    //             userId,
    //             conversationId,
    //             count: healthConditionLogs.length
    //         });
    //     } catch (error) {
    //         console.error('[HealthCheckHandler] Error saving health condition logs:', error);
    //         throw error;
    //     }
    // }

    // static async saveHealthCheckResults(userId: string, conversationId: string, parsedData: ParsedHealthCheckData, callLogId?: string): Promise<void> {
    //     try {
    //         await this.saveHealthLog(userId, conversationId, parsedData.healthLog, callLogId);
    //         await this.saveMedicationLogs(userId, conversationId, parsedData.medicationLogs, callLogId);
    //         await this.saveHealthConditionLogs(userId, conversationId, parsedData.healthConditionLogs, callLogId);

    //         console.log('[HealthCheckHandler] All health check results saved successfully');
    //     } catch (error) {
    //         console.error('[HealthCheckHandler] Error saving health check results:', error);
    //         throw error;
    //     }
    // }
}

import { HealthRepository } from '@naiber/shared-data';
import { MedicationSchedule } from '@naiber/shared-core';
import { Question, QuestionData, ScaleQuestion, BooleanQuestion, TextQuestion, ValidatedAnswer } from './questions/index.js';

type CallFrequency = 'DAILY' | 'WEEKLY';
type MedFrequencyClass = 'daily' | 'weekly' | 'infrequent' | 'prn';

function classifyMedFrequency(schedule: MedicationSchedule | null): MedFrequencyClass {
    if (!schedule || schedule.prn) return 'prn';
    if (schedule.timesPerDay) return 'daily';
    if (schedule.perWeek) return 'weekly';
    if (schedule.intervalDays && schedule.intervalDays >= 14) return 'infrequent';
    return 'daily';
}

function shouldAskMedQuestion(callFreq: CallFrequency, medFreq: MedFrequencyClass): boolean {
    if (medFreq === 'prn' || medFreq === 'infrequent') return false;
    if (callFreq === 'DAILY' && medFreq === 'weekly') return false;
    return true;
}

function buildMedQuestion(
    medName: string,
    medId: string,
    callFreq: CallFrequency,
    medFreq: MedFrequencyClass
): Question {
    if (callFreq === 'DAILY' || medFreq === 'weekly') {
        const text = callFreq === 'DAILY'
            ? `Have you taken your ${medName} today?`
            : `Did you take your ${medName} this week?`;
        return new BooleanQuestion(
            'medication_tracking',
            text,
            'medication',
            'Tracks daily medication adherence to ensure the user is following their prescribed treatment plan.',
            medId,
            undefined,
            undefined,
            'medication_adherence'
        );
    }
    // WEEKLY call + daily med → general adherence text question
    return new TextQuestion(
        'medication_tracking',
        `Have you been taking your ${medName} regularly this week?`,
        'medication',
        'General adherence check for a weekly call — captures how consistently the user has taken their daily medication.',
        false,
        medId,
        'medication_adherence'
    );
}

type LastHealthCheck = Awaited<ReturnType<typeof HealthRepository.getLastHealthCheckWithDetails>>;

function formatPreviousCallContext(lastCheck: LastHealthCheck): string | null {
    if (!lastCheck) return null;

    const date = lastCheck.createdAt.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });
    const lines: string[] = [`Previous health check (${date}):`];

    const wb = lastCheck.wellbeingLog;
    if (wb) {
        const scores: string[] = [];
        if (wb.overallWellbeing != null) scores.push(`Wellbeing: ${wb.overallWellbeing}/10`);
        if (wb.sleepQuality != null) scores.push(`Sleep: ${wb.sleepQuality}/10`);
        if (scores.length) lines.push(`- ${scores.join(', ')}`);
        if (wb.physicalSymptoms?.length) lines.push(`- Symptoms reported: ${wb.physicalSymptoms.join(', ')}`);
        if (wb.generalNotes) lines.push(`- Notes: ${wb.generalNotes}`);
    }

    if (lastCheck.conditionLogs?.length) {
        const summaries = lastCheck.conditionLogs.map(cl => {
            const change = cl.changeFromBaseline ? ` (${cl.changeFromBaseline})` : '';
            return `${cl.condition.condition}${change}`;
        });
        lines.push(`- Conditions: ${summaries.join(', ')}`);
    }

    if (lastCheck.medicationLogs?.length) {
        const summaries = lastCheck.medicationLogs.map(ml => {
            if (ml.adherenceContext === 'specific_date') {
                return `${ml.medication.name} ${ml.medicationTaken ? '✓' : '✗'}`;
            }
            return `${ml.medication.name} (${ml.adherenceRating ?? 'unknown'})`;
        });
        lines.push(`- Medications: ${summaries.join(', ')}`);
    }

    lines.push('Reference prior data when contextually relevant. Do not recite all of it — only surface what matters for the current question.');
    return lines.join('\n');
}

export interface InitializedHealthCheck {
    questions: Question[];
    previousCallContext: string | null;
}

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
    static async initializeHealthCheck(userId: string): Promise<InitializedHealthCheck> {
        const questions: Question[] = [];

        questions.push(
            new ScaleQuestion(
                "overall_wellbeing",
                "On a scale of 1-10, how are you feeling overall right now?",
                "general",
                "Helps understand the user's state of mind when they provided their other answers.",
                1, 10, undefined, 'wellbeing_score'
            )
        );

        questions.push(
            new TextQuestion(
                "physical_symptoms_assessment",
                "Are you experiencing any physical symptoms at the moment? (e.g., pain, nausea, dizziness)",
                "symptom",
                "Used to identify any physical issues or discomfort the user is feeling right now.",
                true, undefined, 'symptoms'
            )
        );

        questions.push(
            new ScaleQuestion(
                "sleep_assessment",
                "How would you rate your sleep last night from 1-10?",
                "general",
                "Helps determine how sleep quality might be affecting the user's energy or mood today.",
                1, 10, undefined, 'sleep_score'
            )
        );

        const [conditions, medications, callFrequency, lastHealthCheck] = await Promise.all([
            HealthRepository.findHealthConditionsByElderlyProfileId(userId),
            HealthRepository.findMedicationsByElderlyProfileId(userId),
            HealthRepository.getCallFrequency(userId),
            HealthRepository.getLastHealthCheckWithDetails(userId)
        ]);

        const activeConditions = conditions.filter(c => c.isActive);
        const activeMedications = medications.filter(m => m.isActive);

        for (const condition of activeConditions) {
            questions.push(
                new TextQuestion(
                    "health_condition",
                    `How has your ${condition.condition} been lately? Any changes or concerns?`,
                    "condition-specific",
                    "Tracks the status of a pre-existing condition to identify flare-ups or improvements over time.",
                    true,
                    condition.id,
                    'condition_status'
                )
            );
        }

        for (const medication of activeMedications) {
            const schedule = medication.frequency as MedicationSchedule | null;
            const medFreq = classifyMedFrequency(schedule);
            if (!shouldAskMedQuestion(callFrequency, medFreq)) continue;
            questions.push(buildMedQuestion(medication.name, medication.id, callFrequency, medFreq));
        }

        questions.push(
            new TextQuestion(
                "extra_notes",
                "Is there anything else about your health you'd like to mention before we finish?",
                "general",
                "Allows the user to raise anything not covered by the structured questions — acts as a natural closing.",
                true,
                undefined,
                'general_notes'
            )
        );

        return {
            questions,
            previousCallContext: formatPreviousCallContext(lastHealthCheck)
        };
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

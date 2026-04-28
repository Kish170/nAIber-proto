import { HealthRepository } from '@naiber/shared-data';
import { MedicationSchedule } from '@naiber/shared-core';
import { createDynamicQuestion } from './DynamicQuestionStore.js';
import type { DynamicQuestion } from './HealthCheckState.js';

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

type LastHealthCheck = Awaited<ReturnType<typeof HealthRepository.getLastHealthCheckWithDetails>>;
type HealthBaseline = Awaited<ReturnType<typeof HealthRepository.getHealthBaseline>>;

function formatPreviousCallContext(lastCheck: LastHealthCheck, baseline: HealthBaseline): string | null {
    if (!lastCheck && !baseline) return null;
    const sections: string[] = [];

    if (lastCheck) {
        const date = lastCheck.createdAt.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });
        const lines: string[] = [`Last call (${date}):`];
        const wb = lastCheck.wellbeingLog;
        if (wb) {
            const scores: string[] = [];
            if (wb.overallWellbeing != null) scores.push(`Wellbeing: ${wb.overallWellbeing}/10`);
            if (wb.sleepQuality != null) scores.push(`Sleep: ${wb.sleepQuality}/10`);
            if (scores.length) lines.push(`- ${scores.join(', ')}`);
            if (wb.physicalSymptoms?.length) lines.push(`- Symptoms: ${wb.physicalSymptoms.join(', ')}`);
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
            const summaries = lastCheck.medicationLogs.map(ml =>
                ml.adherenceContext === 'specific_date'
                    ? `${ml.medication.name} ${ml.medicationTaken ? '✓' : '✗'}`
                    : `${ml.medication.name} (${ml.adherenceRating ?? 'unknown'})`
            );
            lines.push(`- Medications: ${summaries.join(', ')}`);
        }
        sections.push(lines.join('\n'));
    }

    if (baseline && baseline.callsIncluded > 1) {
        const lines: string[] = [`Baseline (last ${baseline.callsIncluded} calls):`];
        const scores: string[] = [];
        if (baseline.avgWellbeing != null) scores.push(`Avg wellbeing: ${baseline.avgWellbeing}/10`);
        if (baseline.avgSleepQuality != null) scores.push(`Avg sleep: ${baseline.avgSleepQuality}/10`);
        if (scores.length) lines.push(`- ${scores.join(', ')}`);
        if (baseline.symptoms?.length) {
            const top = baseline.symptoms.slice(0, 3).map(s => `${s.symptom} (${s.count}x)`).join(', ');
            lines.push(`- Recurring symptoms: ${top}`);
        }
        if (baseline.medications?.length) {
            lines.push(`- Medication adherence: ${baseline.medications.map(m => `${m.medicationName} ${m.adherenceRate}%`).join(', ')}`);
        }
        sections.push(lines.join('\n'));
    }

    sections.push('Reference this when contextually relevant. Do not recite all of it — only surface what matters for the current question.');
    return sections.join('\n\n');
}

export interface InitializedHealthCheck {
    questions: DynamicQuestion[];
    previousCallContext: string | null;
}

export class HealthCheckHandler {
    static async initializeHealthCheck(userId: string): Promise<InitializedHealthCheck> {
        const questions: DynamicQuestion[] = [];

        questions.push(createDynamicQuestion('WELLBEING', "On a scale of 1-10, how are you feeling overall right now?", 'scale', 'seed'));
        questions.push(createDynamicQuestion('SYMPTOM', "Are you experiencing any physical symptoms at the moment? (e.g., pain, nausea, dizziness)", 'text', 'seed'));
        questions.push(createDynamicQuestion('SLEEP', "How would you rate your sleep last night from 1-10?", 'scale', 'seed'));

        const [conditions, medications, callFrequency, lastHealthCheck, baseline] = await Promise.all([
            HealthRepository.findHealthConditionsByElderlyProfileId(userId),
            HealthRepository.findMedicationsByElderlyProfileId(userId),
            HealthRepository.getCallFrequency(userId),
            HealthRepository.getLastHealthCheckWithDetails(userId),
            HealthRepository.getHealthBaseline(userId)
        ]);

        const activeConditions = conditions.filter(c => c.isActive);
        for (const condition of activeConditions) {
            questions.push(createDynamicQuestion(
                'CONDITION_STATUS',
                `How has your ${condition.condition} been lately? Any changes or concerns?`,
                'text',
                'seed',
                condition.condition
            ));
        }

        const isDaily = callFrequency === 'DAILY';
        const activeMeds = medications.filter(m => m.isActive).filter(m => {
            const medFreq = classifyMedFrequency(m.frequency as MedicationSchedule | null);
            return shouldAskMedQuestion(callFrequency, medFreq);
        });
        for (const med of activeMeds) {
            questions.push(createDynamicQuestion(
                'MEDICATION_ADHERENCE',
                isDaily
                    ? `Have you taken your ${med.name} today?`
                    : `Have you been taking your ${med.name} as prescribed this week?`,
                'boolean',
                'seed',
                med.name
            ));
        }

        questions.push(createDynamicQuestion('OTHER_HEALTH', "Is there anything else about your health you'd like to mention before we finish?", 'text', 'seed'));

        return {
            questions,
            previousCallContext: formatPreviousCallContext(lastHealthCheck, baseline)
        };
    }
}

import { StateGraph, END } from '@langchain/langgraph';
import { ChatOpenAI } from '@langchain/openai';
import { OpenAIClient } from '@naiber/shared-clients';
import { HealthRepository } from '@naiber/shared-data';
import {
    HealthPostCallState,
    HealthPostCallStateType,
    ParsedAnswer,
    WellbeingData,
    MedicationLogEntry,
    ConditionLogEntry
} from './HealthPostCallState.js';
import { HealthAnswerNormalizer } from '../silver/HealthAnswerNormalizer.js';
import type { ConditionSeverity, ConditionChangeStatus } from '../HealthTypes.js';


export class HealthPostCallGraph {
    private normalizer: HealthAnswerNormalizer;
    private compiledGraph: any;

    constructor(openAIClient: OpenAIClient) {
        const chatModel = openAIClient.returnChatModel() as ChatOpenAI;
        this.normalizer = new HealthAnswerNormalizer(chatModel);

        const graph: any = new StateGraph(HealthPostCallState);

        graph.addNode('parse_answers', this.parseAnswers.bind(this));
        graph.addNode('normalize_silver', this.normalizeSilver.bind(this));
        graph.addNode('persist_structured', this.persistStructured.bind(this));
        graph.addNode('update_baseline', this.updateBaseline.bind(this));

        graph.setEntryPoint('parse_answers');
        graph.addEdge('parse_answers', 'normalize_silver');
        graph.addEdge('normalize_silver', 'persist_structured');
        graph.addEdge('persist_structured', 'update_baseline');
        graph.addEdge('update_baseline', END);

        this.compiledGraph = graph.compile();
    }

    private parseAnswers(state: HealthPostCallStateType) {
        const answers = state.answers as ParsedAnswer[];

        const wellbeingData: WellbeingData = {
            overallWellbeing: null,
            sleepQuality: null,
            physicalSymptoms: [],
            generalNotes: null,
            concerns: [],
            positives: []
        };
        const medicationEntries: MedicationLogEntry[] = [];
        const conditionEntries: ConditionLogEntry[] = [];

        for (const a of answers) {
            if (!a.answer || a.answer === 'not answered') continue;

            switch (a.slot) {
                case 'wellbeing_score':
                    wellbeingData.overallWellbeing = parseInt(a.answer) || null;
                    break;

                case 'sleep_score':
                    wellbeingData.sleepQuality = parseInt(a.answer) || null;
                    break;

                case 'symptoms':
                    wellbeingData.physicalSymptoms = [a.answer];
                    break;

                case 'general_notes':
                    wellbeingData.generalNotes = a.answer;
                    break;

                case 'medication_adherence':
                    if (a.relatedTo) {
                        const isSpecific = a.type === 'boolean';
                        const callDate = state.callDate || new Date().toISOString();
                        if (isSpecific) {
                            medicationEntries.push({
                                medicationId: a.relatedTo,
                                adherenceContext: 'specific_date',
                                medicationTaken: a.answer.toLowerCase() === 'yes',
                                takenAt: callDate,
                                periodStart: null,
                                periodEnd: null,
                                adherenceRating: null
                            });
                        } else {
                            const end = new Date(callDate);
                            const start = new Date(end);
                            start.setDate(start.getDate() - 7);
                            medicationEntries.push({
                                medicationId: a.relatedTo,
                                adherenceContext: 'general_period',
                                medicationTaken: null,
                                takenAt: null,
                                periodStart: start.toISOString(),
                                periodEnd: end.toISOString(),
                                adherenceRating: a.answer
                            });
                        }
                    }
                    break;

                case 'condition_status':
                    if (a.relatedTo) {
                        conditionEntries.push({
                            conditionId: a.relatedTo,
                            rawNotes: a.answer,
                            symptoms: [],
                            severity: null,
                            changeFromBaseline: null,
                            notableFlags: []
                        });
                    }
                    break;
            }
        }

        console.log('[HealthPostCallGraph] parse_answers:', {
            userId: state.userId,
            medications: medicationEntries.length,
            conditions: conditionEntries.length,
            hasSymptoms: wellbeingData.physicalSymptoms.length > 0
        });

        return { wellbeingData, medicationEntries, conditionEntries };
    }

    private async normalizeSilver(state: HealthPostCallStateType) {
        const answers = state.answers as ParsedAnswer[];
        const enrichedConditions = [...state.conditionEntries];
        let physicalSymptoms: string[] = [...(state.wellbeingData?.physicalSymptoms ?? [])];

        const symptomAnswer = answers.find(a => a.slot === 'symptoms' && a.answer && a.answer !== 'not answered');
        if (symptomAnswer?.answer) {
            const result = await this.normalizer.normalizeSymptomReport(symptomAnswer.answer);
            if (!result.no_symptoms) {
                physicalSymptoms = result.symptoms;
            } else {
                physicalSymptoms = [];
            }
        }

        for (let i = 0; i < enrichedConditions.length; i++) {
            const entry = enrichedConditions[i];
            if (!entry.rawNotes) continue;

            const conditionAnswer = answers.find(
                a => a.slot === 'condition_status' && a.relatedTo === entry.conditionId
            );
            const conditionName = conditionAnswer
                ? conditionAnswer.question.replace(/How has your (.+?) been lately.*/, '$1')
                : 'condition';

            const result = await this.normalizer.normalizeConditionNote(conditionName, entry.rawNotes);
            enrichedConditions[i] = {
                ...entry,
                symptoms: result.symptoms_mentioned,
                severity: result.severity,
                changeFromBaseline: result.change_from_baseline,
                notableFlags: result.notable_flags
            };
        }

        let concerns: string[] = [];
        let positives: string[] = [];
        const notesAnswer = answers.find(a => a.slot === 'general_notes' && a.answer && a.answer !== 'not answered');
        let generalNotes = state.wellbeingData?.generalNotes ?? null;
        if (notesAnswer?.answer) {
            const result = await this.normalizer.normalizeGeneralNotes(notesAnswer.answer);
            if (!result.no_additional_notes) {
                concerns = result.concerns;
                positives = result.positives;
            } else {
                generalNotes = null;
            }
        }

        const wellbeingData = state.wellbeingData
            ? { ...state.wellbeingData, physicalSymptoms, generalNotes, concerns, positives }
            : null;

        console.log('[HealthPostCallGraph] normalize_silver:', {
            userId: state.userId,
            symptomsExtracted: physicalSymptoms.length,
            conditionsEnriched: enrichedConditions.filter(c => c.severity !== null).length
        });

        return { conditionEntries: enrichedConditions, wellbeingData };
    }

    private async persistStructured(state: HealthPostCallStateType) {
        try {
            const healthCheckLog = await HealthRepository.createHealthCheckLog({
                elderlyProfileId: state.userId,
                conversationId: state.conversationId,
                answers: state.answers
            });

            const logId = healthCheckLog.id;

            if (state.wellbeingData) {
                await HealthRepository.createWellbeingLog({
                    healthCheckLogId: logId,
                    elderlyProfileId: state.userId,
                    conversationId: state.conversationId,
                    overallWellbeing: state.wellbeingData.overallWellbeing,
                    sleepQuality: state.wellbeingData.sleepQuality,
                    physicalSymptoms: state.wellbeingData.physicalSymptoms,
                    generalNotes: state.wellbeingData.generalNotes,
                    concerns: state.wellbeingData.concerns,
                    positives: state.wellbeingData.positives
                });
            }

            for (const entry of state.medicationEntries) {
                await HealthRepository.createMedicationLog({
                    healthCheckLogId: logId,
                    elderlyProfileId: state.userId,
                    conversationId: state.conversationId,
                    medicationId: entry.medicationId,
                    adherenceContext: entry.adherenceContext,
                    medicationTaken: entry.medicationTaken,
                    takenAt: entry.takenAt ? new Date(entry.takenAt) : null,
                    periodStart: entry.periodStart ? new Date(entry.periodStart) : null,
                    periodEnd: entry.periodEnd ? new Date(entry.periodEnd) : null,
                    adherenceRating: entry.adherenceRating
                });
            }

            for (const entry of state.conditionEntries) {
                await HealthRepository.createHealthConditionLog({
                    healthCheckLogId: logId,
                    elderlyProfileId: state.userId,
                    conversationId: state.conversationId,
                    conditionId: entry.conditionId,
                    rawNotes: entry.rawNotes,
                    symptoms: entry.symptoms,
                    severity: entry.severity,
                    changeFromBaseline: entry.changeFromBaseline,
                    notableFlags: entry.notableFlags
                });
            }

            console.log('[HealthPostCallGraph] persist_structured complete:', {
                userId: state.userId,
                conversationId: state.conversationId,
                healthCheckLogId: logId,
                medicationLogs: state.medicationEntries.length,
                conditionLogs: state.conditionEntries.length
            });

            return {};
        } catch (err: any) {
            console.error('[HealthPostCallGraph] persist_structured failed:', err);
            return { error: err.message ?? 'Unknown error' };
        }
    }

    private async updateBaseline(state: HealthPostCallStateType) {
        try {
            const recentChecks = await HealthRepository.findRecentHealthChecksWithDetails(state.userId, 10);
            if (!recentChecks.length) return {};

            const wellbeingScores = recentChecks.map(c => c.wellbeingLog?.overallWellbeing).filter((v): v is number => v != null);
            const sleepScores = recentChecks.map(c => c.wellbeingLog?.sleepQuality).filter((v): v is number => v != null);
            const avgWellbeing = wellbeingScores.length ? wellbeingScores.reduce((a, b) => a + b, 0) / wellbeingScores.length : null;
            const avgSleepQuality = sleepScores.length ? sleepScores.reduce((a, b) => a + b, 0) / sleepScores.length : null;

            const symptomCounts = new Map<string, number>();
            for (const check of recentChecks) {
                for (const symptom of check.wellbeingLog?.physicalSymptoms ?? []) {
                    const normalized = symptom.toLowerCase().trim();
                    if (normalized) symptomCounts.set(normalized, (symptomCounts.get(normalized) ?? 0) + 1);
                }
            }
            const symptoms = Array.from(symptomCounts.entries())
                .map(([symptom, count]) => ({ symptom, count }))
                .sort((a, b) => b.count - a.count);

            const medMap = new Map<string, { name: string; taken: number; total: number }>();
            for (const check of recentChecks) {
                for (const ml of check.medicationLogs) {
                    const entry = medMap.get(ml.medication.id) ?? { name: ml.medication.name, taken: 0, total: 0 };
                    entry.total++;
                    if (ml.adherenceContext === 'specific_date') {
                        if (ml.medicationTaken === true) entry.taken++;
                    } else {
                        if (ml.adherenceRating === 'always' || ml.adherenceRating === 'mostly') entry.taken++;
                    }
                    medMap.set(ml.medication.id, entry);
                }
            }
            const medications = Array.from(medMap.entries()).map(([medicationId, data]) => ({
                medicationId,
                medicationName: data.name,
                takenCount: data.taken,
                totalCount: data.total,
                adherenceRate: data.total > 0 ? Math.round((data.taken / data.total) * 100) : 0
            }));

            const conditionMap = new Map<string, { name: string; severity: string | null; change: string | null }>();
            for (const check of recentChecks) {
                for (const cl of check.conditionLogs) {
                    conditionMap.set(cl.condition.id, {
                        name: cl.condition.condition,
                        severity: cl.severity,
                        change: cl.changeFromBaseline
                    });
                }
            }
            const conditions = Array.from(conditionMap.entries()).map(([conditionId, data]) => ({
                conditionId,
                conditionName: data.name,
                latestSeverity: mapSeverity(data.severity),
                latestChange: mapChange(data.change)
            }));

            await HealthRepository.upsertHealthBaseline(state.userId, {
                callsIncluded: recentChecks.length,
                avgWellbeing: avgWellbeing != null ? Math.round(avgWellbeing * 10) / 10 : null,
                avgSleepQuality: avgSleepQuality != null ? Math.round(avgSleepQuality * 10) / 10 : null,
                symptoms,
                medications,
                conditions
            });

            console.log('[HealthPostCallGraph] update_baseline complete:', {
                userId: state.userId,
                callsIncluded: recentChecks.length,
                avgWellbeing,
                avgSleepQuality
            });
        } catch (err: any) {
            console.error('[HealthPostCallGraph] update_baseline failed (non-fatal):', err);
        }
        return {};
    }

    compile() {
        return this.compiledGraph;
    }
}

function mapSeverity(s: string | null): ConditionSeverity | null {
    if (!s) return null;
    const upper = s.toUpperCase();
    if (upper === 'MILD' || upper === 'MODERATE' || upper === 'SEVERE') return upper as ConditionSeverity;
    return 'UNKNOWN';
}

function mapChange(c: string | null): ConditionChangeStatus | null {
    if (!c) return null;
    const upper = c.toUpperCase();
    if (upper === 'IMPROVED' || upper === 'STABLE' || upper === 'WORSE') return upper as ConditionChangeStatus;
    return 'UNKNOWN';
}
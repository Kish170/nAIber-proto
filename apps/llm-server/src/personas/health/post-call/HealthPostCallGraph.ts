import { StateGraph, END } from '@langchain/langgraph';
import { ChatOpenAI } from '@langchain/openai';
import { OpenAIClient } from '@naiber/shared-clients';
import { HealthRepository, ConversationRepository, HealthCallOpeningRepository } from '@naiber/shared-data';
import {
    HealthPostCallState,
    HealthPostCallStateType,
    ParsedAnswer,
    WellbeingData,
    MedicationLogEntry,
    ConditionLogEntry
} from './HealthPostCallState.js';
import { HealthAnswerNormalizer } from '../silver/HealthAnswerNormalizer.js';
import { AnswerExtractor } from '../validation/AnswerExtractor.js';
import type { ConditionSeverity, ConditionChangeStatus } from '../HealthTypes.js';
import type { CompletedWindow } from '../HealthCheckState.js';

export class HealthPostCallGraph {
    private normalizer: HealthAnswerNormalizer;
    private answerExtractor: AnswerExtractor;
    private compiledGraph: any;

    constructor(openAIClient: OpenAIClient) {
        const chatModel = openAIClient.returnChatModel() as ChatOpenAI;
        this.normalizer = new HealthAnswerNormalizer(chatModel);
        this.answerExtractor = new AnswerExtractor(chatModel);

        const graph: any = new StateGraph(HealthPostCallState);

        graph.addNode('extract_from_windows', this.extractFromWindows.bind(this));
        graph.addNode('parse_answers', this.parseAnswers.bind(this));
        graph.addNode('normalize_silver', this.normalizeSilver.bind(this));
        graph.addNode('persist_opening', this.persistOpening.bind(this));
        graph.addNode('persist_structured', this.persistStructured.bind(this));
        graph.addNode('update_baseline', this.updateBaseline.bind(this));

        graph.setEntryPoint('extract_from_windows');
        graph.addEdge('extract_from_windows', 'parse_answers');
        graph.addEdge('parse_answers', 'normalize_silver');
        graph.addEdge('normalize_silver', 'persist_structured');
        graph.addEdge('persist_structured', 'persist_opening');
        graph.addEdge('persist_opening', 'update_baseline');
        graph.addEdge('update_baseline', END);

        this.compiledGraph = graph.compile();
    }

    private async extractFromWindows(state: HealthPostCallStateType) {
        const windows: CompletedWindow[] = state.completedWindows ?? [];

        if (!windows.length) {
            console.log('[HealthPostCallGraph] extract_from_windows: no completed windows found');
            return { answers: [] };
        }

        const answers: ParsedAnswer[] = [];

        for (const window of windows) {
            const baseAnswer: Omit<ParsedAnswer, 'answer' | 'isValid'> = {
                id: window.question.id,
                question: window.question.questionText,
                topic: window.question.topic,
                type: window.question.questionType,
                relatedTo: window.question.relatedTo ?? null,
                slot: topicToSlot(window.question.topic),
                windowId: window.windowId
            };

            if (window.disposition === 'refused' || window.disposition === 'skipped') {
                answers.push({ ...baseAnswer, answer: null, isValid: false });
                continue;
            }

            const transcript = window.messages
                .map((m: any) => {
                    const isHuman = m._getType?.() === 'human' || m.constructor?.name === 'HumanMessage';
                    const role = isHuman ? 'Elder' : 'Assistant';
                    const content = typeof m.content === 'string' ? m.content : JSON.stringify(m.content);
                    return `${role}: ${content}`;
                })
                .join('\n');

            if (!transcript.trim()) {
                answers.push({ ...baseAnswer, answer: null, isValid: false });
                continue;
            }

            const questionData = {
                id: window.question.id,
                question: window.question.questionText,
                type: window.question.questionType,
                category: topicToCategory(window.question.topic),
                context: '',
                validation: '',
                relatedTo: window.question.relatedTo,
                slot: topicToSlot(window.question.topic)
            };

            try {
                const extraction = await this.answerExtractor.extract(questionData as any, transcript);
                answers.push({
                    ...baseAnswer,
                    answer: extraction.method !== 'not-extractable' ? extraction.value : null,
                    isValid: extraction.method !== 'not-extractable'
                });
            } catch {
                answers.push({ ...baseAnswer, answer: null, isValid: false });
            }
        }

        console.log(`[HealthPostCallGraph] extract_from_windows: ${answers.filter(a => a.isValid).length}/${answers.length} answers extracted`);
        return { answers };
    }

    private parseAnswers(state: HealthPostCallStateType) {
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

        for (const a of state.answers) {
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
                    wellbeingData.generalNotes = wellbeingData.generalNotes
                        ? `${wellbeingData.generalNotes}\n${a.answer}`
                        : a.answer;
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
                                periodStart: null, periodEnd: null, adherenceRating: null
                            });
                        } else {
                            const end = new Date(callDate);
                            const start = new Date(end);
                            start.setDate(start.getDate() - 7);
                            medicationEntries.push({
                                medicationId: a.relatedTo,
                                adherenceContext: 'general_period',
                                medicationTaken: null, takenAt: null,
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
                            symptoms: [], severity: null, changeFromBaseline: null, notableFlags: []
                        });
                    }
                    break;
            }
        }

        console.log('[HealthPostCallGraph] parse_answers:', {
            userId: state.userId,
            medications: medicationEntries.length,
            conditions: conditionEntries.length
        });

        return { wellbeingData, medicationEntries, conditionEntries };
    }

    private async normalizeSilver(state: HealthPostCallStateType) {
        const enrichedConditions = [...state.conditionEntries];
        let physicalSymptoms = [...(state.wellbeingData?.physicalSymptoms ?? [])];

        const symptomAnswer = state.answers.find((a: ParsedAnswer) => a.slot === 'symptoms' && a.answer);
        if (symptomAnswer?.answer) {
            const result = await this.normalizer.normalizeSymptomReport(symptomAnswer.answer);
            physicalSymptoms = result.no_symptoms ? [] : result.symptoms;
        }

        for (let i = 0; i < enrichedConditions.length; i++) {
            const entry = enrichedConditions[i];
            if (!entry.rawNotes) continue;
            const conditionAnswer = state.answers.find((a: ParsedAnswer) => a.slot === 'condition_status' && a.relatedTo === entry.conditionId);
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
        const notesAnswer = state.answers.find((a: ParsedAnswer) => a.slot === 'general_notes' && a.answer);
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

    private async persistOpening(state: HealthPostCallStateType) {
        if (!state.openingSentiment || !state.openingDisposition || !state.callLogId) {
            console.log('[HealthPostCallGraph] persist_opening: incomplete opening data, skipping');
            return {};
        }
        try {
            await HealthCallOpeningRepository.createHealthCallOpening({
                callLogId: state.callLogId,
                sentiment: state.openingSentiment,
                statedConcern: state.openingConcern,
                disposition: state.openingDisposition,
                endReason: state.openingEndReason
            });
            console.log('[HealthPostCallGraph] persist_opening:', {
                disposition: state.openingDisposition,
                sentiment: state.openingSentiment
            });
        } catch (err: any) {
            console.error('[HealthPostCallGraph] persist_opening failed (non-fatal):', err.message);
        }
        return {};
    }

    private async persistStructured(state: HealthPostCallStateType) {
        try {
            const callDate = state.callDate ? new Date(state.callDate) : new Date();

            const callLog = await ConversationRepository.createCallLog({
                elderlyProfileId: state.userId,
                elevenlabsConversationId: state.conversationId,
                callType: 'HEALTH_CHECK',
                scheduledTime: callDate,
                endTime: new Date(),
                status: 'COMPLETED',
                outcome: 'COMPLETED',
                checkInCompleted: state.openingDisposition !== 'ENDED_NOT_READY',
            });

            const healthCheckLog = await HealthRepository.createHealthCheckLog({
                elderlyProfileId: state.userId,
                conversationId: state.conversationId,
                callLogId: callLog.id,
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
                callLogId: callLog.id,
                healthCheckLogId: logId,
                medications: state.medicationEntries.length,
                conditions: state.conditionEntries.length
            });
            return { callLogId: callLog.id };
        } catch (err: any) {
            console.error('[HealthPostCallGraph] persist_structured failed:', err);
            return { error: err.message ?? 'Unknown error' };
        }
    }

    private async updateBaseline(state: HealthPostCallStateType) {
        if (state.openingDisposition === 'ENDED_NOT_READY') {
            console.log('[HealthPostCallGraph] update_baseline: skipped (call ended before check-in)');
            return {};
        }
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
                    const s = symptom.toLowerCase().trim();
                    if (s) symptomCounts.set(s, (symptomCounts.get(s) ?? 0) + 1);
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
                    if (ml.adherenceContext === 'specific_date' && ml.medicationTaken === true) entry.taken++;
                    else if (ml.adherenceRating === 'always' || ml.adherenceRating === 'mostly') entry.taken++;
                    medMap.set(ml.medication.id, entry);
                }
            }
            const medications = Array.from(medMap.entries()).map(([medicationId, data]) => ({
                medicationId, medicationName: data.name, takenCount: data.taken, totalCount: data.total,
                adherenceRate: data.total > 0 ? Math.round((data.taken / data.total) * 100) : 0
            }));

            const conditionMap = new Map<string, { name: string; severity: string | null; change: string | null }>();
            for (const check of recentChecks) {
                for (const cl of check.conditionLogs) {
                    conditionMap.set(cl.condition.id, { name: cl.condition.condition, severity: cl.severity, change: cl.changeFromBaseline });
                }
            }
            const conditions = Array.from(conditionMap.entries()).map(([conditionId, data]) => ({
                conditionId, conditionName: data.name,
                latestSeverity: mapSeverity(data.severity),
                latestChange: mapChange(data.change)
            }));

            await HealthRepository.upsertHealthBaseline(state.userId, {
                callsIncluded: recentChecks.length,
                avgWellbeing: avgWellbeing != null ? Math.round(avgWellbeing * 10) / 10 : null,
                avgSleepQuality: avgSleepQuality != null ? Math.round(avgSleepQuality * 10) / 10 : null,
                symptoms, medications, conditions
            });

            console.log('[HealthPostCallGraph] update_baseline complete:', { userId: state.userId, callsIncluded: recentChecks.length });
        } catch (err: any) {
            console.error('[HealthPostCallGraph] update_baseline failed (non-fatal):', err);
        }
        return {};
    }

    compile() {
        return this.compiledGraph;
    }
}

function topicToSlot(topic: string): string | null {
    const map: Record<string, string> = {
        WELLBEING: 'wellbeing_score',
        SLEEP: 'sleep_score',
        SYMPTOM: 'symptoms',
        PAIN: 'symptoms',
        MOBILITY: 'symptoms',
        MEDICATION_ADHERENCE: 'medication_adherence',
        CONDITION_STATUS: 'condition_status',
        MOOD: 'general_notes',
        APPETITE: 'general_notes',
        COGNITION_SELF_REPORT: 'general_notes',
        MEDICATION_SIDE_EFFECT: 'general_notes',
        OTHER_HEALTH: 'general_notes',
    };
    return map[topic] ?? null;
}

function topicToCategory(topic: string): string {
    if (topic === 'MEDICATION_ADHERENCE') return 'medication';
    if (topic === 'CONDITION_STATUS') return 'condition-specific';
    if (topic === 'SYMPTOM' || topic === 'PAIN' || topic === 'MOBILITY') return 'symptom';
    return 'general';
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
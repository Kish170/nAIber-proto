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

        graph.setEntryPoint('parse_answers');
        graph.addEdge('parse_answers', 'normalize_silver');
        graph.addEdge('normalize_silver', 'persist_structured');
        graph.addEdge('persist_structured', END);

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
                        medicationEntries.push({
                            medicationId: a.relatedTo,
                            medicationTaken: a.answer.toLowerCase() === 'yes'
                        });
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
                    medicationTaken: entry.medicationTaken
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

    compile() {
        return this.compiledGraph;
    }
}
import { BaseMessage, SystemMessage, HumanMessage } from "@langchain/core/messages";
import type { HealthCheckStateType, DynamicQuestion, OpeningPhase, CompletedQuestion } from "./HealthCheckState.js";

export class QuestionContextBuilder {

    buildOpening(phase: OpeningPhase, previousCallContext?: string): { systemPrompt: string; messageWindowSize: number } {
        let ctx = `You are conducting a health check-in with an elderly person.\n\n`;

        if (previousCallContext) {
            ctx += `## Previous Visit Context\n${previousCallContext}\n`;
            ctx += `Reference this when relevant — do not recite it verbatim.\n\n`;
        }

        switch (phase) {
            case 'greeting':
            case 'wellbeing_asked':
                ctx += `## Opening\nAsk warmly: "How are you doing today?" — one sentence, conversational. Do not start the health questions yet.`;
                return { systemPrompt: ctx, messageWindowSize: 0 };

            case 'poorly_probing':
                ctx += `## Wellbeing Concern\nThe elder indicated they are not feeling well. Gently probe: "I'm sorry to hear that — what's been going on?" — warm, brief, one question. Do not suggest diagnoses or advice.`;
                return { systemPrompt: ctx, messageWindowSize: 4 };

            case 'ready_check':
                ctx += `## Ready Check\nAsk warmly if they are ready to begin the health check-in. One sentence — e.g. "Shall we go ahead with the health check-in, or would you prefer to leave it for today?"`;
                return { systemPrompt: ctx, messageWindowSize: 4 };

            default:
                ctx += `## Opening\nAsk warmly how they are doing today.`;
                return { systemPrompt: ctx, messageWindowSize: 4 };
        }
    }

    buildConversation(
        question: DynamicQuestion,
        state: HealthCheckStateType,
        mode: 'ask' | 'sub_question' | 'tangent_redirect'
    ): { systemPrompt: string; messageWindowSize: number } {
        const total = state.pendingQuestions.length + state.completedQuestions.length + 1;
        const done = state.completedQuestions.length;

        let ctx = `You are conducting a health check-in with an elderly person.\n`;
        ctx += `Progress: ${done} of approximately ${total} topics covered.\n\n`;

        if (state.previousCallContext) {
            ctx += `## Previous Visit Context\n${state.previousCallContext}\n`;
            ctx += `Reference only when directly relevant to the current topic.\n\n`;
        }

        if (state.completedQuestions.length > 0) {
            ctx += `## Topics Covered So Far\n`;
            state.completedQuestions.slice(-3).forEach((c: CompletedQuestion) => {
                ctx += `- ${c.question.questionText} (${c.disposition})\n`;
            });
            ctx += `\n`;
        }

        if (state.currentWindowMessages.length > 0) {
            ctx += `## Current Topic Window\nConversation so far on "${question.questionText}":\n`;
            for (const msg of state.currentWindowMessages) {
                const role = msg instanceof HumanMessage ? 'Elder' : 'You';
                const content = typeof msg.content === 'string'
                    ? msg.content
                    : JSON.stringify(msg.content);
                ctx += `${role}: ${content}\n`;
            }
            ctx += `\n`;
        }

        switch (mode) {
            case 'ask':
                ctx += this.buildAskContext(question, state.subQuestionCount);
                break;
            case 'sub_question':
                ctx += this.buildSubQuestionContext(question, state.subQuestionCount);
                break;
            case 'tangent_redirect':
                ctx += `## Tangent Redirect\nThe elder went off-topic. Gently acknowledge and redirect back to the health check-in in one warm sentence. Do not re-ask the current question yet — just bring them back.`;
                break;
        }

        ctx += `\n\nBe warm, patient, and conversational throughout.`;
        return {
            systemPrompt: ctx,
            messageWindowSize: this.windowSize(mode, state.subQuestionCount)
        };
    }

    private buildAskContext(question: DynamicQuestion, subCount: number): string {
        if (subCount > 0) {
            return (
                `## Current Question (continuing)\n` +
                `Topic: ${question.topic}\n` +
                `Original question: "${question.questionText}"\n\n` +
                `Based on what the elder has said so far (see Current Topic Window above), ` +
                `ask ONE brief, neutral follow-up question to capture more useful detail. ` +
                `Do not re-ask the original question. Max 20 words.`
            );
        }

        let ctx = `## Current Question\nTopic: ${question.topic}\nType: ${question.questionType}\n\n`;

        if (question.questionType === 'boolean' || question.topic === 'MEDICATION_ADHERENCE') {
            ctx += `Ask EXACTLY the following question — do not add context or combine with other questions:\n`;
        } else {
            ctx += `Ask the following question in a warm, conversational way:\n`;
        }

        ctx += `"${question.questionText}"\n`;

        if (question.questionType === 'scale') {
            ctx += `\nExpect a number from 1–10.`;
        }
        if (question.source === 'tangent_created' || question.source === 'tangent_merged') {
            ctx += `\nThis topic came up earlier in the conversation — acknowledge that naturally before asking.`;
        }

        return ctx;
    }

    private buildSubQuestionContext(question: DynamicQuestion, subCount: number): string {
        if (subCount === 1) {
            return (
                `## Follow-up Probe\n` +
                `Topic: ${question.topic}\n` +
                `You have just collected an initial response about: "${question.questionText}".\n\n` +
                `Ask one brief, open-ended follow-up question that naturally invites the elder to share more if they have it. ` +
                `Do NOT suggest they should move on or that they are done — let them decide. ` +
                `Do NOT re-ask the original question. Focus on something they touched on or left vague. ` +
                `Max 15 words.`
            );
        }
        return (
            `## Sub-question (depth ${subCount})\n` +
            `Topic: ${question.topic}\n` +
            `Original question: "${question.questionText}"\n\n` +
            `The elder has more to say on this topic. Ask ONE brief, neutral follow-up question ` +
            `that captures more useful health detail. Do not diagnose, advise, or interpret severity. ` +
            `If the elder signals they are done, acknowledge and move on. Max 20 words.`
        );
    }

    buildEndNotReady(endReason?: string): { systemPrompt: string; messageWindowSize: number } {
        const ctx =
            `You are ending a health check-in call because the elder indicated they are not ready today.\n` +
            (endReason ? `Their reason: "${endReason}"\n\n` : '\n') +
            `Write a warm, brief closing (1-2 sentences). Acknowledge their preference, wish them well, and say goodbye. ` +
            `Do not express disappointment. Do not mention rescheduling unless they brought it up.`;
        return { systemPrompt: ctx, messageWindowSize: 6 };
    }

    buildFinalize(completedCount: number): { systemPrompt: string; messageWindowSize: number } {
        const ctx =
            `You are closing a health check-in call with an elderly person.\n` +
            `${completedCount} health topic${completedCount !== 1 ? 's were' : ' was'} covered.\n\n` +
            `Write a warm 1-2 sentence closing. Briefly acknowledge the check-in is done, thank them, and say goodbye. ` +
            `Max 30 words. No lists or bullet points.`;
        return { systemPrompt: ctx, messageWindowSize: 6 };
    }

    filterMessages(messages: BaseMessage[], windowSize: number): BaseMessage[] {
        return messages
            .filter((m: BaseMessage) => !(m instanceof SystemMessage))
            .slice(-windowSize);
    }

    private windowSize(mode: string, subCount: number): number {
        if (mode === 'ask' && subCount === 0) return 4;
        if (mode === 'sub_question') return Math.min(4 + subCount * 2, 12);
        return 6;
    }
}
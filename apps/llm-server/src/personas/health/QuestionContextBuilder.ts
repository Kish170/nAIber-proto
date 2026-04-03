import { BaseMessage, SystemMessage } from "@langchain/core/messages";
import { HealthCheckStateType, AgentDecision, HealthCheckAnswer } from "./HealthCheckState.js";
import { QuestionData } from "./questions/index.js";

export class QuestionContextBuilder {

    build(
        question: QuestionData,
        state: HealthCheckStateType
    ): { systemPrompt: string; messageWindowSize: number } {
        const decision = state.currentDecision;
        const messageWindowSize = this.resolveMessageWindowSize(decision, state.questionAttempts);

        let ctx = `You are conducting a health check-in with an elderly patient.\n`;
        ctx += `Progress: Question ${state.currentQuestionIndex + 1} of ${state.healthCheckQuestions.length}.\n\n`;

        if (state.previousCallContext) {
            ctx += `## Previous Visit Context\n${state.previousCallContext}\n`;
            ctx += `Use this when directly relevant. Reference prior data naturally — do not recite the full list.\n\n`;
        }

        const validAnswers = state.healthCheckAnswers.filter(a => a.isValid);
        if (validAnswers.length > 0) {
            ctx += `## Recorded Responses So Far\n`;
            validAnswers.forEach(a => {
                ctx += `- ${a.question.question}: ${a.validatedAnswer}\n`;
            });
            ctx += `\n`;
        }

        ctx += decision
            ? this.buildDecisionContext(question, state, decision)
            : this.buildStandardQuestion(question);

        ctx += `\nBe warm, empathetic, and conversational throughout.`;

        return { systemPrompt: ctx, messageWindowSize };
    }

    private buildDecisionContext(
        question: QuestionData,
        state: HealthCheckStateType,
        decision: AgentDecision
    ): string {
        switch (decision.action) {
            case 'next':
            case 'skip':
                return this.buildNextContext(question, state);
            case 'followup':
                return this.buildFollowUpContext(question, state, decision);
            case 'confirm':
                return this.buildConfirmContext(state, decision);
            case 'retry':
                return this.buildRetryContext(question, state);
            case 'wrap_up':
                return this.buildWrapUpContext(question, state);
        }
    }

    private buildNextContext(question: QuestionData, state: HealthCheckStateType): string {
        const lastValid = [...state.healthCheckAnswers].reverse().find(a => a.isValid);

        if (!lastValid || lastValid.question.type !== 'boolean') {
            return this.buildStandardQuestion(question);
        }

        let ctx = `## Transition\n`;
        ctx += `Briefly and warmly acknowledge their answer in one short phrase (e.g., "Good to know" / "Got it"), then ask:\n\n`;
        ctx += this.buildStandardQuestion(question);
        return ctx;
    }

    private buildFollowUpContext(
        question: QuestionData,
        state: HealthCheckStateType,
        decision: AgentDecision
    ): string {
        const parentAnswer = this.findParentAnswer(question, state);

        let ctx = `## Follow-up Question\n`;
        if (parentAnswer) {
            ctx += `The patient was asked: "${parentAnswer.question.question}"\n`;
            ctx += `They answered: "${parentAnswer.rawAnswer}"\n`;
            ctx += `This triggered a follow-up because: ${decision.reasoning}\n\n`;
        } else {
            ctx += `Reason for follow-up: ${decision.reasoning}\n\n`;
        }
        ctx += `Ask ONLY the following follow-up question in a warm, natural way:\n`;
        ctx += `"${question.question}"\n\n`;
        ctx += `Do not re-ask the original question. Do not explain that it's a follow-up.\n`;
        return ctx;
    }

    private buildConfirmContext(state: HealthCheckStateType, decision: AgentDecision): string {
        return (
            `## Confirmation Needed\n` +
            `The patient said: "${state.rawAnswer}"\n` +
            `This was interpreted as: "${Object.values(decision.extractedSlots)[0]}"\n` +
            `Confidence was low (${decision.confidence.toFixed(2)}), so we need to verify before recording.\n\n` +
            `Ask ONLY: "${decision.confirmQuestion}"\n\n` +
            `If they confirm → you can move on. If they correct it → note the correction.\n` +
            `Keep it very brief. Do not re-ask the original question.\n`
        );
    }

    private buildRetryContext(question: QuestionData, state: HealthCheckStateType): string {
        const previousAnswer = state.rawAnswer;

        if (state.pendingClarification && state.clarificationContext) {
            return (
                `## Clarification Request\n` +
                `The patient asked: "${state.clarificationContext}"\n\n` +
                `First, answer their question briefly and warmly (1–2 sentences).\n` +
                `Then gently re-ask:\n` +
                `"${question.question}"\n`
            );
        }

        const formatHint = this.getFormatHint(question);
        return (
            `## Retry Needed\n` +
            `The patient said: "${previousAnswer}"\n` +
            `This could not be recorded as a valid answer for this question.\n\n` +
            `${formatHint}\n\n` +
            `Gently clarify what format you need and re-ask:\n` +
            `"${question.question}"\n\n` +
            `Be understanding — do not make them feel they answered incorrectly. Keep it brief.\n`
        );
    }

    private buildWrapUpContext(question: QuestionData, state: HealthCheckStateType): string {
        const patientSaid = state.rawAnswer;

        let ctx = `## Wrap-up Check\n`;
        if (patientSaid) {
            ctx += `The patient was just asked: "${question.question}"\n`;
            ctx += `They said: "${patientSaid}"\n\n`;
        } else {
            ctx += `The patient has been discussing "${question.question}".\n\n`;
        }
        ctx += `Gently check if they have anything to add before moving on.\n`;
        ctx += `Ask in one warm, brief sentence — for example: "Is there anything else you'd like to share about that, or shall we move on?"\n`;
        ctx += `Do not re-ask the original question. Keep it natural and unhurried.\n`;
        return ctx;
    }

    private buildStandardQuestion(question: QuestionData): string {
        let ctx = `## Current Question\n`;
        ctx += `Type: ${question.type}\n`;
        ctx += `Category: ${question.category}\n`;

        if (question.type === 'scale') {
            ctx += `Scale range: ${(question as any).min ?? 1}–${(question as any).max ?? 10}\n`;
        }

        if (question.type === 'boolean' || question.category === 'medication') {
            ctx += `\nAsk EXACTLY the following question. Do not add context about other medications,`;
            ctx += ` combine it with other questions, or introduce any new health topics:\n`;
        } else {
            ctx += `\nAsk the following question in a warm, conversational way:\n`;
        }

        ctx += `"${question.question}"\n`;
        return ctx;
    }

    private findParentAnswer(question: QuestionData, state: HealthCheckStateType): HealthCheckAnswer | undefined {
        const match = question.id.match(/^follow_up_(\d+)_/);
        if (!match) return undefined;
        const parentIndex = parseInt(match[1], 10);
        return state.healthCheckAnswers.find(a => a.questionIndex === parentIndex);
    }

    private getFormatHint(question: QuestionData): string {
        if (question.type === 'scale') {
            return `Expected: a number from ${(question as any).min ?? 1} to ${(question as any).max ?? 10} (e.g., "7" or "about a 6").`;
        }
        if (question.type === 'boolean') {
            return `Expected: a yes or no answer (e.g., "yes", "I did", "no, not today").`;
        }
        return `Expected: a brief description in your own words.`;
    }

    private resolveMessageWindowSize(decision: AgentDecision | null, questionAttempts: number): number {
        if (!decision || decision.action === 'next' || decision.action === 'skip') {
            return 4;
        }

        if (decision.action === 'retry' || decision.action === 'confirm') {
            return Math.min(4 + questionAttempts * 2, 12);
        }

        if (decision.action === 'followup' || decision.action === 'wrap_up') {
            return Math.min(6 + questionAttempts * 2, 12);
        }
        return 4;
    }

    filterMessages(messages: BaseMessage[], windowSize: number): BaseMessage[] {
        return messages
            .filter(m => !(m instanceof SystemMessage))
            .slice(-windowSize);
    }
}
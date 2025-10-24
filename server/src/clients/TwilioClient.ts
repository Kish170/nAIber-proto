import Twilio, { twiml } from "twilio";

export interface TwilioConfigs {
    accountSid: string;
    authToken: string;
    phoneNumber: string;
    baseUrl: string;
    streamUrl: string;
}

export interface CreateCallParams {
    to: string;
    agentId: string;
}

export interface UpdateCallParams {
    callSid: string;
    twiml: string;
}

export interface CreateConferenceParams {
    to: string;
    conferenceName: string;
    startOnEnter?: boolean;
    endOnExit?: boolean;
}

export interface CallResult {
    success: boolean;
    message: string;
    callSid?: string;
    error?: string;
}

export interface CallInfo {
    sid: string;
    to: string;
    from: string;
    status: string;
}

export class TwilioClient {
    private client: ReturnType<typeof Twilio>;
    private configs: TwilioConfigs;

    constructor(configs: TwilioConfigs) {
        this.configs = configs;
        this.client = Twilio(configs.accountSid, configs.authToken);
    }

    async createCall(params: CreateCallParams): Promise<CallResult> {
        try {
            const { to, agentId } = params;

            const twimlUrl = `${this.configs.baseUrl}/twiml?agent_id=${agentId}`;

            const call = await this.client.calls.create({
                from: this.configs.phoneNumber,
                to: to,
                url: twimlUrl
            });

            return {
                success: true,
                message: 'Call initiated successfully',
                callSid: call.sid
            };
        } catch (error) {
            console.error('[TwilioClient] Error creating call:', error);
            return {
                success: false,
                message: 'Failed to initiate call',
                error: error instanceof Error ? error.message : 'Unknown error'
            };
        }
    }

    async getCallInfo(callSid: string): Promise<CallInfo> {
        try {
            const call = await this.client.calls(callSid).fetch();

            return {
                sid: call.sid,
                to: call.to,
                from: call.from,
                status: call.status
            };
        } catch (error) {
            console.error('[TwilioClient] Error fetching call info:', error);
            throw new Error(`Failed to fetch call info for ${callSid}`);
        }
    }

    async updateCall(params: UpdateCallParams): Promise<CallResult> {
        try {
            const { callSid, twiml } = params;

            if (!callSid || !twiml) {
                throw new Error('callSid and twiml are required parameters');
            }

            await this.client.calls(callSid).update({
                twiml: twiml
            });

            return {
                success: true,
                message: 'Call updated successfully',
                callSid: callSid
            };
        } catch (error) {
            console.error('[TwilioClient] Error updating call:', error);
            return {
                success: false,
                message: 'Failed to update call',
                error: error instanceof Error ? error.message : 'Unknown error'
            };
        }
    }

    async createConferenceCall(params: CreateConferenceParams): Promise<CallResult> {
        try {
            const { to, conferenceName, startOnEnter = true, endOnExit = true } = params;

            const voiceResponse = new twiml.VoiceResponse();
            const dial = voiceResponse.dial();
            dial.conference({
                startConferenceOnEnter: startOnEnter,
                endConferenceOnExit: endOnExit
            }, conferenceName);

            const call = await this.client.calls.create({
                to: to,
                from: this.configs.phoneNumber,
                twiml: voiceResponse.toString()
            });

            return {
                success: true,
                message: 'Conference call created successfully',
                callSid: call.sid
            };
        } catch (error) {
            console.error('[TwilioClient] Error creating conference call:', error);
            return {
                success: false,
                message: 'Failed to create conference call',
                error: error instanceof Error ? error.message : 'Unknown error'
            };
        }
    }

    async transferToConference(
        currentCallSid: string,
        transferToNumber: string,
        conferenceName: string,
        holdMessage: string = "Please hold while we connect you to an agent"
    ): Promise<CallResult> {
        try {
            const voiceResponse = new twiml.VoiceResponse();
            voiceResponse.say(holdMessage);
            const dial = voiceResponse.dial();
            dial.conference({
                startConferenceOnEnter: true,
                endConferenceOnExit: true
            }, conferenceName);

            await this.client.calls(currentCallSid).update({
                twiml: voiceResponse.toString()
            });

            const transferTwiml = `<Response><Dial><Conference>${conferenceName}</Conference></Dial></Response>`;

            const transferCall = await this.client.calls.create({
                to: transferToNumber,
                from: this.configs.phoneNumber,
                twiml: transferTwiml
            });

            return {
                success: true,
                message: 'Call transferred to conference successfully',
                callSid: transferCall.sid
            };
        } catch (error) {
            console.error('[TwilioClient] Error transferring to conference:', error);
            return {
                success: false,
                message: 'Failed to transfer call to conference',
                error: error instanceof Error ? error.message : 'Unknown error'
            };
        }
    }

    generateStreamTwiml(agentId: string): string {
        if (!agentId) {
            return this.generateErrorTwiml('Missing agent configuration');
        }

        return `
            <Response>
            <Connect>
                <Stream url="${this.configs.streamUrl}">
                <Parameter name="agent_id" value="${agentId}" />
                </Stream>
            </Connect>
            </Response>
        `.trim();
    }

    generateErrorTwiml(message: string = 'I\'m sorry, there was a technical issue. Please try calling again.'): string {
        return `
            <Response>
            <Say>${message}</Say>
            </Response>
        `.trim();
    }

    generateHangupTwiml(message?: string): string {
        const voiceResponse = new twiml.VoiceResponse();
        if (message) {
            voiceResponse.say(message);
        }
        voiceResponse.hangup();
        return voiceResponse.toString();
    }

    async endCall(callSid: string): Promise<CallResult> {
        try {
            await this.client.calls(callSid).update({
                status: 'completed'
            });

            return {
                success: true,
                message: 'Call ended successfully',
                callSid: callSid
            };
        } catch (error) {
            console.error('[TwilioClient] Error ending call:', error);
            return {
                success: false,
                message: 'Failed to end call',
                error: error instanceof Error ? error.message : 'Unknown error'
            };
        }
    }

    getPhoneNumber(): string {
        return this.configs.phoneNumber;
    }

    isConfigured(): boolean {
        return !!(
            this.configs.accountSid &&
            this.configs.authToken &&
            this.configs.phoneNumber &&
            this.configs.baseUrl &&
            this.configs.streamUrl
        );
    }
}
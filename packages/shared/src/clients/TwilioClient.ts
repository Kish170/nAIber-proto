import Twilio from "twilio";

export interface TwilioConfigs {
    accountSid: string;
    authToken: string;
    agentNumber?: string;
    baseUrl?: string;
    streamUrl?: string;
}

export interface UpdateCallParams {
    callSid: string;
    twiml: string;
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

    async createCall(to: string): Promise<CallResult> {
        try {
            const twimlUrl = `${this.configs.baseUrl}/twiml`;
            console.log('[TwilioClient] Creating call with TwiML URL:', twimlUrl);

            const call = await this.client.calls.create({
                from: this.configs.agentNumber!,
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

            await this.client.calls(callSid).update({ twiml });

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

    async endCall(callSid: string): Promise<CallResult> {
        try {
            await this.client.calls(callSid).update({ status: 'completed' });

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

    generateStreamTwiml(agentId: string): string {
        if (!agentId) {
            return this.generateErrorTwiml('Missing agent configuration');
        }

        const audioParameters = `
            <Parameter name="stream_sample_rate" value="8000"/>
            <Parameter name="stream_format" value="mulaw"/>
        `;

        const elevenLabsParameter = `<Parameter name="agent_id" value="${agentId}"/>`;

        return `
            <Response>
                <Connect>
                    <Stream url="${this.configs.streamUrl}">
                        ${audioParameters}
                        ${elevenLabsParameter}
                    </Stream>
                </Connect>
            </Response>
        `.trim();
    }

    generateErrorTwiml(message: string = "I'm sorry, there was a technical issue. Please try calling again."): string {
        return `
            <Response>
            <Say>${message}</Say>
            </Response>
        `.trim();
    }

    getPhoneNumber(): string {
        return this.configs.agentNumber ?? '';
    }
}

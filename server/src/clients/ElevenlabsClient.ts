import axios, { AxiosInstance } from 'axios';
import { buildFirstMessage, buildSystemPrompt } from '../tools/SystemPrompts';
import { UserProfile } from "../repositories/UserRespository";

export interface ElevenLabsConfigs{
    apiKey: string;
    voiceID: string;
    agentID: string;
    modelID: string;
    audioFormat: string;
    sampleRate: string;
    baseUrl: string;
}

export class ElevenLabsClient {
    private client: AxiosInstance;
    private configs: ElevenLabsConfigs;


    constructor(configs: ElevenLabsConfigs) {
        this.configs = configs;
        this.client = axios.create({
            baseURL: configs.baseUrl,
            headers: this.getElevenLabHeaders()
        });
    }

    private getElevenLabHeaders() {
        return {
            'Content-Type': 'application/json',
            'xi-api-key': process.env.ELEVENLABS_API_KEY!,
        }
    }

    private async getSignedURL(): Promise<string> {
        try {
            const response = await this.client.get(`get_signed_url?agent_id=${this.configs.agentID}`)
            return response.data.signed_url
        } catch (error) {
            console.error('[ElevenLabs] Failed to connect:', error);
            throw new Error("Unable to get signed url")
        }
    }

    async initializeWSServer(userProfile: UserProfile) {
        try {
            const signedURL = await this.getSignedURL();
            const systemPrompt = buildSystemPrompt(userProfile);
            const firstMesage = buildFirstMessage(userProfile);
            const onConnect = await this.wsOpenEvent();
            const onDisconnect = await this.wsCloseEvent();
            const onMessage = await this.wsMessageEvent();
            const onError = await this.wsErrorEvent();
            const onStatusChange = await this.wsStatusChangeEvent();
            const onModeChange = await this.wsModeChangeEvent();
            const onCanSendFeedbackChange = await this.wsCanSendFeedbackChangeEvent();

            const { Conversation } = await import('@elevenlabs/client');
            const elevenLabsWs = await Conversation.startSession({
                signedURL,
                agentId: this.configs.agentID,
                connectionType: 'websocket',
                agent: {
                    prompt: {
                        prompt: systemPrompt
                    },
                    firstMessage: firstMesage,
                    language: "en"
                },
                tts: {
                    voicdId: this.configs.voiceID
                },
                onConnect: onConnect,
                onDisconnect: onDisconnect,
                onMessage: onMessage,
                onError: onError,
                onCanSendFeedbackChange: onCanSendFeedbackChange,
                onStatusChange: onStatusChange,
                onModeChange: onModeChange
            });

        } catch (error) {
            console.error('[ElevenLabs] Failed to connect server:', error);
            throw new Error("Unable to setup ws server")
        }
    }

    private async wsOpenEvent() {
        
    }

    private async wsMessageEvent() {
        
    }

    private async wsErrorEvent() {
        
    }

    private async wsCloseEvent() {
        
    }

    private async wsStatusChangeEvent() {
        
    }

    private async wsModeChangeEvent() {
        
    }

    private async wsCanSendFeedbackChangeEvent() {
        
    }

    // async getTranscript(conversationID: string, retries =) {

    // } may not need can use post webhook


}
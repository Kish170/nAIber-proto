import { UserProfile } from "@naiber/shared";
import { PostCallService } from '../services/PostCallService.js';

export interface ConversationMetrics {
    convai_llm_service_ttfb?: {
        elapsed_time: number;
    };
    convai_llm_service_ttf_sentence?: {
        elapsed_time: number;
    };
}

export interface TranscriptTurn {
    role: 'agent' | 'user';
    message: string;
    tool_calls: any | null;
    tool_results: any | null;
    feedback: any | null;
    time_in_call_secs: number;
    conversation_turn_metrics: ConversationMetrics | null;
}

export interface DeletionSettings {
    deletion_time_unix_secs: number;
    deleted_logs_at_time_unix_secs: number | null;
    deleted_audio_at_time_unix_secs: number | null;
    deleted_transcript_at_time_unix_secs: number | null;
    delete_transcript_and_pii: boolean;
    delete_audio: boolean;
}

export interface CallFeedback {
    overall_score: number | null;
    likes: number;
    dislikes: number;
}

export interface CallMetadata {
    start_time_unix_secs: number;
    call_duration_secs: number;
    cost: number;
    deletion_settings: DeletionSettings;
    feedback: CallFeedback;
    authorization_method: string;
    charging?: {
        dev_discount?: boolean;
    };
    termination_reason: string;
}

export interface DataCollectionResults {
    conversationHighlights: string[];
    conversationTopics: string[];
}

export interface CallAnalysis {
    evaluation_criteria_results: Record<string, any>;
    data_collection_results: DataCollectionResults;
    call_successful: string;
    transcript_summary: string;
}

export interface ConversationConfigOverride {
    agent: {
        prompt: string | null;
        first_message: string | null;
        language: string;
    };
    tts: {
        voice_id: string | null;
    };
}

export interface ConversationInitiationClientData {
    conversation_config_override: ConversationConfigOverride;
    custom_llm_extra_body: Record<string, any>;
    dynamic_variables: Record<string, any>;
}

export interface PostCallTranscriptionData {
    agent_id: string;
    conversation_id: string;
    status: string;
    user_id: string;
    user_phone_number?: string; // Phone number of the user who was called
    transcript: TranscriptTurn[];
    metadata: CallMetadata;
    analysis: CallAnalysis;
    conversation_initiation_client_data: ConversationInitiationClientData;
}

export interface PostCallTranscriptionWebhook {
    type: 'post_call_transcription';
    event_timestamp: number;
    data: PostCallTranscriptionData;
}

export async function postCallUpdate(webhook: PostCallTranscriptionWebhook): Promise<void> {
    try {
        console.log('[PostCallController] Processing webhook for conversation:', webhook.data.conversation_id);

        if (!webhook.data) {
            throw new Error('Webhook data is missing');
        }

        const conversationId = webhook.data.conversation_id;
        if (!conversationId) {
            throw new Error('Conversation ID is missing');
        }

        const phoneNumber = webhook.data.user_phone_number;
        if (!phoneNumber) {
            throw new Error('User phone number is missing from webhook data');
        }

        console.log('[PostCallController] Loading user profile for phone:', phoneNumber);
        const userProfile = await UserProfile.loadByPhone(phoneNumber);
        if (!userProfile) {
            throw new Error(`User profile not found for phone: ${phoneNumber}`);
        }

        if (!webhook.data.transcript || webhook.data.transcript.length === 0) {
            console.warn('[PostCallController] No transcript found for conversation:', conversationId);
            return;
        }

        const transcriptSummary = webhook.data.analysis?.transcript_summary;
        if (!transcriptSummary) {
            console.warn('[PostCallController] No transcript summary available');
        }

        const dataCollectionResults = webhook.data.analysis?.data_collection_results;
        const conversationTopics = dataCollectionResults?.conversationTopics || [];
        const conversationHighlights = dataCollectionResults?.conversationHighlights || [];

        if (conversationTopics.length === 0) {
            console.warn('[PostCallController] No conversation topics extracted');
        }
        if (conversationHighlights.length === 0) {
            console.warn('[PostCallController] No conversation highlights extracted');
        }

        console.log('[PostCallController] Webhook validation passed:', {
            conversationId,
            userProfileId: userProfile.id,
            transcriptLength: webhook.data.transcript.length,
            topicsCount: conversationTopics.length,
            highlightsCount: conversationHighlights.length
        });

        const postCallService = new PostCallService(userProfile.getData());

        console.log('[PostCallController] Saving conversation summary...');
        await postCallService.generateAndSaveConversationSummary(
            userProfile.id,
            conversationId,
            transcriptSummary || '',
            conversationTopics,
            conversationHighlights
        );
        console.log('[PostCallController] Conversation summary saved');

        console.log('[PostCallController] Updating conversation topics...');
        await postCallService.updateConversationTopicData();
        console.log('[PostCallController] Conversation topics updated');

        console.log('[PostCallController] Updating vector database...');
        await postCallService.updateVectorDB();
        console.log('[PostCallController] Vector database updated');

        console.log('[PostCallController] Post-call processing completed successfully for conversation:', conversationId);

    } catch (error) {
        console.error('[PostCallController] Error processing webhook:', error);
        console.error('[PostCallController] Webhook data:', JSON.stringify(webhook, null, 2));
        throw error;
    }
}
